package com.hisaab.backend.dto;

import java.time.LocalDateTime;
import java.util.List;

public record GroupResponse(
        Long id,
        String name,
        String description,
        String inviteCode,
        LocalDateTime createdAt,
        List<MemberResponse> members
) {
}
