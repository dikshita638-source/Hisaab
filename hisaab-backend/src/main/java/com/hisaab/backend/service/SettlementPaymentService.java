package com.hisaab.backend.service;

import com.hisaab.backend.dto.PaymentRequest;
import com.hisaab.backend.dto.PaymentResponse;
import com.hisaab.backend.entity.Group;
import com.hisaab.backend.entity.Member;
import com.hisaab.backend.entity.SettlementPayment;
import com.hisaab.backend.exception.BadRequestException;
import com.hisaab.backend.exception.ResourceNotFoundException;
import com.hisaab.backend.repository.MemberRepository;
import com.hisaab.backend.repository.SettlementPaymentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;

@Service
@Transactional
public class SettlementPaymentService {

    private final SettlementPaymentRepository settlementPaymentRepository;
    private final MemberRepository memberRepository;
    private final GroupService groupService;

    public SettlementPaymentService(SettlementPaymentRepository settlementPaymentRepository,
                                    MemberRepository memberRepository,
                                    GroupService groupService) {
        this.settlementPaymentRepository = settlementPaymentRepository;
        this.memberRepository = memberRepository;
        this.groupService = groupService;
    }

    public PaymentResponse create(Long groupId, PaymentRequest request) {
        Group group = groupService.getGroup(groupId);

        if (request.fromMemberId().equals(request.toMemberId())) {
            throw new BadRequestException("A person cannot pay themselves");
        }

        Member fromMember = getGroupMember(request.fromMemberId(), groupId);
        Member toMember = getGroupMember(request.toMemberId(), groupId);

        SettlementPayment payment = new SettlementPayment();
        payment.setGroup(group);
        payment.setFromMember(fromMember);
        payment.setToMember(toMember);
        payment.setAmount(request.amount().setScale(2, RoundingMode.HALF_UP));
        payment.setPaymentDate(request.paymentDate() != null ? request.paymentDate() : LocalDate.now());

        return toResponse(settlementPaymentRepository.save(payment));
    }

    @Transactional(readOnly = true)
    public List<PaymentResponse> list(Long groupId) {
        groupService.getGroup(groupId);

        return settlementPaymentRepository.findByGroupIdOrderByPaymentDateDescCreatedAtDesc(groupId).stream()
                .map(this::toResponse)
                .toList();
    }

    public void delete(Long paymentId) {
        SettlementPayment payment = settlementPaymentRepository.findById(paymentId)
                .orElseThrow(() -> new ResourceNotFoundException("Payment not found with id " + paymentId));
        settlementPaymentRepository.delete(payment);
    }

    private Member getGroupMember(Long memberId, Long groupId) {
        return memberRepository.findByIdAndGroupId(memberId, groupId)
                .orElseThrow(() -> new BadRequestException("Both members must belong to this group"));
    }

    private PaymentResponse toResponse(SettlementPayment payment) {
        BigDecimal amount = payment.getAmount().setScale(2, RoundingMode.HALF_UP);

        return new PaymentResponse(
                payment.getId(),
                payment.getGroup().getId(),
                payment.getFromMember().getId(),
                payment.getFromMember().getName(),
                payment.getToMember().getId(),
                payment.getToMember().getName(),
                amount,
                payment.getPaymentDate(),
                payment.getCreatedAt()
        );
    }
}
