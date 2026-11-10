package com.hisaab.backend.dto;

import java.time.LocalDateTime;

public record MemberResponse(
        Long id,
        Long groupId,
        String name,
        String email,
        boolean currentUser,
        LocalDateTime createdAt
) {
}
