package com.hisaab.backend.controller;

import com.hisaab.backend.dto.PaymentRequest;
import com.hisaab.backend.dto.PaymentResponse;
import com.hisaab.backend.service.SettlementPaymentService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public class SettlementPaymentController {

    private final SettlementPaymentService settlementPaymentService;

    public SettlementPaymentController(SettlementPaymentService settlementPaymentService) {
        this.settlementPaymentService = settlementPaymentService;
    }

    @GetMapping("/groups/{groupId}/payments")
    public List<PaymentResponse> list(@PathVariable Long groupId) {
        return settlementPaymentService.list(groupId);
    }

    @PostMapping("/groups/{groupId}/payments")
    @ResponseStatus(HttpStatus.CREATED)
    public PaymentResponse create(@PathVariable Long groupId, @Valid @RequestBody PaymentRequest request) {
        return settlementPaymentService.create(groupId, request);
    }

    @DeleteMapping("/payments/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        settlementPaymentService.delete(id);
    }
}
