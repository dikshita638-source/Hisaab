package com.hisaab.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ProfileRequest(
        @NotBlank(message = "Display name is required")
        @Size(max = 100, message = "Display name must be at most 100 characters")
        String displayName,

        @NotBlank(message = "Currency is required")
        @Pattern(regexp = "INR|USD|EUR|GBP", message = "Currency must be INR, USD, EUR or GBP")
        String currency
) {
}
