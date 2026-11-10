package com.hisaab.backend.dto;

import java.math.BigDecimal;

public record SettlementResponse(
        Long fromMemberId,
        String fromMemberName,
        Long toMemberId,
        String toMemberName,
        BigDecimal amount
) {
}
