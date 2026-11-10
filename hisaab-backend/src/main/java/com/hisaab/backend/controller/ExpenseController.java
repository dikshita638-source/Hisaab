package com.hisaab.backend.controller;

import com.hisaab.backend.dto.ExpenseRequest;
import com.hisaab.backend.dto.ExpenseResponse;
import com.hisaab.backend.service.ExpenseService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public class ExpenseController {

    private final ExpenseService expenseService;

    public ExpenseController(ExpenseService expenseService) {
        this.expenseService = expenseService;
    }

    @GetMapping("/groups/{groupId}/expenses")
    public List<ExpenseResponse> list(@PathVariable Long groupId) {
        return expenseService.list(groupId);
    }

    @PostMapping("/groups/{groupId}/expenses")
    @ResponseStatus(HttpStatus.CREATED)
    public ExpenseResponse create(@PathVariable Long groupId, @Valid @RequestBody ExpenseRequest request) {
        return expenseService.create(groupId, request);
    }

    @GetMapping("/expenses/{id}")
    public ExpenseResponse getById(@PathVariable Long id) {
        return expenseService.findById(id);
    }

    @PutMapping("/expenses/{id}")
    public ExpenseResponse update(@PathVariable Long id, @Valid @RequestBody ExpenseRequest request) {
        return expenseService.update(id, request);
    }

    @DeleteMapping("/expenses/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        expenseService.delete(id);
    }
}
