package com.hisaab.backend.repository;

import com.hisaab.backend.entity.Member;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface MemberRepository extends JpaRepository<Member, Long> {

    List<Member> findByGroupIdOrderByNameAsc(Long groupId);

    List<Member> findByCurrentUserTrue();

    Optional<Member> findByIdAndGroupId(Long id, Long groupId);

    boolean existsByGroupIdAndEmailIgnoreCase(Long groupId, String email);

    boolean existsByGroupIdAndEmailIgnoreCaseAndIdNot(Long groupId, String email, Long id);

    @Modifying
    @Query("delete from Member m where m.group.id = :groupId")
    void deleteByGroupId(@Param("groupId") Long groupId);
}
