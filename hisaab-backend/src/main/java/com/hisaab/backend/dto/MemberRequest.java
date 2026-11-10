package com.hisaab.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record MemberRequest(
        @NotBlank(message = "Member name is required")
        @Size(max = 100, message = "Member name must be at most 100 characters")
        String name,

        @Email(message = "Email must be valid")
        @Size(max = 150, message = "Email must be at most 150 characters")
        String email,

        Boolean currentUser
) {
}
