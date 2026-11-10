package com.hisaab.backend.service;

import com.hisaab.backend.dto.MemberRequest;
import com.hisaab.backend.dto.MemberResponse;
import com.hisaab.backend.entity.Group;
import com.hisaab.backend.entity.Member;
import com.hisaab.backend.exception.BadRequestException;
import com.hisaab.backend.exception.ResourceNotFoundException;
import com.hisaab.backend.mapper.DtoMapper;
import com.hisaab.backend.repository.ExpenseRepository;
import com.hisaab.backend.repository.ExpenseShareRepository;
import com.hisaab.backend.repository.MemberRepository;
import com.hisaab.backend.repository.SettlementPaymentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;

@Service
@Transactional
public class MemberService {

    private final MemberRepository memberRepository;
    private final ExpenseRepository expenseRepository;
    private final ExpenseShareRepository expenseShareRepository;
    private final SettlementPaymentRepository settlementPaymentRepository;
    private final GroupService groupService;

    public MemberService(MemberRepository memberRepository,
                         ExpenseRepository expenseRepository,
                         ExpenseShareRepository expenseShareRepository,
                         SettlementPaymentRepository settlementPaymentRepository,
                         GroupService groupService) {
        this.memberRepository = memberRepository;
        this.expenseRepository = expenseRepository;
        this.expenseShareRepository = expenseShareRepository;
        this.settlementPaymentRepository = settlementPaymentRepository;
        this.groupService = groupService;
    }

    public MemberResponse add(Long groupId, MemberRequest request) {
        Group group = groupService.getGroup(groupId);
        String email = normalizeEmail(request.email());

        if (email != null && memberRepository.existsByGroupIdAndEmailIgnoreCase(groupId, email)) {
            throw new BadRequestException("A member with this email already exists in this group");
        }

        boolean currentUser = Boolean.TRUE.equals(request.currentUser());
        if (currentUser) {
            clearCurrentUser(groupId);
        }

        Member member = new Member();
        member.setGroup(group);
        member.setName(request.name().trim());
        member.setEmail(email);
        member.setCurrentUser(currentUser);

        return DtoMapper.toMemberResponse(memberRepository.save(member));
    }

    @Transactional(readOnly = true)
    public List<MemberResponse> list(Long groupId) {
        groupService.getGroup(groupId);

        return memberRepository.findByGroupIdOrderByNameAsc(groupId).stream()
                .map(DtoMapper::toMemberResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public MemberResponse findById(Long id) {
        return DtoMapper.toMemberResponse(getMember(id));
    }

    public MemberResponse update(Long memberId, MemberRequest request) {
        Member member = getMember(memberId);
        String email = normalizeEmail(request.email());

        if (email != null && memberRepository.existsByGroupIdAndEmailIgnoreCaseAndIdNot(
                member.getGroup().getId(), email, memberId)) {
            throw new BadRequestException("Another member with this email already exists in the group");
        }

        if (Boolean.TRUE.equals(request.currentUser())) {
            clearCurrentUser(member.getGroup().getId());
        }
        if (request.currentUser() != null) {
            member.setCurrentUser(request.currentUser());
        }

        member.setName(request.name().trim());
        member.setEmail(email);

        return DtoMapper.toMemberResponse(member);
    }

    public void delete(Long memberId) {
        Member member = getMember(memberId);

        if (expenseRepository.existsByPaidById(memberId)) {
            throw new BadRequestException(
                    "Cannot delete a member who has paid expenses. Delete or reassign those expenses first."
            );
        }
        if (expenseShareRepository.existsByMemberId(memberId)) {
            throw new BadRequestException(
                    "Cannot delete a member who is part of an expense split. Delete or update those expenses first."
            );
        }
        if (settlementPaymentRepository.existsByFromMemberIdOrToMemberId(memberId, memberId)) {
            throw new BadRequestException(
                    "Cannot delete a member who is part of a recorded payment. Delete those payments first."
            );
        }

        memberRepository.delete(member);
    }

    @Transactional(readOnly = true)
    public Member getMember(Long id) {
        return memberRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Member not found with id " + id));
    }

    private void clearCurrentUser(Long groupId) {
        for (Member member : memberRepository.findByGroupIdOrderByNameAsc(groupId)) {
            if (member.isCurrentUser()) {
                member.setCurrentUser(false);
            }
        }
    }

    private String normalizeEmail(String email) {
        if (email == null) {
            return null;
        }
        String trimmed = email.trim();
        return trimmed.isEmpty() ? null : trimmed.toLowerCase(Locale.ROOT);
    }
}
