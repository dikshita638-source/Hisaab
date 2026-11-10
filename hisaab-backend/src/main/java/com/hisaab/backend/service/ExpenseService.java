package com.hisaab.backend.service;

import com.hisaab.backend.dto.ExpenseRequest;
import com.hisaab.backend.dto.ExpenseResponse;
import com.hisaab.backend.dto.ShareRequest;
import com.hisaab.backend.entity.Expense;
import com.hisaab.backend.entity.ExpenseShare;
import com.hisaab.backend.entity.Group;
import com.hisaab.backend.entity.Member;
import com.hisaab.backend.entity.SplitType;
import com.hisaab.backend.exception.BadRequestException;
import com.hisaab.backend.exception.ResourceNotFoundException;
import com.hisaab.backend.mapper.DtoMapper;
import com.hisaab.backend.repository.ExpenseRepository;
import com.hisaab.backend.repository.MemberRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@Transactional
public class ExpenseService {

    private final ExpenseRepository expenseRepository;
    private final MemberRepository memberRepository;
    private final GroupService groupService;
    private final SplitCalculator splitCalculator;

    public ExpenseService(ExpenseRepository expenseRepository,
                          MemberRepository memberRepository,
                          GroupService groupService,
                          SplitCalculator splitCalculator) {
        this.expenseRepository = expenseRepository;
        this.memberRepository = memberRepository;
        this.groupService = groupService;
        this.splitCalculator = splitCalculator;
    }

    public ExpenseResponse create(Long groupId, ExpenseRequest request) {
        Group group = groupService.getGroup(groupId);
        List<Member> members = getGroupMembers(groupId);
        Member paidBy = getPayer(request.paidByMemberId(), groupId);

        Expense expense = new Expense();
        expense.setGroup(group);
        expense.setDescription(request.description().trim());
        expense.setAmount(money(request.amount()));
        expense.setPaidBy(paidBy);
        expense.setSplitType(request.splitType());
        expense.setExpenseDate(request.expenseDate() != null ? request.expenseDate() : LocalDate.now());

        addCalculatedShares(expense, members, request);

        Expense saved = expenseRepository.save(expense);
        return DtoMapper.toExpenseResponse(saved);
    }

    public ExpenseResponse update(Long expenseId, ExpenseRequest request) {
        Expense expense = getExpense(expenseId);
        Long currentGroupId = expense.getGroup().getId();
        Long targetGroupId = request.groupId() != null ? request.groupId() : currentGroupId;
        Group targetGroup = groupService.getGroup(targetGroupId);

        List<Member> members = getGroupMembers(targetGroupId);
        Member paidBy = getPayer(request.paidByMemberId(), targetGroupId);

        if (!currentGroupId.equals(targetGroupId)) {
            expense.setGroup(targetGroup);
        }
        expense.setDescription(request.description().trim());
        expense.setAmount(money(request.amount()));
        expense.setPaidBy(paidBy);
        expense.setSplitType(request.splitType());
        expense.setExpenseDate(request.expenseDate() != null ? request.expenseDate() : expense.getExpenseDate());

        expense.getShares().clear();
        expenseRepository.saveAndFlush(expense);

        addCalculatedShares(expense, members, request);

        Expense saved = expenseRepository.save(expense);
        return DtoMapper.toExpenseResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<ExpenseResponse> list(Long groupId) {
        groupService.getGroup(groupId);

        return expenseRepository.findByGroupIdOrderByExpenseDateDescCreatedAtDesc(groupId).stream()
                .map(DtoMapper::toExpenseResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public ExpenseResponse findById(Long id) {
        return DtoMapper.toExpenseResponse(getExpense(id));
    }

    public void delete(Long expenseId) {
        Expense expense = getExpense(expenseId);
        expenseRepository.delete(expense);
    }

    @Transactional(readOnly = true)
    public Expense getExpense(Long id) {
        return expenseRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Expense not found with id " + id));
    }

    private List<Member> getGroupMembers(Long groupId) {
        List<Member> members = memberRepository.findByGroupIdOrderByNameAsc(groupId);
        if (members.isEmpty()) {
            throw new BadRequestException("Add at least one member before adding an expense");
        }
        return members;
    }

    private Member getPayer(Long paidByMemberId, Long groupId) {
        return memberRepository.findByIdAndGroupId(paidByMemberId, groupId)
                .orElseThrow(() -> new BadRequestException("The payer must be a member of this group"));
    }

    private void addCalculatedShares(Expense expense, List<Member> members, ExpenseRequest request) {
        List<ShareRequest> shareRequests = request.shares() == null ? List.of() : request.shares();

        List<Member> participants;
        List<BigDecimal> values;

        if (request.splitType() == SplitType.EQUAL) {
            participants = shareRequests.isEmpty()
                    ? new ArrayList<>(members)
                    : resolveParticipants(shareRequests, members);
            values = List.of();
        } else {
            if (shareRequests.isEmpty()) {
                throw new BadRequestException("Shares are required for a " + request.splitType() + " split");
            }
            participants = resolveParticipants(shareRequests, members);
            values = shareRequests.stream().map(ShareRequest::value).toList();
        }

        List<BigDecimal> amounts = splitCalculator.calculate(
                expense.getAmount(),
                request.splitType(),
                participants.size(),
                values
        );

        for (int i = 0; i < participants.size(); i++) {
            ExpenseShare share = new ExpenseShare();
            share.setMember(participants.get(i));
            share.setShareAmount(amounts.get(i));
            expense.addShare(share);
        }
    }

    private List<Member> resolveParticipants(List<ShareRequest> shareRequests, List<Member> members) {
        Map<Long, Member> memberById = members.stream()
                .collect(Collectors.toMap(
                        Member::getId,
                        member -> member,
                        (first, second) -> first,
                        LinkedHashMap::new
                ));

        Set<Long> seen = new HashSet<>();
        List<Member> participants = new ArrayList<>();

        for (ShareRequest shareRequest : shareRequests) {
            if (shareRequest == null || shareRequest.memberId() == null) {
                throw new BadRequestException("Each share must include a memberId");
            }
            if (!seen.add(shareRequest.memberId())) {
                throw new BadRequestException("Duplicate member in shares: " + shareRequest.memberId());
            }

            Member member = memberById.get(shareRequest.memberId());
            if (member == null) {
                throw new BadRequestException(
                        "Member " + shareRequest.memberId() + " does not belong to this group"
                );
            }
            participants.add(member);
        }
        return participants;
    }

    private BigDecimal money(BigDecimal amount) {
        return amount.setScale(2, RoundingMode.HALF_UP);
    }
}
