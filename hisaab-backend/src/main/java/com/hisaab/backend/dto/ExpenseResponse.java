package com.hisaab.backend.dto;

import com.hisaab.backend.entity.SplitType;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public record ExpenseResponse(
        Long id,
        Long groupId,
        String description,
        BigDecimal amount,
        Long paidByMemberId,
        String paidByMemberName,
        SplitType splitType,
        LocalDate expenseDate,
        LocalDateTime createdAt,
        List<ShareResponse> shares
) {
}
