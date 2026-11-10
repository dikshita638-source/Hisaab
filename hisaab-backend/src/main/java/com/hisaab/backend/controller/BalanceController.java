package com.hisaab.backend.controller;

import com.hisaab.backend.dto.BalanceResponse;
import com.hisaab.backend.dto.SettlementResponse;
import com.hisaab.backend.service.BalanceService;
import com.hisaab.backend.service.SettlementService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/groups/{groupId}")
public class BalanceController {

    private final BalanceService balanceService;
    private final SettlementService settlementService;

    public BalanceController(BalanceService balanceService, SettlementService settlementService) {
        this.balanceService = balanceService;
        this.settlementService = settlementService;
    }

    @GetMapping("/balances")
    public List<BalanceResponse> balances(@PathVariable Long groupId) {
        return balanceService.getBalances(groupId);
    }

    @GetMapping("/settlements")
    public List<SettlementResponse> settlements(@PathVariable Long groupId) {
        return settlementService.getSettlements(groupId);
    }
}
