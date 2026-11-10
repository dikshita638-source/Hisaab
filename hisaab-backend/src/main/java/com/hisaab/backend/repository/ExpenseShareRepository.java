package com.hisaab.backend.repository;

import com.hisaab.backend.entity.ExpenseShare;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ExpenseShareRepository extends JpaRepository<ExpenseShare, Long> {

    boolean existsByMemberId(Long memberId);

    @Modifying
    @Query("delete from ExpenseShare s where s.expense.group.id = :groupId")
    void deleteByGroupId(@Param("groupId") Long groupId);
}
