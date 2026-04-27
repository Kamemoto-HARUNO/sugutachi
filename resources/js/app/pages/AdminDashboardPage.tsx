import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import type {
    AdminDashboardNavigationTarget,
    AdminDashboardRecord,
    ApiEnvelope,
} from '../lib/types';

interface DashboardMetricCard {
    key: string;
    label: string;
    count: number;
    description: string;
    target?: AdminDashboardNavigationTarget;
}

function formatCount(value: number): string {
    return new Intl.NumberFormat('ja-JP').format(value);
}

function buildAppPath(target?: AdminDashboardNavigationTarget): string | null {
    if (!target) {
        return null;
    }

    const path = target.path.startsWith('/api/')
        ? target.path.replace('/api', '')
        : target.path;
    const params = new URLSearchParams();

    Object.entries(target.query).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') {
            return;
        }

        params.set(key, String(value));
    });

    const queryString = params.toString();

    return queryString ? `${path}?${queryString}` : path;
}

export function AdminDashboardPage() {
    const { token } = useAuth();
    const [dashboard, setDashboard] = useState<AdminDashboardRecord | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    usePageTitle('運営ダッシュボード');
    useToastOnMessage(error, 'error');

    const loadDashboard = useCallback(async (refresh = false) => {
        if (!token) {
            return;
        }

        if (refresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        try {
            const payload = await apiRequest<ApiEnvelope<AdminDashboardRecord>>('/admin/dashboard', { token });
            setDashboard(unwrapData(payload));
            setError(null);
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '管理ダッシュボードの取得に失敗しました。';

            setError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [token]);

    useEffect(() => {
        void loadDashboard();
    }, [loadDashboard]);

    const reviewCards = useMemo<DashboardMetricCard[]>(() => {
        if (!dashboard) {
            return [];
        }

        return [
            {
                key: 'pending_identity_verifications',
                label: '本人確認審査待ち',
                count: dashboard.reviews.pending_identity_verifications,
                description: '書類と年齢確認の審査キューです。',
                target: dashboard.navigation.reviews.pending_identity_verifications,
            },
            {
                key: 'pending_therapist_profiles',
                label: 'プロフィール審査待ち',
                count: dashboard.reviews.pending_therapist_profiles,
                description: '公開前のプロフィール審査を確認します。',
                target: dashboard.navigation.reviews.pending_therapist_profiles,
            },
            {
                key: 'pending_profile_photos',
                label: '写真審査待ち',
                count: dashboard.reviews.pending_profile_photos,
                description: 'プロフィール写真の審査キューです。',
                target: dashboard.navigation.reviews.pending_profile_photos,
            },
            {
                key: 'suspended_therapist_profiles',
                label: '停止中プロフィール',
                count: dashboard.reviews.suspended_therapist_profiles,
                description: '再開判断や restore 対象を確認します。',
                target: dashboard.navigation.reviews.suspended_therapist_profiles,
            },
        ];
    }, [dashboard]);

    const operationCards = useMemo<DashboardMetricCard[]>(() => {
        if (!dashboard) {
            return [];
        }

        return [
            {
                key: 'open_reports',
                label: '未解決通報',
                count: dashboard.operations.open_reports,
                description: '通常通報の未解決件数です。',
                target: dashboard.navigation.operations.open_reports,
            },
            {
                key: 'open_interruption_reports',
                label: '中断起点の通報',
                count: dashboard.operations.open_interruption_reports,
                description: '予約中断に紐づく安全報告です。',
                target: dashboard.navigation.operations.open_interruption_reports,
            },
            {
                key: 'open_message_origin_reports',
                label: 'メッセージ起点通報',
                count: dashboard.operations.open_message_origin_reports,
                description: '危険メッセージから起票された通報です。',
                target: dashboard.navigation.operations.open_message_origin_reports,
            },
            {
                key: 'pending_contact_inquiries',
                label: '未対応問い合わせ',
                count: dashboard.operations.pending_contact_inquiries,
                description: '問い合わせの未処理件数です。',
                target: dashboard.navigation.operations.pending_contact_inquiries,
            },
            {
                key: 'unread_travel_requests',
                label: '未読出張リクエスト',
                count: dashboard.operations.unread_travel_requests,
                description: 'セラピスト宛の新着需要通知です。',
                target: dashboard.navigation.operations.unread_travel_requests,
            },
            {
                key: 'flagged_travel_requests',
                label: '要監視出張リクエスト',
                count: dashboard.operations.flagged_travel_requests,
                description: '連絡先交換検知つきのものです。',
                target: dashboard.navigation.operations.flagged_travel_requests,
            },
            {
                key: 'pending_travel_request_reviews',
                label: '出張リクエスト未レビュー',
                count: dashboard.operations.pending_travel_request_reviews,
                description: '運営レビュー待ちの需要通知です。',
                target: dashboard.navigation.operations.pending_travel_request_reviews,
            },
            {
                key: 'open_stripe_disputes',
                label: '未解決チャージバック',
                count: dashboard.operations.open_stripe_disputes,
                description: 'Stripe dispute のオープン件数です。',
                target: dashboard.navigation.operations.open_stripe_disputes,
            },
            {
                key: 'requested_refunds',
                label: '返金申請待ち',
                count: dashboard.operations.requested_refunds,
                description: '返金審査が必要な件数です。',
                target: dashboard.navigation.operations.requested_refunds,
            },
            {
                key: 'requested_payouts',
                label: '出金申請待ち',
                count: dashboard.operations.requested_payouts,
                description: 'セラピスト出金処理の待機件数です。',
                target: dashboard.navigation.operations.requested_payouts,
            },
        ];
    }, [dashboard]);

    const bookingCards = useMemo<DashboardMetricCard[]>(() => {
        if (!dashboard) {
            return [];
        }

        return [
            {
                key: 'requested',
                label: '承諾待ち予約',
                count: dashboard.bookings.requested,
                description: 'セラピスト応答待ちの予約です。',
                target: dashboard.navigation.bookings.requested,
            },
            {
                key: 'needs_message_review',
                label: '要メッセージ確認',
                count: dashboard.bookings.needs_message_review,
                description: '危険メッセージ検知のある予約です。',
                target: dashboard.navigation.bookings.needs_message_review,
            },
            {
                key: 'interrupted',
                label: '中断済み予約',
                count: dashboard.bookings.interrupted,
                description: '安全対応が必要になりやすい予約です。',
                target: dashboard.navigation.bookings.interrupted,
            },
            {
                key: 'in_progress',
                label: '進行中予約',
                count: dashboard.bookings.in_progress,
                description: '現在進行中の対応件数です。',
                target: dashboard.navigation.bookings.in_progress,
            },
            {
                key: 'completed_today',
                label: '本日完了',
                count: dashboard.bookings.completed_today,
                description: '今日更新された完了予約です。',
                target: dashboard.navigation.bookings.completed_today,
            },
        ];
    }, [dashboard]);

    const pricingCards = useMemo<DashboardMetricCard[]>(() => {
        if (!dashboard) {
            return [];
        }

        return [
            {
                key: 'pending_review',
                label: '料金ルール未レビュー',
                count: dashboard.pricing_rules.pending_review,
                description: '監視フラグ付きで未レビューのルールです。',
                target: dashboard.navigation.pricing_rules.pending_review,
            },
            {
                key: 'needs_attention',
                label: '料金ルール要注意',
                count: dashboard.pricing_rules.needs_attention,
                description: '監視フラグ付きの全件数です。',
                target: dashboard.navigation.pricing_rules.needs_attention,
            },
            {
                key: 'inactive_menu_rules',
                label: '停止メニュー紐づき',
                count: dashboard.pricing_rules.inactive_menu_rules,
                description: '無効メニューにぶら下がる有効ルールです。',
                target: dashboard.navigation.pricing_rules.inactive_menu_rules,
            },
            {
                key: 'extreme_percentage_adjustments',
                label: '極端な増減率',
                count: dashboard.pricing_rules.extreme_percentage_adjustments,
                description: '100%以上の増減率を持つルールです。',
                target: dashboard.navigation.pricing_rules.extreme_percentage_adjustments,
            },
            {
                key: 'menu_price_override_rules',
                label: 'メニュー額超え固定調整',
                count: dashboard.pricing_rules.menu_price_override_rules,
                description: '基準額以上の固定増減を持つルールです。',
                target: dashboard.navigation.pricing_rules.menu_price_override_rules,
            },
        ];
    }, [dashboard]);

    if (isLoading) {
        return <LoadingScreen title="運営ダッシュボードを読み込み中" message="審査、監視、予約運用の件数を集計しています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">ADMIN OVERVIEW</p>
                        <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">運営ダッシュボード</h2>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            審査、通報、予約監視、料金監視の主要キューを1画面で確認できます。各カードからそのまま一覧へ飛べます。
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                void loadDashboard(true);
                            }}
                            disabled={isRefreshing}
                            className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isRefreshing ? '更新中...' : '最新化'}
                        </button>
                        <Link
                            to="/admin/accounts"
                            className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
                        >
                            アカウント一覧
                        </Link>
                    </div>
                </div>
            </section>


            {dashboard ? (
                <>
                    <section className="grid gap-4 md:grid-cols-3">
                        <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_16px_34px_rgba(2,6,23,0.12)]">
                            <p className="text-xs font-semibold tracking-wide text-[#d2b179]">ACCOUNTS</p>
                            <p className="mt-3 text-3xl font-semibold text-white">{formatCount(dashboard.accounts.total)}</p>
                            <p className="mt-2 text-sm text-slate-300">登録アカウント総数</p>
                        </article>
                        <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_16px_34px_rgba(2,6,23,0.12)]">
                            <p className="text-xs font-semibold tracking-wide text-[#d2b179]">ACTIVE</p>
                            <p className="mt-3 text-3xl font-semibold text-white">{formatCount(dashboard.accounts.active)}</p>
                            <p className="mt-2 text-sm text-slate-300">稼働中アカウント</p>
                        </article>
                        <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_16px_34px_rgba(2,6,23,0.12)]">
                            <p className="text-xs font-semibold tracking-wide text-[#d2b179]">SUSPENDED</p>
                            <p className="mt-3 text-3xl font-semibold text-white">{formatCount(dashboard.accounts.suspended)}</p>
                            <p className="mt-2 text-sm text-slate-300">停止中アカウント</p>
                        </article>
                    </section>

                    <DashboardSection
                        eyebrow="REVIEW QUEUES"
                        title="審査キュー"
                        description="本人確認、プロフィール、写真の審査を優先順に見られます。"
                        cards={reviewCards}
                    />

                    <DashboardSection
                        eyebrow="OPERATIONS"
                        title="安全運用と問い合わせ"
                        description="通報、問い合わせ、出張リクエスト、返金・出金の待機件数です。"
                        cards={operationCards}
                    />

                    <DashboardSection
                        eyebrow="BOOKINGS"
                        title="予約監視"
                        description="承諾待ち、危険メッセージ、中断予約を追えます。"
                        cards={bookingCards}
                    />

                    <DashboardSection
                        eyebrow="PRICING RULES"
                        title="料金ルール監視"
                        description="危険設定や未レビューのルールを入口で拾えるようにしています。"
                        cards={pricingCards}
                    />
                </>
            ) : null}
        </div>
    );
}

