package com.hisaab.backend.service;

import com.hisaab.backend.entity.SplitType;
import com.hisaab.backend.exception.BadRequestException;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.IntStream;

@Component
public class SplitCalculator {

    private static final BigDecimal ONE_HUNDRED = new BigDecimal("100");
    private static final int MONEY_SCALE = 2;

    public List<BigDecimal> calculate(BigDecimal amount,
                                      SplitType splitType,
                                      int participantCount,
                                      List<BigDecimal> values) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BadRequestException("Expense amount must be greater than zero");
        }
        if (participantCount <= 0) {
            throw new BadRequestException("At least one participant is required");
        }
        if (splitType == null) {
            throw new BadRequestException("Split type is required");
        }

        return switch (splitType) {
            case EQUAL -> splitProportionally(amount, equalProportions(participantCount));
            case EXACT -> splitExactly(amount, values, participantCount);
            case PERCENTAGE -> splitByPercentages(amount, values, participantCount);
            case WEIGHTED -> splitByWeights(amount, values, participantCount);
        };
    }

    private List<BigDecimal> equalProportions(int count) {
        List<BigDecimal> proportions = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            proportions.add(BigDecimal.ONE);
        }
        return proportions;
    }

    private List<BigDecimal> splitExactly(BigDecimal amount, List<BigDecimal> values, int participantCount) {
        validateValues(values, participantCount, "Exact split");

        List<BigDecimal> scaled = values.stream()
                .map(value -> value.setScale(MONEY_SCALE, RoundingMode.HALF_UP))
                .toList();

        BigDecimal expected = amount.setScale(MONEY_SCALE, RoundingMode.HALF_UP);
        BigDecimal sum = scaled.stream().reduce(BigDecimal.ZERO, BigDecimal::add);

        if (sum.compareTo(expected) != 0) {
            throw new BadRequestException(
                    "Exact shares must add up to the expense amount. Expected " + expected + " but got " + sum
            );
        }
        return scaled;
    }

    private List<BigDecimal> splitByPercentages(BigDecimal amount, List<BigDecimal> values, int participantCount) {
        validateValues(values, participantCount, "Percentage split");

        BigDecimal totalPercentage = values.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        if (totalPercentage.compareTo(ONE_HUNDRED) != 0) {
            throw new BadRequestException("Percentages must add up to 100");
        }
        return splitProportionally(amount, values);
    }

    private List<BigDecimal> splitByWeights(BigDecimal amount, List<BigDecimal> values, int participantCount) {
        validateValues(values, participantCount, "Weighted split");

        BigDecimal totalWeight = values.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        if (totalWeight.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BadRequestException("Weights must add up to more than zero");
        }
        return splitProportionally(amount, values);
    }

    private void validateValues(List<BigDecimal> values, int participantCount, String label) {
        if (values == null || values.size() != participantCount) {
            throw new BadRequestException(label + " requires one value per participant");
        }
        for (BigDecimal value : values) {
            if (value == null) {
                throw new BadRequestException(label + " values cannot be empty");
            }
            if (value.compareTo(BigDecimal.ZERO) < 0) {
                throw new BadRequestException(label + " values cannot be negative");
            }
        }
    }

    private List<BigDecimal> splitProportionally(BigDecimal amount, List<BigDecimal> proportions) {
        BigDecimal totalProportion = proportions.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        if (totalProportion.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BadRequestException("The total of the split values must be greater than zero");
        }

        long totalCents = amount.movePointRight(MONEY_SCALE)
                .setScale(0, RoundingMode.HALF_UP)
                .longValueExact();

        List<Long> cents = new ArrayList<>(proportions.size());
        List<BigDecimal> fractions = new ArrayList<>(proportions.size());
        long assignedCents = 0L;

        for (BigDecimal proportion : proportions) {
            BigDecimal exactCents = BigDecimal.valueOf(totalCents)
                    .multiply(proportion)
                    .divide(totalProportion, 10, RoundingMode.DOWN);

            long flooredCents = exactCents.setScale(0, RoundingMode.FLOOR).longValueExact();
            cents.add(flooredCents);
            fractions.add(exactCents.subtract(BigDecimal.valueOf(flooredCents)));
            assignedCents += flooredCents;
        }

        long remainingCents = totalCents - assignedCents;
        List<Integer> order = IntStream.range(0, proportions.size())
                .boxed()
                .sorted(Comparator.comparing((Integer index) -> fractions.get(index)).reversed())
                .toList();

        for (int i = 0; i < remainingCents; i++) {
            int index = order.get(i % order.size());
            cents.set(index, cents.get(index) + 1);
        }

        List<BigDecimal> result = new ArrayList<>(cents.size());
        for (Long value : cents) {
            result.add(BigDecimal.valueOf(value).movePointLeft(MONEY_SCALE).setScale(MONEY_SCALE));
        }
        return result;
    }
}
