type BookingFlowStepKey = 'quote' | 'waiting';

interface BookingFlowStepsProps {
    current: BookingFlowStepKey;
}

const steps: Array<{ key: BookingFlowStepKey; label: string }> = [
    { key: 'quote', label: '見積もり確認・カード入力' },
    { key: 'waiting', label: '承諾待ち' },
];

export function BookingFlowSteps({ current }: BookingFlowStepsProps) {
    const currentIndex = steps.findIndex((step) => step.key === current);

    return (
        <div className="flex flex-wrap items-center gap-2">
            {steps.map((step, index) => {
                const isActive = step.key === current;
                const isCompleted = currentIndex > index;

                return (
                    <div
                        key={step.key}
                        className={[
                            'inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition sm:text-sm',
                            isActive
                                ? 'border-[#d2b179] bg-[#fff8ee] text-[#17202b]'
                                : isCompleted
                                    ? 'border-[#dbe6de] bg-[#edf5ef] text-[#2d5b3d]'
                                    : 'border-[#e8dfd2] bg-white text-[#7d6852]',
                        ].join(' ')}
                    >
                        <span
                            className={[
                                'inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px]',
                                isActive
                                    ? 'bg-[#17202b] text-white'
                                    : isCompleted
                                        ? 'bg-[#2d5b3d] text-white'
                                        : 'bg-[#f3ece1] text-[#7d6852]',
                            ].join(' ')}
                        >
                            {index + 1}
                        </span>
                        <span className="whitespace-nowrap">{step.label}</span>
                    </div>
                );
            })}
        </div>
    );
}
