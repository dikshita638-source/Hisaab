package com.hisaab.backend.service;

import com.hisaab.backend.dto.ProfileRequest;
import com.hisaab.backend.dto.ProfileResponse;
import com.hisaab.backend.entity.AppProfile;
import com.hisaab.backend.entity.Member;
import com.hisaab.backend.repository.AppProfileRepository;
import com.hisaab.backend.repository.MemberRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

@Service
@Transactional
public class ProfileService {

    private static final long PROFILE_ID = 1L;

    private final AppProfileRepository appProfileRepository;
    private final MemberRepository memberRepository;

    public ProfileService(AppProfileRepository appProfileRepository, MemberRepository memberRepository) {
        this.appProfileRepository = appProfileRepository;
        this.memberRepository = memberRepository;
    }

    public ProfileResponse get() {
        return toResponse(getOrCreate());
    }

    public ProfileResponse update(ProfileRequest request) {
        AppProfile profile = getOrCreate();
        String name = request.displayName().trim();
        String currency = request.currency().trim().toUpperCase(Locale.ROOT);

        profile.setDisplayName(name);
        profile.setCurrency(currency);

        for (Member member : memberRepository.findByCurrentUserTrue()) {
            member.setName(name);
        }

        return toResponse(profile);
    }

    private AppProfile getOrCreate() {
        return appProfileRepository.findById(PROFILE_ID).orElseGet(() -> {
            AppProfile profile = new AppProfile();
            profile.setId(PROFILE_ID);
            profile.setDisplayName("Aarav");
            profile.setCurrency("INR");
            return appProfileRepository.save(profile);
        });
    }

    private ProfileResponse toResponse(AppProfile profile) {
        return new ProfileResponse(profile.getDisplayName(), profile.getCurrency());
    }
}
