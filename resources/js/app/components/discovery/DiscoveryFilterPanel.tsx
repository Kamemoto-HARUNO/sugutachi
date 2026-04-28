import {
    DISCOVERY_BOOKING_TYPE_OPTIONS,
    DISCOVERY_DISPLAY_NOTE_LABEL,
    DISCOVERY_FILTER_LABELS,
    DISCOVERY_LOCATION_PRIVACY_NOTE,
    type BookingStartType,
    type DiscoveryPriceRange,
} from '../../lib/discovery';

interface DiscoveryFilterPanelProps {
    selectedStartType: BookingStartType;
    onSelectStartType: (startType: BookingStartType) => void;
    scheduledStartAt?: string;
    onScheduledStartAtChange: (value: string) => void;
    trainingOnly: boolean;
    onToggleTraining: () => void;
    ratingOnly: boolean;
    onToggleRating: () => void;
    walkingOnly: boolean;
    onToggleWalking: () => void;
    priceRange: DiscoveryPriceRange;
    onSelectPriceRange: (priceRange: DiscoveryPriceRange) => void;
}

export function DiscoveryFilterPanel({
    selectedStartType,
    onSelectStartType,
    scheduledStartAt = '',
    onScheduledStartAtChange,
    trainingOnly,
    onToggleTraining,
    ratingOnly,
    onToggleRating,
    walkingOnly,
    onToggleWalking,
    priceRange,
    onSelectPriceRange,
}: DiscoveryFilterPanelProps) {
    return (
        <div className="space-y-5">
            <div className="space-y-3">
                <p className="text-xs font-semibold tracking-wide text-[#8a8f97]">時間</p>
                <div className="flex flex-wrap gap-2">
                    {[
                        { value: 'now' as const, label: DISCOVERY_BOOKING_TYPE_OPTIONS.now },
                        { value: 'scheduled' as const, label: DISCOVERY_BOOKING_TYPE_OPTIONS.scheduled },
                    ].map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => onSelectStartType(option.value)}
                            className={[
                                'rounded-full px-4 py-2 text-sm font-semibold transition',
                                selectedStartType === option.value
                                    ? 'bg-[#17202b] text-white'
                                    : 'bg-[#f6f1e7] text-[#17202b] hover:bg-[#ede2cf]',
                            ].join(' ')}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                {selectedStartType === 'scheduled' ? (
                    <input
                        type="datetime-local"
                        value={scheduledStartAt}
                        onChange={(event) => onScheduledStartAtChange(event.target.value)}
                        className="block min-w-0 max-w-full rounded-[20px] border border-[#e5d8c4] bg-white px-4 py-3 text-base text-[#17202b] outline-none sm:text-sm"
                    />
                ) : null}
            </div>

            <div className="space-y-3">
                <p className="text-xs font-semibold tracking-wide text-[#8a8f97]">認証・条件</p>
                <div className="flex flex-wrap gap-2">
                    {[
                        { active: trainingOnly, label: DISCOVERY_FILTER_LABELS.training, onClick: onToggleTraining },
                        { active: ratingOnly, label: DISCOVERY_FILTER_LABELS.rating, onClick: onToggleRating },
                        { active: walkingOnly, label: DISCOVERY_FILTER_LABELS.walking, onClick: onToggleWalking },
                    ].map((chip) => (
                        <button
                            key={chip.label}
                            type="button"
                            onClick={chip.onClick}
                            className={[
                                'rounded-full px-4 py-2 text-sm font-semibold transition',
                                chip.active
                                    ? 'border border-[#ddcfb4] bg-[#f5ebd5] text-[#17202b]'
                                    : 'bg-[#f6f1e7] text-[#17202b] hover:bg-[#ede2cf]',
                            ].join(' ')}
                        >
                            {chip.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                <p className="text-xs font-semibold tracking-wide text-[#8a8f97]">料金目安</p>
                <div className="grid gap-2">
                    {[
                        { value: 'all' as const, label: 'すべて' },
                        { value: 'under_12000' as const, label: '¥12,000未満' },
                        { value: 'between_12000_20000' as const, label: '¥12,000 - ¥20,000' },
                        { value: 'over_20000' as const, label: '¥20,000超' },
                    ].map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => onSelectPriceRange(option.value)}
                            className={[
                                'rounded-[18px] px-4 py-3 text-left text-sm font-semibold transition',
                                priceRange === option.value
                                    ? 'bg-[#17202b] text-white'
                                    : 'bg-[#f6f1e7] text-[#17202b] hover:bg-[#ede2cf]',
                            ].join(' ')}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="rounded-[24px] bg-[#17202b] p-5 text-white">
                <p className="text-xs font-semibold tracking-wide text-[#d2b179]">{DISCOVERY_DISPLAY_NOTE_LABEL}</p>
                <p className="mt-2 text-sm leading-7 text-[#d8d3ca]">
                    {DISCOVERY_LOCATION_PRIVACY_NOTE}
                </p>
            </div>
        </div>
    );
}
