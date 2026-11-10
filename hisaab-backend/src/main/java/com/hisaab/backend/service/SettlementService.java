package com.hisaab.backend.service;

import com.hisaab.backend.dto.BalanceResponse;
import com.hisaab.backend.dto.SettlementResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class SettlementService {

    private final BalanceService balanceService;

    public SettlementService(BalanceService balanceService) {
        this.balanceService = balanceService;
    }

    public List<SettlementResponse> getSettlements(Long groupId) {
        List<BalanceResponse> balances = balanceService.getBalances(groupId);

        List<Account> debtors = new ArrayList<>();
        List<Account> creditors = new ArrayList<>();

        for (BalanceResponse balance : balances) {
            int comparison = balance.netBalance().compareTo(BigDecimal.ZERO);
            if (comparison < 0) {
                debtors.add(new Account(
                        balance.memberId(),
                        balance.memberName(),
                        balance.netBalance().negate()
                ));
            } else if (comparison > 0) {
                creditors.add(new Account(
                        balance.memberId(),
                        balance.memberName(),
                        balance.netBalance()
                ));
            }
        }

        debtors.sort(Comparator.comparing(Account::amount).reversed());
        creditors.sort(Comparator.comparing(Account::amount).reversed());

        List<SettlementResponse> settlements = new ArrayList<>();
        int debtorIndex = 0;
        int creditorIndex = 0;

        while (debtorIndex < debtors.size() && creditorIndex < creditors.size()) {
            Account debtor = debtors.get(debtorIndex);
            Account creditor = creditors.get(creditorIndex);

            BigDecimal amount = debtor.amount()
                    .min(creditor.amount())
                    .setScale(2, RoundingMode.HALF_UP);

            if (amount.compareTo(BigDecimal.ZERO) > 0) {
                settlements.add(new SettlementResponse(
                        debtor.memberId(),
                        debtor.memberName(),
                        creditor.memberId(),
                        creditor.memberName(),
                        amount
                ));
            }

            BigDecimal remainingDebt = debtor.amount()
                    .subtract(amount)
                    .setScale(2, RoundingMode.HALF_UP);
            BigDecimal remainingCredit = creditor.amount()
                    .subtract(amount)
                    .setScale(2, RoundingMode.HALF_UP);

            debtors.set(debtorIndex, new Account(debtor.memberId(), debtor.memberName(), remainingDebt));
            creditors.set(creditorIndex, new Account(creditor.memberId(), creditor.memberName(), remainingCredit));

            if (remainingDebt.compareTo(BigDecimal.ZERO) == 0) {
                debtorIndex++;
            }
            if (remainingCredit.compareTo(BigDecimal.ZERO) == 0) {
                creditorIndex++;
            }
        }

        return settlements;
    }

    private record Account(Long memberId, String memberName, BigDecimal amount) {
    }
}
