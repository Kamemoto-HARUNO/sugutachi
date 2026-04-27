import { DISCOVERY_SORT_OPTIONS, type DiscoverySort } from '../../lib/discovery';

interface DiscoverySortBarProps {
    selectedSort: DiscoverySort;
    onSelectSort: (sort: DiscoverySort) => void;
    aside?: React.ReactNode;
}

export function DiscoverySortBar({ selectedSort, onSelectSort, aside = null }: DiscoverySortBarProps) {
    return (
        <div className="rounded-[28px] bg-[#fffcf7] p-4 shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap gap-2">
                    {DISCOVERY_SORT_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => onSelectSort(option.value)}
                            className={[
                                'rounded-full px-4 py-2 text-sm font-semibold transition',
                                selectedSort === option.value
                                    ? 'bg-[#17202b] text-white'
                                    : 'bg-[#f6f1e7] text-[#17202b] hover:bg-[#ede2cf]',
                            ].join(' ')}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                {aside ? (
                    <div className="flex flex-wrap items-center gap-3 text-sm text-[#68707a]">
                        {aside}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
