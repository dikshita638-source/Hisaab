package com.hisaab.backend.repository;

import com.hisaab.backend.entity.Expense;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ExpenseRepository extends JpaRepository<Expense, Long> {

    @EntityGraph(attributePaths = {"paidBy", "shares", "shares.member"})
    List<Expense> findByGroupIdOrderByExpenseDateDescCreatedAtDesc(Long groupId);

    @EntityGraph(attributePaths = {"paidBy", "shares", "shares.member"})
    Optional<Expense> findById(Long id);

    boolean existsByPaidById(Long memberId);

    @Modifying
    @Query("delete from Expense e where e.group.id = :groupId")
    void deleteByGroupId(@Param("groupId") Long groupId);
}
