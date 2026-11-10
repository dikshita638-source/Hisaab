package com.hisaab.backend.dto;

import java.math.BigDecimal;

public record ShareResponse(
        Long memberId,
        String memberName,
        BigDecimal amount
) {
}