function DashboardSection({
    eyebrow,
    title,
    description,
    cards,
}: {
    eyebrow: string;
    title: string;
    description: string;
    cards: DashboardMetricCard[];
}) {
    return (
        <section className="space-y-4">
            <div className="space-y-2">
                <p className="text-xs font-semibold tracking-wide text-[#d2b179]">{eyebrow}</p>
                <h3 className="text-2xl font-semibold text-white">{title}</h3>
                <p className="max-w-3xl text-sm leading-7 text-slate-300">{description}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {cards.map((card) => {
                    const appPath = buildAppPath(card.target);

                    return (
                        <article
                            key={card.key}
                            className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_16px_34px_rgba(2,6,23,0.12)]"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="space-y-2">
                                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">{card.label}</p>
                                    <p className="text-3xl font-semibold text-white">{formatCount(card.count)}</p>
                                </div>
                                {card.count > 0 ? (
                                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                                        ACTION
                                    </span>
                                ) : null}
                            </div>
                            <p className="mt-3 text-sm leading-7 text-slate-300">{card.description}</p>
                            {appPath ? (
                                <Link
                                    to={appPath}
                                    className="mt-5 inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/6"
                                >
                                    一覧を開く
                                </Link>
                            ) : null}
                        </article>
                    );
                })}
            </div>
        </section>
    );
}
