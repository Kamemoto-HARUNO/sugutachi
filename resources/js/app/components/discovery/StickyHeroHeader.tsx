import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark } from '../brand/BrandMark';
import { NotificationBellLink } from '../notifications/NotificationBellLink';
import { useAuth } from '../../hooks/useAuth';

export interface StickyHeroHeaderAction {
    label: string;
    to: string;
    variant?: 'primary' | 'secondary';
    icon?: 'login' | 'register' | 'mypage';
    disabled?: boolean;
    onClick?: () => void;
}

interface StickyHeroHeaderProps {
    actions: StickyHeroHeaderAction[];
}

function actionClass(variant: 'primary' | 'secondary', fullWidth = false, disabled = false): string {
    const widthClass = fullWidth ? 'w-full' : '';

    if (variant === 'secondary') {
        return [
            'inline-flex items-center justify-center gap-2.5 rounded-full border border-white/18 px-6 py-3 text-sm font-bold transition',
            disabled
                ? 'cursor-not-allowed bg-white/6 text-[#f7f1e6] opacity-60'
                : 'bg-white/6 text-[#f7f1e6] hover:bg-white/10',
            widthClass,
        ].join(' ');
    }

    return [
        'inline-flex items-center justify-center gap-2.5 rounded-full px-6 py-3 text-sm font-bold transition',
        disabled
            ? 'cursor-not-allowed bg-[#f1dfbd] text-[#17202b] opacity-60 shadow-[0_16px_30px_rgba(232,213,178,0.18)]'
            : 'bg-[#f1dfbd] text-[#17202b] shadow-[0_16px_30px_rgba(232,213,178,0.18)] hover:bg-[#f6e8cb]',
        widthClass,
    ].join(' ');
}

function ActionIcon({ icon }: { icon: NonNullable<StickyHeroHeaderAction['icon']> }) {
    switch (icon) {
        case 'login':
            return (
                <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-[18px] w-[18px] shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
                    <path d="M10 16l4-4-4-4" />
                    <path d="M4 12h10" />
                </svg>
            );
        case 'register':
            return (
                <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-[18px] w-[18px] shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M15.5 19a5.5 5.5 0 0 0-11 0" />
                    <circle cx="10" cy="8" r="3.25" />
                    <path d="M19 8v6" />
                    <path d="M16 11h6" />
                </svg>
            );
        case 'mypage':
            return (
                <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-[18px] w-[18px] shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <circle cx="12" cy="8" r="3.25" />
                    <path d="M17.5 19a5.5 5.5 0 0 0-11 0" />
                </svg>
            );
    }
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
    const { isAuthenticated } = useAuth();
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
                            {isAuthenticated ? <NotificationBellLink className="border-white/15 bg-white/10 hover:bg-white/15" /> : null}
                            {actions.map((action) => action.onClick ? (
                                <button
                                    key={`${action.label}-${action.to}`}
                                    type="button"
                                    onClick={action.onClick}
                                    aria-disabled={action.disabled || undefined}
                                    className={actionClass(action.variant ?? 'primary', false, action.disabled)}
                                >
                                    {action.icon ? <ActionIcon icon={action.icon} /> : null}
                                    {action.label}
                                </button>
                            ) : (
                                <Link key={`${action.label}-${action.to}`} to={action.to} className={actionClass(action.variant ?? 'primary')}>
                                    {action.icon ? <ActionIcon icon={action.icon} /> : null}
                                    {action.label}
                                </Link>
                            ))}
                        </div>

                    <div className="flex items-center gap-2 md:hidden">
                        {isAuthenticated ? <NotificationBellLink compact className="border-white/15 bg-white/10 hover:bg-white/15" /> : null}
                        <MobileMenuButton isOpen={isMenuOpen} onToggle={() => setIsMenuOpen((value) => !value)} />
                    </div>

                    {isMenuOpen ? (
                        <div className="absolute right-0 top-full z-20 mt-3 flex w-[min(18rem,calc(100vw-2rem))] flex-col gap-2 rounded-[24px] border border-white/12 bg-[rgba(23,32,43,0.96)] p-3 shadow-[0_18px_45px_rgba(23,32,43,0.28)] backdrop-blur md:hidden">
                            {actions.map((action) => action.onClick ? (
                                <button
                                    key={`${action.label}-${action.to}-mobile`}
                                    type="button"
                                    onClick={() => {
                                        setIsMenuOpen(false);
                                        action.onClick?.();
                                    }}
                                    aria-disabled={action.disabled || undefined}
                                    className={actionClass(action.variant ?? 'primary', true, action.disabled)}
                                >
                                    {action.icon ? <ActionIcon icon={action.icon} /> : null}
                                    {action.label}
                                </button>
                            ) : (
                                <Link
                                    key={`${action.label}-${action.to}-mobile`}
                                    to={action.to}
                                    onClick={() => setIsMenuOpen(false)}
                                    className={actionClass(action.variant ?? 'primary', true)}
                                >
                                    {action.icon ? <ActionIcon icon={action.icon} /> : null}
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

            <div ref={sentinelRef} className="w-full">
                <HeaderBar actions={actions} />
            </div>
        </>
    );
}
