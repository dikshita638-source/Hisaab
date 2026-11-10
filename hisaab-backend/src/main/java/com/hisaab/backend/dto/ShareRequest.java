package com.hisaab.backend.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record ShareRequest(
        @NotNull(message = "Member id is required")
        Long memberId,

        @DecimalMin(value = "0.00", message = "Share value cannot be negative")
        BigDecimal value
) {
}
