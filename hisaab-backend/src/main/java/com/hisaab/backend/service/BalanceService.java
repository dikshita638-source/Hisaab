package com.hisaab.backend.service;

import com.hisaab.backend.dto.BalanceResponse;
import com.hisaab.backend.entity.Expense;
import com.hisaab.backend.entity.ExpenseShare;
import com.hisaab.backend.entity.Member;
import com.hisaab.backend.entity.SettlementPayment;
import com.hisaab.backend.repository.ExpenseRepository;
import com.hisaab.backend.repository.MemberRepository;
import com.hisaab.backend.repository.SettlementPaymentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@Transactional(readOnly = true)
public class BalanceService {

    private static final BigDecimal ZERO = BigDecimal.ZERO.setScale(2);

    private final GroupService groupService;
    private final MemberRepository memberRepository;
    private final ExpenseRepository expenseRepository;
    private final SettlementPaymentRepository settlementPaymentRepository;

    public BalanceService(GroupService groupService,
                          MemberRepository memberRepository,
                          ExpenseRepository expenseRepository,
                          SettlementPaymentRepository settlementPaymentRepository) {
        this.groupService = groupService;
        this.memberRepository = memberRepository;
        this.expenseRepository = expenseRepository;
        this.settlementPaymentRepository = settlementPaymentRepository;
    }

    public List<BalanceResponse> getBalances(Long groupId) {
        groupService.getGroup(groupId);

        List<Member> members = memberRepository.findByGroupIdOrderByNameAsc(groupId);
        Map<Long, BigDecimal> paidByMember = new HashMap<>();
        Map<Long, BigDecimal> owedByMember = new HashMap<>();
        Map<Long, BigDecimal> paymentAdjustment = new HashMap<>();

        for (Member member : members) {
            paidByMember.put(member.getId(), ZERO);
            owedByMember.put(member.getId(), ZERO);
            paymentAdjustment.put(member.getId(), ZERO);
        }

        List<Expense> expenses = expenseRepository.findByGroupIdOrderByExpenseDateDescCreatedAtDesc(groupId);
        for (Expense expense : expenses) {
            paidByMember.merge(expense.getPaidBy().getId(), expense.getAmount(), BigDecimal::add);

            for (ExpenseShare share : expense.getShares()) {
                owedByMember.merge(share.getMember().getId(), share.getShareAmount(), BigDecimal::add);
            }
        }

        List<SettlementPayment> payments =
                settlementPaymentRepository.findByGroupIdOrderByPaymentDateDescCreatedAtDesc(groupId);
        for (SettlementPayment payment : payments) {
            paymentAdjustment.merge(payment.getFromMember().getId(), payment.getAmount(), BigDecimal::add);
            paymentAdjustment.merge(payment.getToMember().getId(), payment.getAmount().negate(), BigDecimal::add);
        }

        List<BalanceResponse> balances = new ArrayList<>();
        for (Member member : members) {
            BigDecimal totalPaid = paidByMember.getOrDefault(member.getId(), ZERO)
                    .setScale(2, RoundingMode.HALF_UP);
            BigDecimal totalOwed = owedByMember.getOrDefault(member.getId(), ZERO)
                    .setScale(2, RoundingMode.HALF_UP);
            BigDecimal netBalance = totalPaid
                    .subtract(totalOwed)
                    .add(paymentAdjustment.getOrDefault(member.getId(), ZERO))
                    .setScale(2, RoundingMode.HALF_UP);

            balances.add(new BalanceResponse(
                    member.getId(),
                    member.getName(),
                    totalPaid,
                    totalOwed,
                    netBalance
            ));
        }
        return balances;
    }
}
