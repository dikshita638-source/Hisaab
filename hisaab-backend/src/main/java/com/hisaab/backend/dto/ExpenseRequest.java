package com.hisaab.backend.dto;

import com.hisaab.backend.entity.SplitType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record ExpenseRequest(
        @NotBlank(message = "Expense description is required")
        @Size(max = 200, message = "Description must be at most 200 characters")
        String description,

        Long groupId,

        @NotNull(message = "Amount is required")
        @DecimalMin(value = "0.01", message = "Amount must be greater than zero")
        @Digits(integer = 10, fraction = 2, message = "Amount must have at most 2 decimal places")
        BigDecimal amount,

        @NotNull(message = "Payer member id is required")
        Long paidByMemberId,

        @NotNull(message = "Split type is required")
        SplitType splitType,

        LocalDate expenseDate,

        List<@Valid ShareRequest> shares
) {
}
