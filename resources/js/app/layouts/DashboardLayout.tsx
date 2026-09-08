import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { RoleModeSwitcher } from '../components/account/RoleModeSwitcher';
import { BrandMark } from '../components/brand/BrandMark';
import { BookingMessagesLink } from '../components/messages/BookingMessagesLink';
import { NotificationBellLink } from '../components/notifications/NotificationBellLink';
import { SupportCenterButton } from '../components/support/SupportCenterButton';
import { SupportCenterDrawer } from '../components/support/SupportCenterDrawer';
import { BannerPlacementSection } from '../components/banners/BannerPlacementSection';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatRoleLabel } from '../lib/account';
import type { ApiEnvelope, NavItem, PublicCampaignRecord, RoleName, ServiceMeta } from '../lib/types';
import { useAuth } from '../hooks/useAuth';

interface DashboardLayoutProps {
    role: RoleName;
    description: string;
    navItems: NavItem[];
}

function navLinkClass(isActive: boolean): string {
    return [
        'inline-flex min-h-10 items-center rounded-full px-4 py-2 text-sm font-semibold transition',
        isActive
            ? 'bg-[#f5efe4] text-[#17202b] shadow-[0_8px_18px_rgba(245,239,228,0.18)]'
            : 'text-slate-300 hover:bg-white/6 hover:text-white',
    ].join(' ');
}

function headerActionClass(fullWidth = false): string {
    return [
        'inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/6',
        fullWidth ? 'w-full' : '',
    ].join(' ').trim();
}

