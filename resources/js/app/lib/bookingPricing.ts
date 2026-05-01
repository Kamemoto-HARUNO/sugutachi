import { formatCurrency, formatTravelTimeEstimate, formatWalkingTimeRange } from './discovery';
import type { BookingQuoteAppliedRuleCondition, BookingQuoteAppliedRuleRecord, BookingQuoteRecord } from './types';

const DEMAND_LEVEL_LABELS: Record<string, string> = {
    normal: '通常',
    busy: '混雑',
    peak: 'ピーク',
};

const RULE_TYPE_LABELS: Record<string, string> = {
    time_band: '時間帯',
    walking_time_range: '移動時間',
    demand_level: '需要レベル',
};

const OPERATOR_LABELS: Record<string, string> = {
    equals: '等しい',
    not_equals: '等しくない',
    in: 'いずれかに一致',
    not_in: 'いずれにも一致しない',
    gte: '以上',
    lte: '以下',
    between: '範囲指定',
};

function formatOperatorLabel(value: string | null | undefined): string {
    if (!value) {
        return '条件一致';
    }

    return OPERATOR_LABELS[value] ?? value;
}

function formatTimeBandCondition(condition: BookingQuoteAppliedRuleCondition): string {
    const startHour = typeof condition.start_hour === 'number' ? condition.start_hour : null;
    const endHour = typeof condition.end_hour === 'number' ? condition.end_hour : null;

    if (startHour === null || endHour === null) {
        return '時間帯条件';
    }

    return `${String(startHour).padStart(2, '0')}:00 - ${String(endHour).padStart(2, '0')}:00`;
}

function formatDiscreteCondition(
    condition: BookingQuoteAppliedRuleCondition,
    formatter: (value: string) => string,
): string {
    const operator = formatOperatorLabel(condition.operator);
    const value = typeof condition.value === 'string' ? formatter(condition.value) : null;
    const values = Array.isArray(condition.values)
        ? condition.values
            .filter((entry): entry is string => typeof entry === 'string')
            .map((entry) => formatter(entry))
        : [];

    const renderedValue = value ?? (values.length > 0 ? values.join(' / ') : null);

    return renderedValue ? `${operator} ${renderedValue}` : operator;
}

export function formatDemandLevelLabel(value: string | null | undefined): string {
    if (!value) {
        return '未設定';
    }

    return DEMAND_LEVEL_LABELS[value] ?? value;
}

export function formatDemandFeeRuleLabel(rule: BookingQuoteAppliedRuleRecord): string {
    if (!rule.rule_type) {
        return '需要加算ルール';
    }

    return RULE_TYPE_LABELS[rule.rule_type] ?? rule.rule_type;
}

export function formatDemandFeeRuleCondition(rule: BookingQuoteAppliedRuleRecord): string {
    switch (rule.rule_type) {
        case 'time_band':
            return formatTimeBandCondition(rule.condition);
        case 'walking_time_range':
            return formatDiscreteCondition(rule.condition, formatWalkingTimeRange);
        case 'demand_level':
            return formatDiscreteCondition(rule.condition, formatDemandLevelLabel);
        default:
            return '適用条件';
    }
}

export function formatDemandFeeAdjustmentAmount(amount: number): string {
    if (amount < 0) {
        return `-${formatCurrency(Math.abs(amount))}`;
    }

    return `+${formatCurrency(amount)}`;
}

export function getDemandFeeAppliedRules(quote: BookingQuoteRecord | null | undefined): BookingQuoteAppliedRuleRecord[] {
    return (quote?.applied_rules ?? []).filter((rule) => rule.bucket === 'demand_fee' && rule.applied_adjustment_amount !== 0);
}

export function buildDemandFeeContextItems(
    quote: BookingQuoteRecord | null | undefined,
): Array<{ label: string; value: string }> {
    if (!quote) {
        return [];
    }

    const items: Array<{ label: string; value: string }> = [];

    if (quote.pricing_context.demand_level) {
        items.push({
            label: '需要レベル',
            value: formatDemandLevelLabel(quote.pricing_context.demand_level),
        });
    }

    if (quote.pricing_context.walking_time_range) {
        items.push({
            label: '移動目安',
            value: formatTravelTimeEstimate(quote.travel_mode, quote.pricing_context.walking_time_range),
        });
    }

    return items;
}
