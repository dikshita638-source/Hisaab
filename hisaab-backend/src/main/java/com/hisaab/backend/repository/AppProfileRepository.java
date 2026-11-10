package com.hisaab.backend.repository;

import com.hisaab.backend.entity.AppProfile;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppProfileRepository extends JpaRepository<AppProfile, Long> {
}
