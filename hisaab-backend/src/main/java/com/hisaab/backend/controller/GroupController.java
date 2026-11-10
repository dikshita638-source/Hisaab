package com.hisaab.backend.controller;

import com.hisaab.backend.dto.GroupRequest;
import com.hisaab.backend.dto.GroupResponse;
import com.hisaab.backend.service.GroupService;
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
@RequestMapping("/api/groups")
public class GroupController {

    private final GroupService groupService;

    public GroupController(GroupService groupService) {
        this.groupService = groupService;
    }

    @GetMapping
    public List<GroupResponse> getAll() {
        return groupService.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public GroupResponse create(@Valid @RequestBody GroupRequest request) {
        return groupService.create(request);
    }

    @GetMapping("/{id}")
    public GroupResponse getById(@PathVariable Long id) {
        return groupService.findById(id);
    }

    @GetMapping("/code/{inviteCode}")
    public GroupResponse getByInviteCode(@PathVariable String inviteCode) {
        return groupService.findByInviteCode(inviteCode);
    }

    @PutMapping("/{id}")
    public GroupResponse update(@PathVariable Long id, @Valid @RequestBody GroupRequest request) {
        return groupService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        groupService.delete(id);
    }
}
