import { Link } from 'react-router-dom';
import {
    DISCOVERY_BOOKING_TYPE_LABEL,
    DISCOVERY_BOOKING_TYPE_OPTIONS,
    type BookingStartType,
} from '../../lib/discovery';

interface DiscoverySearchPanelAction {
    label: string;
    to?: string;
    onClick?: () => void;
    disabled?: boolean;
}

interface DiscoverySearchPanelProps {
    description: string;
    addressField: React.ReactNode;
    selectedStartType: BookingStartType;
    onSelectStartType: (startType: BookingStartType) => void;
    scheduledStartAt?: string;
    onScheduledStartAtChange: (value: string) => void;
    action: DiscoverySearchPanelAction;
    helperText: string;
}

function ActionButton({ action }: { action: DiscoverySearchPanelAction }) {
    const className =
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-6 py-3 text-sm font-bold text-[#1a2430] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60';

    if (action.to && !action.disabled) {
        return (
            <Link to={action.to} className={className}>
                {action.label}
            </Link>
        );
    }

    return (
        <button type="button" onClick={action.onClick} disabled={action.disabled} className={className}>
            {action.label}
        </button>
    );
}

export function DiscoverySearchPanel({
    description,
    addressField,
    selectedStartType,
    onSelectStartType,
    scheduledStartAt = '',
    onScheduledStartAtChange,
    action,
    helperText,
}: DiscoverySearchPanelProps) {
    return (
        <div className="rounded-[32px] border border-white/12 bg-[linear-gradient(109deg,rgba(255,249,241,0.18)_2.98%,rgba(255,255,255,0.04)_101.1%)] p-6 text-white shadow-[0_24px_60px_rgba(0,0,0,0.16)] md:p-8">
            <div className="space-y-1">
                <h2 className="text-[1.35rem] font-semibold">条件を指定して探す</h2>
                <p className="text-sm text-[#c8c2b6]">{description}</p>
            </div>

            <div className="mt-5 space-y-3">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                    {addressField}

                    <div className="rounded-[24px] bg-white px-5 py-3 text-[#121a23] md:w-fit md:justify-self-start">
                        <p className="text-xs font-semibold text-[#69707a]">{DISCOVERY_BOOKING_TYPE_LABEL}</p>
                        <div className="mt-1 flex flex-nowrap gap-2 text-sm font-semibold">
                            {[
                                { value: 'now' as const, label: DISCOVERY_BOOKING_TYPE_OPTIONS.now },
                                { value: 'scheduled' as const, label: DISCOVERY_BOOKING_TYPE_OPTIONS.scheduled },
                            ].map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => onSelectStartType(option.value)}
                                    className={[
                                        'whitespace-nowrap rounded-full px-3 py-1 transition',
                                        selectedStartType === option.value
                                            ? 'bg-[#17202b] text-white'
                                            : 'bg-[#f3ede4] text-[#17202b]',
                                    ].join(' ')}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {selectedStartType === 'scheduled' ? (
                    <input
                        type="datetime-local"
                        value={scheduledStartAt}
                        onChange={(event) => onScheduledStartAtChange(event.target.value)}
                        className="w-full rounded-[24px] border border-transparent bg-white px-5 py-3 text-sm font-medium text-[#17202b] outline-none"
                    />
                ) : null}
            </div>

            <div className="mt-5 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
                <ActionButton action={action} />
                <p className="text-xs text-[#c8c2b6] md:whitespace-nowrap">{helperText}</p>
            </div>
        </div>
    );
}
