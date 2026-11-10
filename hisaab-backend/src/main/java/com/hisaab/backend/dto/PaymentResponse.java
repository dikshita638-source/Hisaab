package com.hisaab.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record PaymentResponse(
        Long id,
        Long groupId,
        Long fromMemberId,
        String fromMemberName,
        Long toMemberId,
        String toMemberName,
        BigDecimal amount,
        LocalDate paymentDate,
        LocalDateTime createdAt
) {
}
