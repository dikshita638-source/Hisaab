package com.hisaab.backend.dto;

import java.math.BigDecimal;

public record BalanceResponse(
        Long memberId,
        String memberName,
        BigDecimal totalPaid,
        BigDecimal totalOwed,
        BigDecimal netBalance
) {
}
