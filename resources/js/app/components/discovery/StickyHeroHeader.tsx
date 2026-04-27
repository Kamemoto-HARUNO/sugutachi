import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark } from '../brand/BrandMark';

export interface StickyHeroHeaderAction {
    label: string;
    to: string;
    variant?: 'primary' | 'secondary';
}

interface StickyHeroHeaderProps {
    actions: StickyHeroHeaderAction[];
}

function actionClass(variant: 'primary' | 'secondary', fullWidth = false): string {
    const widthClass = fullWidth ? 'w-full' : '';

    if (variant === 'secondary') {
        return [
            'inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-bold transition',
            'bg-[#f2ebe0] text-[#1a2430] hover:bg-[#ebe0cf]',
            widthClass,
        ].join(' ');
    }

    return [
        'inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-bold transition',
        'bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] text-[#1a2430] hover:brightness-105',
        widthClass,
    ].join(' ');
}

function MobileMenuButton({
    isOpen,
    onToggle,
}: {
    isOpen: boolean;
    onToggle: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-label={isOpen ? 'グローバルメニューを閉じる' : 'グローバルメニューを開く'}
            aria-expanded={isOpen}
            className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/15 md:hidden"
        >
            <span className="relative block h-4 w-5">
                <span
                    className={[
                        'absolute left-0 top-0 h-0.5 w-5 rounded-full bg-current transition',
                        isOpen ? 'translate-y-[7px] rotate-45' : '',
                    ].join(' ')}
                />
                <span
                    className={[
                        'absolute left-0 top-[7px] h-0.5 w-5 rounded-full bg-current transition',
                        isOpen ? 'opacity-0' : '',
                    ].join(' ')}
                />
                <span
                    className={[
                        'absolute left-0 top-[14px] h-0.5 w-5 rounded-full bg-current transition',
                        isOpen ? '-translate-y-[7px] -rotate-45' : '',
                    ].join(' ')}
                />
            </span>
        </button>
    );
}

function HeaderBar({
    actions,
    sticky = false,
}: {
    actions: StickyHeroHeaderAction[];
    sticky?: boolean;
}) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!isMenuOpen) {
            return;
        }

        const handlePointerDown = (event: PointerEvent) => {
            if (!(event.target instanceof Node)) {
                return;
            }

            if (!containerRef.current?.contains(event.target)) {
                setIsMenuOpen(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
        };
    }, [isMenuOpen]);

    return (
        <div
            ref={containerRef}
            className={[
                'relative flex w-full items-center justify-between gap-4',
                sticky
                    ? 'rounded-[26px] border border-white/12 bg-[rgba(23,32,43,0.94)] px-4 py-3 shadow-[0_18px_45px_rgba(23,32,43,0.28)] backdrop-blur'
                    : '',
            ].join(' ')}
        >
            <BrandMark inverse />

            {actions.length > 0 ? (
                <>
                    <div className="hidden items-center gap-3 md:flex">
                        {actions.map((action) => (
                            <Link key={`${action.label}-${action.to}`} to={action.to} className={actionClass(action.variant ?? 'primary')}>
                                {action.label}
                            </Link>
                        ))}
                    </div>

                    <div className="md:hidden">
                        <MobileMenuButton isOpen={isMenuOpen} onToggle={() => setIsMenuOpen((value) => !value)} />
                    </div>

                    {isMenuOpen ? (
                        <div className="absolute right-0 top-full z-20 mt-3 flex w-[min(18rem,calc(100vw-2rem))] flex-col gap-2 rounded-[24px] border border-white/12 bg-[rgba(23,32,43,0.96)] p-3 shadow-[0_18px_45px_rgba(23,32,43,0.28)] backdrop-blur md:hidden">
                            {actions.map((action) => (
                                <Link
                                    key={`${action.label}-${action.to}-mobile`}
                                    to={action.to}
                                    onClick={() => setIsMenuOpen(false)}
                                    className={actionClass(action.variant ?? 'primary', true)}
                                >
                                    {action.label}
                                </Link>
                            ))}
                        </div>
                    ) : null}
                </>
            ) : null}
        </div>
    );
}

export function StickyHeroHeader({ actions }: StickyHeroHeaderProps) {
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const lastScrollYRef = useRef(0);
    const hasPassedSentinelRef = useRef(false);
    const [showStickyHeader, setShowStickyHeader] = useState(false);

    useEffect(() => {
        const element = sentinelRef.current;

        if (!element) {
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                hasPassedSentinelRef.current = !entry.isIntersecting;

                if (entry.isIntersecting) {
                    setShowStickyHeader(false);
                }
            },
            {
                threshold: 0,
            },
        );

        observer.observe(element);

        return () => {
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        lastScrollYRef.current = window.scrollY;

        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            const isScrollingUp = currentScrollY < lastScrollYRef.current;
            const isNearTop = currentScrollY <= 8;

            if (isNearTop || !hasPassedSentinelRef.current) {
                setShowStickyHeader(false);
            } else if (isScrollingUp) {
                setShowStickyHeader(true);
            } else {
                setShowStickyHeader(false);
            }

            lastScrollYRef.current = currentScrollY;
        };

        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, []);

    return (
        <>
            <div
                className={[
                    'pointer-events-none fixed inset-x-0 top-0 z-50 px-4 pt-3 transition-all duration-300 sm:px-6',
                    showStickyHeader ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0',
                ].join(' ')}
            >
                <div className="mx-auto w-full max-w-[1280px] pointer-events-auto">
                    <HeaderBar actions={actions} sticky />
                </div>
            </div>

            <div ref={sentinelRef}>
                <HeaderBar actions={actions} />
            </div>
        </>
    );
}
