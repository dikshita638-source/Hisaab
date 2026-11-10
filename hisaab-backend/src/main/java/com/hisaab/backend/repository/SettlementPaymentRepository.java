package com.hisaab.backend.repository;

import com.hisaab.backend.entity.SettlementPayment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface SettlementPaymentRepository extends JpaRepository<SettlementPayment, Long> {

    List<SettlementPayment> findByGroupIdOrderByPaymentDateDescCreatedAtDesc(Long groupId);

    boolean existsByFromMemberIdOrToMemberId(Long fromMemberId, Long toMemberId);

    @Modifying
    @Query("delete from SettlementPayment p where p.group.id = :groupId")
    void deleteByGroupId(@Param("groupId") Long groupId);
}
