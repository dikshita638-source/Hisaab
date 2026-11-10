package com.hisaab.backend.mapper;

import com.hisaab.backend.dto.ExpenseResponse;
import com.hisaab.backend.dto.GroupResponse;
import com.hisaab.backend.dto.MemberResponse;
import com.hisaab.backend.dto.ShareResponse;
import com.hisaab.backend.entity.Expense;
import com.hisaab.backend.entity.ExpenseShare;
import com.hisaab.backend.entity.Group;
import com.hisaab.backend.entity.Member;

import java.util.List;

public final class DtoMapper {

    private DtoMapper() {
    }

    public static MemberResponse toMemberResponse(Member member) {
        return new MemberResponse(
                member.getId(),
                member.getGroup().getId(),
                member.getName(),
                member.getEmail(),
                member.isCurrentUser(),
                member.getCreatedAt()
        );
    }

    public static GroupResponse toGroupResponse(Group group) {
        List<MemberResponse> members = group.getMembers().stream()
                .map(DtoMapper::toMemberResponse)
                .toList();

        return new GroupResponse(
                group.getId(),
                group.getName(),
                group.getDescription(),
                group.getInviteCode(),
                group.getCreatedAt(),
                members
        );
    }

    public static ShareResponse toShareResponse(ExpenseShare share) {
        return new ShareResponse(
                share.getMember().getId(),
                share.getMember().getName(),
                share.getShareAmount()
        );
    }

    public static ExpenseResponse toExpenseResponse(Expense expense) {
        List<ShareResponse> shares = expense.getShares().stream()
                .map(DtoMapper::toShareResponse)
                .toList();

        return new ExpenseResponse(
                expense.getId(),
                expense.getGroup().getId(),
                expense.getDescription(),
                expense.getAmount(),
                expense.getPaidBy().getId(),
                expense.getPaidBy().getName(),
                expense.getSplitType(),
                expense.getExpenseDate(),
                expense.getCreatedAt(),
                shares
        );
    }
}
