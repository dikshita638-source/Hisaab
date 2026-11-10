package com.hisaab.backend.service;

import com.hisaab.backend.entity.SplitType;
import com.hisaab.backend.exception.BadRequestException;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class SplitCalculatorTest {

    private final SplitCalculator calculator = new SplitCalculator();

    @Test
    void splitsEquallyWithoutLosingPaise() {
        List<BigDecimal> shares = calculator.calculate(
                new BigDecimal("100.00"),
                SplitType.EQUAL,
                3,
                List.of()
        );

        assertEquals(new BigDecimal("33.34"), shares.get(0));
        assertEquals(new BigDecimal("33.33"), shares.get(1));
        assertEquals(new BigDecimal("33.33"), shares.get(2));
        assertEquals(0, sum(shares).compareTo(new BigDecimal("100.00")));
    }

    @Test
    void splitsByPercentage() {
        List<BigDecimal> shares = calculator.calculate(
                new BigDecimal("200.00"),
                SplitType.PERCENTAGE,
                2,
                List.of(new BigDecimal("60"), new BigDecimal("40"))
        );

        assertEquals(new BigDecimal("120.00"), shares.get(0));
        assertEquals(new BigDecimal("80.00"), shares.get(1));
    }

    @Test
    void splitsByWeight() {
        List<BigDecimal> shares = calculator.calculate(
                new BigDecimal("90.00"),
                SplitType.WEIGHTED,
                3,
                List.of(BigDecimal.ONE, BigDecimal.ONE, BigDecimal.ONE)
        );

        assertEquals(new BigDecimal("30.00"), shares.get(0));
        assertEquals(new BigDecimal("30.00"), shares.get(1));
        assertEquals(new BigDecimal("30.00"), shares.get(2));
    }

    @Test
    void rejectsExactSharesThatDoNotAddUp() {
        assertThrows(BadRequestException.class, () -> calculator.calculate(
                new BigDecimal("100.00"),
                SplitType.EXACT,
                2,
                List.of(new BigDecimal("40.00"), new BigDecimal("50.00"))
        ));
    }

    private BigDecimal sum(List<BigDecimal> values) {
        return values.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
