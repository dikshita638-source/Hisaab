package com.hisaab.backend.repository;

import com.hisaab.backend.entity.Group;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface GroupRepository extends JpaRepository<Group, Long> {

    Optional<Group> findByInviteCode(String inviteCode);

    boolean existsByInviteCode(String inviteCode);

    @Modifying
    @Query("delete from Group g where g.id = :id")
    void deleteGroupById(@Param("id") Long id);
}
