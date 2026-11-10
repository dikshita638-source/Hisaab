package com.hisaab.backend.controller;

import com.hisaab.backend.dto.MemberRequest;
import com.hisaab.backend.dto.MemberResponse;
import com.hisaab.backend.service.MemberService;
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
public class MemberController {

    private final MemberService memberService;

    public MemberController(MemberService memberService) {
        this.memberService = memberService;
    }

    @GetMapping("/groups/{groupId}/members")
    public List<MemberResponse> list(@PathVariable Long groupId) {
        return memberService.list(groupId);
    }

    @PostMapping("/groups/{groupId}/members")
    @ResponseStatus(HttpStatus.CREATED)
    public MemberResponse add(@PathVariable Long groupId, @Valid @RequestBody MemberRequest request) {
        return memberService.add(groupId, request);
    }

    @GetMapping("/members/{id}")
    public MemberResponse getById(@PathVariable Long id) {
        return memberService.findById(id);
    }

    @PutMapping("/members/{id}")
    public MemberResponse update(@PathVariable Long id, @Valid @RequestBody MemberRequest request) {
        return memberService.update(id, request);
    }

    @DeleteMapping("/members/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        memberService.delete(id);
    }
}
