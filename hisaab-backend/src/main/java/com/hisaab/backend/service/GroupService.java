package com.hisaab.backend.service;

import com.hisaab.backend.dto.GroupRequest;
import com.hisaab.backend.dto.GroupResponse;
import com.hisaab.backend.entity.Group;
import com.hisaab.backend.exception.ResourceNotFoundException;
import com.hisaab.backend.mapper.DtoMapper;
import com.hisaab.backend.repository.ExpenseRepository;
import com.hisaab.backend.repository.ExpenseShareRepository;
import com.hisaab.backend.repository.GroupRepository;
import com.hisaab.backend.repository.MemberRepository;
import com.hisaab.backend.repository.SettlementPaymentRepository;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
@Transactional
public class GroupService {

    private final GroupRepository groupRepository;
    private final MemberRepository memberRepository;
    private final ExpenseRepository expenseRepository;
    private final ExpenseShareRepository expenseShareRepository;
    private final SettlementPaymentRepository settlementPaymentRepository;

    public GroupService(GroupRepository groupRepository,
                        MemberRepository memberRepository,
                        ExpenseRepository expenseRepository,
                        ExpenseShareRepository expenseShareRepository,
                        SettlementPaymentRepository settlementPaymentRepository) {
        this.groupRepository = groupRepository;
        this.memberRepository = memberRepository;
        this.expenseRepository = expenseRepository;
        this.expenseShareRepository = expenseShareRepository;
        this.settlementPaymentRepository = settlementPaymentRepository;
    }

    public GroupResponse create(GroupRequest request) {
        Group group = new Group();
        group.setName(request.name().trim());
        group.setDescription(request.description());
        group.setInviteCode(generateUniqueInviteCode());

        Group saved = groupRepository.save(group);
        return DtoMapper.toGroupResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<GroupResponse> findAll() {
        return groupRepository.findAll(Sort.by(Sort.Direction.DESC, "createdAt")).stream()
                .map(DtoMapper::toGroupResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public GroupResponse findById(Long id) {
        return DtoMapper.toGroupResponse(getGroup(id));
    }

    @Transactional(readOnly = true)
    public GroupResponse findByInviteCode(String inviteCode) {
        Group group = groupRepository.findByInviteCode(inviteCode.trim().toUpperCase(Locale.ROOT))
                .orElseThrow(() -> new ResourceNotFoundException("No group found with invite code " + inviteCode));
        return DtoMapper.toGroupResponse(group);
    }

    public GroupResponse update(Long id, GroupRequest request) {
        Group group = getGroup(id);
        group.setName(request.name().trim());
        group.setDescription(request.description());
        return DtoMapper.toGroupResponse(group);
    }

    public void delete(Long id) {
        getGroup(id);

        expenseShareRepository.deleteByGroupId(id);
        expenseRepository.deleteByGroupId(id);
        settlementPaymentRepository.deleteByGroupId(id);
        memberRepository.deleteByGroupId(id);
        groupRepository.deleteGroupById(id);
    }

    @Transactional(readOnly = true)
    public Group getGroup(Long id) {
        return groupRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Group not found with id " + id));
    }

    private String generateUniqueInviteCode() {
        for (int attempt = 0; attempt < 20; attempt++) {
            String code = UUID.randomUUID()
                    .toString()
                    .replace("-", "")
                    .substring(0, 8)
                    .toUpperCase(Locale.ROOT);

            if (!groupRepository.existsByInviteCode(code)) {
                return code;
            }
        }
        throw new IllegalStateException("Could not generate a unique invite code");
    }
}
