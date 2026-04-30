import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatCurrency } from '../lib/discovery';
import { formatJstDateTime } from '../lib/datetime';
import type {
    ApiEnvelope,
    CampaignOfferRecord,
    PublicCampaignRecord,
    ServiceMeta,
} from '../lib/types';

function statusTone(status: string): string {
    switch (status) {
        case 'available':
            return 'bg-[#e9f4ea] text-[#24553a]';
        case 'reserved':
            return 'bg-[#edf4ff] text-[#34557f]';
        case 'consumed':
            return 'bg-[#f1efe8] text-[#48505a]';
        case 'expired':
            return 'bg-[#f7e7e3] text-[#8c4738]';
        default:
            return 'bg-[#f1efe8] text-[#48505a]';
    }
}

function formatDateTime(value: string | null): string {
    return formatJstDateTime(value, {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }) ?? '未設定';
}

export function UserCampaignOffersPage() {
    const { token } = useAuth();
    const [offers, setOffers] = useState<CampaignOfferRecord[]>([]);
    const [publicCampaigns, setPublicCampaigns] = useState<PublicCampaignRecord[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    usePageTitle('保有オファー');
    useToastOnMessage(error, 'error');

    useEffect(() => {
        let isMounted = true;

        async function load() {
            if (!token) {
                return;
            }

            try {
                const [offersPayload, metaPayload] = await Promise.all([
                    apiRequest<ApiEnvelope<CampaignOfferRecord[]>>('/me/campaign-offers', { token }),
                    apiRequest<ApiEnvelope<ServiceMeta>>('/service-meta'),
                ]);

                if (!isMounted) {
                    return;
                }

                setOffers(unwrapData(offersPayload));
                setPublicCampaigns(
                    unwrapData(metaPayload).campaigns.filter((campaign) => campaign.target_role === 'user'),
                );
                setError(null);
            } catch (requestError) {
                if (!isMounted) {
                    return;
                }

                setError(
                    requestError instanceof ApiError
                        ? requestError.message
                        : 'オファー情報の取得に失敗しました。',
                );
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        }

        void load();

        return () => {
            isMounted = false;
        };
    }, [token]);

    const summary = useMemo(() => ({
        available: offers.filter((offer) => offer.status === 'available').length,
        reserved: offers.filter((offer) => offer.status === 'reserved').length,
        consumed: offers.filter((offer) => offer.status === 'consumed').length,
        expired: offers.filter((offer) => offer.status === 'expired').length,
    }), [offers]);

    const currentOffers = useMemo(
        () => offers.filter((offer) => offer.status === 'available' || offer.status === 'reserved'),
        [offers],
    );
    const historyOffers = useMemo(
        () => offers.filter((offer) => offer.status === 'consumed' || offer.status === 'expired'),
        [offers],
    );

    if (isLoading) {
        return <LoadingScreen title="オファーを読み込み中" message="保有中の割引オファーと公開中の特典を確認しています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[32px] bg-[linear-gradient(117deg,#17202b_0%,#243447_52%,#2b4158_100%)] p-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
                <div className="space-y-3">
                    <p className="text-xs font-semibold tracking-wide text-[#d2b179]">YOUR OFFERS</p>
                    <h1 className="text-3xl font-semibold">保有オファー</h1>
                    <p className="max-w-3xl text-sm leading-7 text-slate-300">
                        本人確認後に付与された初回予約オファーと、いま公開中の利用者向けキャンペーンをまとめて確認できます。
                    </p>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-4">
                {[
                    ['保有中', summary.available],
                    ['予約確保中', summary.reserved],
                    ['利用済み', summary.consumed],
                    ['期限切れ', summary.expired],
                ].map(([label, count]) => (
                    <article key={label} className="rounded-[24px] bg-white p-5 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">{label}</p>
                        <p className="mt-3 text-3xl font-semibold text-[#17202b]">{count}</p>
                    </article>
                ))}
            </section>

            <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">CURRENT OFFERS</p>
                        <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">いま使えるオファー</h2>
                    </div>
                    <Link
                        to="/user/therapists"
                        className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#ddcfb4] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                    >
                        タチキャストを探す
                    </Link>
                </div>

                {currentOffers.length > 0 ? (
                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        {currentOffers.map((offer) => (
                            <article key={offer.id} className="rounded-[24px] border border-[#e8dfd2] bg-[#fffdf8] p-5">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(offer.status)}`}>
                                        {offer.status_label}
                                    </span>
                                    {offer.benefit_summary ? (
                                        <span className="rounded-full bg-[#f5efe4] px-3 py-1 text-xs font-semibold text-[#7d6852]">
                                            {offer.benefit_summary}
                                        </span>
                                    ) : null}
                                </div>
                                <p className="mt-4 text-lg font-semibold text-[#17202b]">{offer.offer_text ?? 'オファー内容を確認中'}</p>
                                <div className="mt-4 space-y-2 text-sm text-[#68707a]">
                                    <p>有効期限: {offer.offer_expires_at ? formatDateTime(offer.offer_expires_at) : '期限なし'}</p>
                                    {offer.status === 'reserved' && offer.booking_public_id ? (
                                        <p>紐づき中の予約: {offer.booking_public_id}</p>
                                    ) : null}
                                </div>
                                <div className="mt-5">
                                    {offer.status === 'reserved' && offer.booking_public_id ? (
                                        <Link
                                            to={`/user/bookings/${offer.booking_public_id}`}
                                            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140]"
                                        >
                                            予約状況を見る
                                        </Link>
                                    ) : (
                                        <Link
                                            to="/user/therapists"
                                            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140]"
                                        >
                                            このオファーを使う
                                        </Link>
                                    )}
                                </div>
                            </article>
                        ))}
                    </div>
                ) : (
                    <div className="mt-5 rounded-[24px] border border-dashed border-[#e4d7c2] bg-[#fffaf3] px-5 py-6">
                        <p className="text-base font-semibold text-[#17202b]">現在保有しているオファーはありません。</p>
                        <p className="mt-2 text-sm leading-7 text-[#68707a]">
                            本人確認承認後に付与された初回予約オファーや、今後のキャンペーン対象オファーがここに表示されます。
                        </p>
                    </div>
                )}
            </section>

            {historyOffers.length > 0 ? (
                <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                    <div>
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">HISTORY</p>
                        <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">利用済み・期限切れ</h2>
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        {historyOffers.map((offer) => (
                            <article key={offer.id} className="rounded-[24px] border border-[#e8dfd2] bg-[#fffdf8] p-5">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(offer.status)}`}>
                                        {offer.status_label}
                                    </span>
                                    {offer.benefit_summary ? (
                                        <span className="rounded-full bg-[#f5efe4] px-3 py-1 text-xs font-semibold text-[#7d6852]">
                                            {offer.benefit_summary}
                                        </span>
                                    ) : null}
                                </div>
                                <p className="mt-4 text-lg font-semibold text-[#17202b]">{offer.offer_text ?? 'オファー内容を確認中'}</p>
                                <div className="mt-4 space-y-2 text-sm text-[#68707a]">
                                    {offer.consumed_at ? <p>利用日時: {formatDateTime(offer.consumed_at)}</p> : null}
                                    {offer.offer_expires_at ? <p>有効期限: {formatDateTime(offer.offer_expires_at)}</p> : null}
                                    {offer.applied_amount > 0 ? <p>適用額: {formatCurrency(offer.applied_amount)}</p> : null}
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            ) : null}

            {publicCampaigns.length > 0 ? (
                <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                    <div>
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">PUBLIC CAMPAIGNS</p>
                        <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">公開中の利用者向けキャンペーン</h2>
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        {publicCampaigns.map((campaign) => (
                            <article key={campaign.id} className="rounded-[24px] border border-[#e8dfd2] bg-[#fffdf8] p-5">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-[#edf4ff] px-3 py-1 text-xs font-semibold text-[#34557f]">
                                        {campaign.trigger_label}
                                    </span>
                                    <span className="rounded-full bg-[#f5efe4] px-3 py-1 text-xs font-semibold text-[#7d6852]">
                                        {campaign.benefit_summary}
                                    </span>
                                </div>
                                <p className="mt-4 text-lg font-semibold text-[#17202b]">{campaign.offer_text}</p>
                                <div className="mt-4 space-y-2 text-sm text-[#68707a]">
                                    <p>実施期間: {formatDateTime(campaign.starts_at)} から {campaign.ends_at ? formatDateTime(campaign.ends_at) : '終了未定'}</p>
                                    {campaign.offer_valid_days ? (
                                        <p>保有オファー期限: 付与後 {campaign.offer_valid_days} 日</p>
                                    ) : null}
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            ) : null}
        </div>
    );
}