function modeBannerClass(role: RoleName): string {
    switch (role) {
        case 'user':
            return 'border-[#d6b35a] bg-[#f3dec0] text-[#17202b]';
        case 'therapist':
            return 'border-[#4aa36d] bg-[#dff1e5] text-[#1f5e3b]';
        case 'admin':
            return 'border-[#5c8ed9] bg-[#dfeeff] text-[#244f87]';
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
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/15 md:hidden"
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

export function DashboardLayout({ role, description, navItems }: DashboardLayoutProps) {
    const { logout, token } = useAuth();
    const location = useLocation();
    const isMessagesPage = /^\/(user|therapist)\/(messages|direct-messages)(\/|$)/.test(location.pathname);
    const [therapistPublicId, setTherapistPublicId] = useState<string | null>(null);
    const [therapistDashboardCampaigns, setTherapistDashboardCampaigns] = useState<PublicCampaignRecord[]>([]);
    const headerRef = useRef<HTMLElement | null>(null);
    const navScrollRef = useRef<HTMLDivElement | null>(null);
    const mobileMenuRef = useRef<HTMLDivElement | null>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isSupportCenterOpen, setIsSupportCenterOpen] = useState(false);
    const [showModeBanner, setShowModeBanner] = useState(false);

    useEffect(() => {
        if (role !== 'therapist' || !token) {
            setTherapistPublicId(null);
            setTherapistDashboardCampaigns([]);
            return;
        }

        let isMounted = true;

        void Promise.all([
            apiRequest<ApiEnvelope<{ public_id: string | null }>>('/me/therapist-profile', { token }),
            apiRequest<ApiEnvelope<ServiceMeta>>('/service-meta'),
        ])
            .then(([profilePayload, metaPayload]) => {
                if (!isMounted) {
                    return;
                }

                const therapistProfile = unwrapData(profilePayload);
                const serviceMeta = unwrapData(metaPayload);
                setTherapistPublicId(therapistProfile.public_id ?? null);
                setTherapistDashboardCampaigns(
                    serviceMeta.campaigns.filter((campaign) => (
                        campaign.target_role === 'therapist'
                        && campaign.placements.includes('therapist_dashboard')
                    )),
                );
            })
            .catch((error: unknown) => {
                if (!isMounted) {
                    return;
                }

                if (!(error instanceof ApiError && error.status === 404)) {
                    setTherapistPublicId(null);
                }

                setTherapistDashboardCampaigns([]);
            });

        return () => {
            isMounted = false;
        };
    }, [role, token]);

    useEffect(() => {
        const container = navScrollRef.current;

        if (!container) {
            return;
        }

        const updateScrollIndicators = () => {
            const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
            setCanScrollLeft(container.scrollLeft > 4);
            setCanScrollRight(container.scrollLeft < maxScrollLeft - 4);
        };

        updateScrollIndicators();

        const handleScroll = () => {
            updateScrollIndicators();
        };

        const resizeObserver = new ResizeObserver(() => {
            updateScrollIndicators();
        });

        container.addEventListener('scroll', handleScroll, { passive: true });
        resizeObserver.observe(container);

        const navElement = container.firstElementChild;

        if (navElement instanceof HTMLElement) {
            resizeObserver.observe(navElement);
        }

        window.addEventListener('resize', updateScrollIndicators);

        return () => {
            container.removeEventListener('scroll', handleScroll);
            resizeObserver.disconnect();
            window.removeEventListener('resize', updateScrollIndicators);
        };
    }, [navItems]);

    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname, location.search]);

    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);

        if (searchParams.get('support') === 'open') {
            setIsSupportCenterOpen(true);
        }
    }, [location.search]);

    useEffect(() => {
        if (!isMobileMenuOpen) {
            return;
        }

        const handlePointerDown = (event: PointerEvent) => {
            if (!(event.target instanceof Node)) {
                return;
            }

            if (!mobileMenuRef.current?.contains(event.target)) {
                setIsMobileMenuOpen(false);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsMobileMenuOpen(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isMobileMenuOpen]);

    useEffect(() => {
        const headerElement = headerRef.current;

        if (!headerElement) {
            return;
        }

        const updateModeBannerVisibility = () => {
            setShowModeBanner(headerElement.getBoundingClientRect().bottom <= 0);
        };

        updateModeBannerVisibility();
        window.addEventListener('scroll', updateModeBannerVisibility, { passive: true });
        window.addEventListener('resize', updateModeBannerVisibility);

        return () => {
            window.removeEventListener('scroll', updateModeBannerVisibility);
            window.removeEventListener('resize', updateModeBannerVisibility);
        };
    }, [location.pathname, location.search]);

    const scrollTabs = (direction: 'left' | 'right') => {
        const container = navScrollRef.current;

        if (!container) {
            return;
        }

        const delta = Math.max(220, Math.round(container.clientWidth * 0.7));

        container.scrollBy({
            left: direction === 'left' ? -delta : delta,
            behavior: 'smooth',
        });
    };

    return (
        <div className="min-h-screen">
            {showModeBanner ? (
                <div className="pointer-events-none fixed inset-x-0 top-0 z-40">
                    <div className={['border-b backdrop-blur', modeBannerClass(role)].join(' ')}>
                        <div className="mx-auto w-full max-w-[1380px] px-4 sm:px-6 lg:px-8">
                            <p className="py-2 text-xs font-semibold tracking-wide">
                                {formatRoleLabel(role)}モード
                            </p>
                        </div>
                    </div>
                </div>
            ) : null}
            <div className="mx-auto flex w-full max-w-[1380px] flex-col gap-8 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
                <header ref={headerRef} className="overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(118deg,rgba(23,32,43,0.96)_0%,rgba(31,45,61,0.94)_52%,rgba(42,59,79,0.96)_100%)] shadow-[0_30px_70px_rgba(2,6,23,0.34)]">
                    <div className="space-y-6 p-6 sm:p-7 lg:p-8">
                        <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start xl:gap-8">
                            <div className="min-w-0 flex-1">
                                <div className="min-w-0 flex-1 space-y-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <BrandMark inverse compact />
                                        <div ref={mobileMenuRef} className="relative flex shrink-0 items-center gap-2 md:gap-3">
                                            <div className="md:hidden">
                                                <NotificationBellLink compact className="border-white/15 bg-white/10 hover:bg-white/15" />
                                            </div>
                                            <div className="hidden md:block">
                                                <NotificationBellLink className="border-white/15 bg-white/10 hover:bg-white/15" />
                                            </div>
                                            {role === 'user' || role === 'therapist' ? (
                                                <>
                                                    <div className="md:hidden">
                                                        <SupportCenterButton
                                                            compact
                                                            className="border-white/15 bg-white/10 hover:bg-white/15"
                                                            onClick={() => setIsSupportCenterOpen(true)}
                                                        />
                                                    </div>
                                                    <div className="hidden md:block">
                                                        <SupportCenterButton
                                                            className="border-white/15 bg-white/10 hover:bg-white/15"
                                                            onClick={() => setIsSupportCenterOpen(true)}
                                                        />
                                                    </div>
                                                </>
                                            ) : null}
                                            {role === 'user' || role === 'therapist' ? (
                                                <BookingMessagesLink
                                                    adaptive
                                                    className="border-white/15 bg-white/10 hover:bg-white/15"
                                                />
                                            ) : null}

                                            <div className="hidden items-center gap-3 md:flex">
                                                {role === 'therapist' && therapistPublicId ? (
                                                    <Link
                                                        to={`/therapists/${therapistPublicId}`}
                                                        className={headerActionClass()}
                                                    >
                                                        自分のページを確認
                                                    </Link>
                                                ) : null}
                                                <Link
                                                    to="/profile"
                                                    className={headerActionClass()}
                                                >
                                                    アカウント設定
                                                </Link>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        void logout();
                                                    }}
                                                    className={headerActionClass()}
                                                >
                                                    ログアウト
                                                </button>
                                            </div>

                                            <MobileMenuButton
                                                isOpen={isMobileMenuOpen}
                                                onToggle={() => {
                                                    setIsMobileMenuOpen((current) => !current);
                                                }}
                                            />

                                            {isMobileMenuOpen ? (
                                                <div className="absolute right-0 top-full z-20 mt-3 flex w-[min(18rem,calc(100vw-2rem))] flex-col gap-2 rounded-[24px] border border-white/12 bg-[rgba(23,32,43,0.96)] p-3 shadow-[0_18px_45px_rgba(23,32,43,0.28)] backdrop-blur md:hidden">
                                                    {role === 'therapist' && therapistPublicId ? (
                                                        <Link
                                                            to={`/therapists/${therapistPublicId}`}
                                                            onClick={() => setIsMobileMenuOpen(false)}
                                                            className={headerActionClass(true)}
                                                        >
                                                            自分のページを確認
                                                        </Link>
                                                    ) : null}
                                                    <Link
                                                        to="/profile"
                                                        onClick={() => setIsMobileMenuOpen(false)}
                                                        className={headerActionClass(true)}
                                                    >
                                                        アカウント設定
                                                    </Link>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setIsMobileMenuOpen(false);
                                                            void logout();
                                                        }}
                                                        className={headerActionClass(true)}
                                                    >
                                                        ログアウト
                                                    </button>
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-3">
                                        <span className="text-sm font-semibold text-slate-200">
                                            モード切り替え
                                        </span>
                                        <RoleModeSwitcher />
                                    </div>

                                    <div className="space-y-3">
                                        <h1 className="max-w-[16ch] text-[2.2rem] font-semibold leading-[1.4] text-white sm:max-w-[20ch] sm:text-[2.5rem] xl:max-w-none xl:whitespace-nowrap">
                                            {isMessagesPage ? 'メッセージ' : 'ダッシュボード'}
                                        </h1>
                                        <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-[0.95rem]">
                                            {isMessagesPage ? `${role === 'therapist' ? 'タチキャスト' : '利用者'}としてのDMと予約の連絡を確認できます。` : description}
                                        </p>
                                    </div>
                                </div>

                                {role === 'therapist' && therapistDashboardCampaigns.length > 0 ? (
                                    <div className="grid gap-3">
                                        {therapistDashboardCampaigns.map((campaign, index) => (
                                            <article
                                                key={campaign.id}
                                                className="campaign-offer-float campaign-offer-banner-dark rounded-[24px] px-5 py-4"
                                                style={{ animationDelay: `${index * 0.8}s` }}
                                            >
                                                <p className="text-xs font-semibold tracking-wide text-[#7f5414]">期間限定キャンペーン適用中</p>
                                                <p className="mt-2 text-base font-semibold text-[#17202b]">{campaign.offer_text}</p>
                                                <p className="mt-2 text-sm leading-7 text-[#5d4724]">
                                                    {campaign.trigger_label}として {campaign.benefit_summary} が適用されます。
                                                </p>
                                            </article>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        <div className="relative pb-1">
                            <div
                                ref={navScrollRef}
                                className="overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                            >
                                <nav className="flex min-w-max gap-2 pr-2 xl:min-w-0">
                                    {navItems.map((item) => (
                                        <NavLink key={item.to} to={item.to} end={item.exact} className={({ isActive }) => navLinkClass(isActive)}>
                                            {item.label}
                                        </NavLink>
                                    ))}
                                </nav>
                            </div>
                            {canScrollLeft ? (
                                <>
                                    <div className="pointer-events-none absolute inset-y-0 left-0 w-12 rounded-l-[20px] bg-gradient-to-r from-[#17202b] via-[#17202b]/85 to-transparent" />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            scrollTabs('left');
                                        }}
                                        className="absolute left-0 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/12 bg-[#1d2b3a]/95 text-lg font-semibold text-white shadow-[0_10px_20px_rgba(15,23,42,0.28)] transition hover:bg-[#26384c]"
                                        aria-label="左のタブを見る"
                                    >
                                        ‹
                                    </button>
                                </>
                            ) : null}
                            {canScrollRight ? (
                                <>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 w-16 rounded-r-[20px] bg-gradient-to-l from-[#17202b] via-[#17202b]/88 to-transparent" />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            scrollTabs('right');
                                        }}
                                        className="absolute right-0 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/12 bg-[#1d2b3a]/95 text-lg font-semibold text-white shadow-[0_10px_20px_rgba(15,23,42,0.28)] transition hover:bg-[#26384c]"
                                        aria-label="右のタブを見る"
                                    >
                                        ›
                                    </button>
                                </>
                            ) : null}
                            <p className="mt-2 text-xs text-slate-400 sm:hidden">
                                左右にスワイプすると、ほかのタブも表示できます。
                            </p>
                        </div>
                    </div>
                </header>

                <main className="w-full">
                    <Outlet />
                </main>

                <BannerPlacementSection placement="dashboard" className="pt-2" />
            </div>
            {role === 'user' || role === 'therapist' ? (
                <SupportCenterDrawer
                    isOpen={isSupportCenterOpen}
                    onClose={() => setIsSupportCenterOpen(false)}
                />
            ) : null}
        </div>
    );
}
