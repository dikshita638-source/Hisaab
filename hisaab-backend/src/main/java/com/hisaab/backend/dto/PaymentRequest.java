package com.hisaab.backend.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;

public record PaymentRequest(
        @NotNull(message = "Payer member id is required")
        Long fromMemberId,

        @NotNull(message = "Receiver member id is required")
        Long toMemberId,

        @NotNull(message = "Payment amount is required")
        @DecimalMin(value = "0.01", message = "Payment amount must be greater than zero")
        @Digits(integer = 10, fraction = 2, message = "Payment amount must have at most 2 decimal places")
        BigDecimal amount,

        LocalDate paymentDate
) {
}
