import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { getDefaultServiceAddress, getServiceAddressLabel } from '../lib/discovery';
import type {
    ApiEnvelope,
    ServiceAddress,
    TherapistDetail,
    TherapistTravelRequestRecord,
} from '../lib/types';

const prefectureOptions = [
    '北海道',
    '青森県',
    '岩手県',
    '宮城県',
    '秋田県',
    '山形県',
    '福島県',
    '茨城県',
    '栃木県',
    '群馬県',
    '埼玉県',
    '千葉県',
    '東京都',
    '神奈川県',
    '新潟県',
    '富山県',
    '石川県',
    '福井県',
    '山梨県',
    '長野県',
    '岐阜県',
    '静岡県',
    '愛知県',
    '三重県',
    '滋賀県',
    '京都府',
    '大阪府',
    '兵庫県',
    '奈良県',
    '和歌山県',
    '鳥取県',
    '島根県',
    '岡山県',
    '広島県',
    '山口県',
    '徳島県',
    '香川県',
    '愛媛県',
    '高知県',
    '福岡県',
    '佐賀県',
    '長崎県',
    '熊本県',
    '大分県',
    '宮崎県',
    '鹿児島県',
    '沖縄県',
];

export function UserTherapistTravelRequestPage() {
    const { publicId } = useParams<{ publicId: string }>();
    const { token } = useAuth();
    const [searchParams] = useSearchParams();
    const [therapistDetail, setTherapistDetail] = useState<TherapistDetail | null>(null);
    const [serviceAddresses, setServiceAddresses] = useState<ServiceAddress[]>([]);
    const [prefecture, setPrefecture] = useState('');
    const [message, setMessage] = useState('');
    const [pageError, setPageError] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [successRequest, setSuccessRequest] = useState<TherapistTravelRequestRecord | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    usePageTitle('出張リクエスト');

    const selectedAddress = useMemo(() => {
        const requestedAddressId = searchParams.get('service_address_id');

        if (!requestedAddressId) {
            return getDefaultServiceAddress(serviceAddresses);
        }

        return serviceAddresses.find((address) => address.public_id === requestedAddressId)
            ?? getDefaultServiceAddress(serviceAddresses);
    }, [searchParams, serviceAddresses]);

    useEffect(() => {
        let isMounted = true;

        async function bootstrap() {
            if (!token || !publicId) {
                return;
            }

            try {
                const [detailPayload, addressPayload] = await Promise.all([
                    apiRequest<ApiEnvelope<TherapistDetail>>(`/therapists/${publicId}`, { token }),
                    apiRequest<ApiEnvelope<ServiceAddress[]>>('/me/service-addresses', { token }),
                ]);

                if (!isMounted) {
                    return;
                }

                const nextAddresses = unwrapData(addressPayload);
                const nextDetail = unwrapData(detailPayload);
                const requestedPrefecture = searchParams.get('prefecture');
                const fallbackPrefecture = requestedPrefecture
                    ?? getDefaultServiceAddress(nextAddresses)?.prefecture
                    ?? nextAddresses[0]?.prefecture
                    ?? '';

                setTherapistDetail(nextDetail);
                setServiceAddresses(nextAddresses);
                setPrefecture((current) => current || fallbackPrefecture);
            } catch (requestError) {
                if (!isMounted) {
                    return;
                }

                const nextMessage = requestError instanceof ApiError
                    ? requestError.message
                    : '出張リクエスト画面の準備に失敗しました。';

                setPageError(nextMessage);
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        }

        void bootstrap();

        return () => {
            isMounted = false;
        };
    }, [publicId, searchParams, token]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !publicId) {
            return;
        }

        setIsSubmitting(true);
        setSubmitError(null);

        try {
            const payload = await apiRequest<ApiEnvelope<TherapistTravelRequestRecord>>(
                `/therapists/${publicId}/travel-requests`,
                {
                    method: 'POST',
                    token,
                    body: {
                        prefecture,
                        message: message.trim(),
                    },
                },
            );

            setSuccessRequest(unwrapData(payload));
            setMessage('');
        } catch (requestError) {
            const nextMessage = requestError instanceof ApiError
                ? requestError.message
                : '出張リクエストの送信に失敗しました。';

            setSubmitError(nextMessage);
        } finally {
            setIsSubmitting(false);
        }
    }

    if (!publicId) {
        return <Navigate to="/user/therapists" replace />;
    }

    if (isLoading) {
        return <LoadingScreen title="出張リクエストを準備中" message="セラピスト情報と待ち合わせ場所を確認しています。" />;
    }

    const detailPath = therapistDetail ? `/therapists/${therapistDetail.public_id}?${searchParams.toString()}` : '/user/therapists';
    const availabilityPath = therapistDetail
        ? `/user/therapists/${therapistDetail.public_id}/availability?${searchParams.toString()}`
        : '/user/therapists';

    return (
        <div className="space-y-8">
            <section className="rounded-[32px] bg-[linear-gradient(140deg,#17202b_0%,#223245_100%)] p-6 text-white shadow-[0_24px_60px_rgba(15,23,42,0.28)] sm:p-8">
                <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">TRAVEL REQUEST</p>
                <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <h1 className="text-3xl font-semibold">このエリアで会いたいことを伝える</h1>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            空き枠が合わないときや、現在公開していないエリアから需要を届けたいときに使えます。
                            これは予約ではなく需要通知で、連絡先交換や日程確定は含みません。
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <Link
                            to={detailPath}
                            className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                        >
                            プロフィールに戻る
                        </Link>
                        <Link
                            to={availabilityPath}
                            className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                        >
                            空き時間を見る
                        </Link>
                    </div>
                </div>
            </section>

            {pageError ? (
                <section className="rounded-[24px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                    {pageError}
                </section>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_360px]">
                <section className="space-y-6">
                    <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">THERAPIST</p>
                        <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">
                            {therapistDetail?.public_name ?? 'セラピストを確認中'}
                        </h2>
                        <p className="mt-3 text-sm leading-7 text-[#68707a]">
                            送った内容はセラピスト側の「出張リクエスト一覧」に届きます。返信機能はないので、
                            今後そのエリアで空き枠が公開される判断材料として使われます。
                        </p>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">現在の待ち合わせ場所</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    {selectedAddress ? getServiceAddressLabel(selectedAddress) : '未登録'}
                                </p>
                            </div>
                            <div className="rounded-[20px] bg-[#f8f4ed] px-4 py-4">
                                <p className="text-xs font-semibold tracking-wide text-[#7d6852]">補足</p>
                                <p className="mt-2 text-sm font-semibold text-[#17202b]">
                                    同じ都道府県への送信は 7 日以内に 1 回までです
                                </p>
                            </div>
                        </div>
                    </article>

                    <form onSubmit={(event) => void handleSubmit(event)} className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">REQUEST FORM</p>
                        <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">出張リクエストを送る</h2>
                        <p className="mt-3 text-sm leading-7 text-[#68707a]">
                            希望エリアと、どういうときに会いたいかを簡潔に伝えます。連絡先、SNS、外部決済の話題は送れません。
                        </p>

                        <div className="mt-6 space-y-5">
                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">希望エリア（都道府県）</span>
                                <select
                                    value={prefecture}
                                    onChange={(event) => setPrefecture(event.target.value)}
                                    className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                >
                                    <option value="">都道府県を選択してください</option>
                                    {prefectureOptions.map((option) => (
                                        <option key={option} value={option}>
                                            {option}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">メッセージ</span>
                                <textarea
                                    value={message}
                                    onChange={(event) => setMessage(event.target.value)}
                                    rows={6}
                                    maxLength={1000}
                                    placeholder="この県で夜に空き枠が出たら行きたいです、など希望を送れます。"
                                    className="w-full rounded-[22px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm leading-7 text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                />
                                <div className="flex items-center justify-between gap-3 text-xs text-[#7d6852]">
                                    <span>外部連絡先やSNSアカウントの記載はできません。</span>
                                    <span>{message.length}/1000</span>
                                </div>
                            </label>

                            {submitError ? (
                                <div className="rounded-[20px] border border-[#f1d4b5] bg-[#fff4e8] px-4 py-3 text-sm text-[#9a4b35]">
                                    {submitError}
                                </div>
                            ) : null}

                            {successRequest ? (
                                <div className="rounded-[20px] border border-[#d2e5d5] bg-[#edf8ef] px-4 py-4 text-sm text-[#24553a]">
                                    <p className="font-semibold">出張リクエストを送信しました。</p>
                                    <p className="mt-2 leading-7">
                                        {successRequest.prefecture} 宛ての需要通知として保存されています。空き枠が合わないときは、
                                        日付を変えてもう一度公開枠も確認できます。
                                    </p>
                                </div>
                            ) : null}

                            <div className="flex flex-wrap gap-3">
                                <button
                                    type="submit"
                                    disabled={isSubmitting || !prefecture || !message.trim()}
                                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-bold text-[#1a2430] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isSubmitting ? '送信しています...' : '出張リクエストを送る'}
                                </button>
                                <Link
                                    to={detailPath}
                                    className="inline-flex min-h-11 items-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                                >
                                    戻る
                                </Link>
                            </div>
                        </div>
                    </form>
                </section>

                <aside className="space-y-5">
                    <section className="rounded-[28px] bg-[#fffcf7] p-6 shadow-[0_18px_36px_rgba(23,32,43,0.1)]">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">HOW IT WORKS</p>
                        <ul className="mt-4 space-y-3 text-sm leading-7 text-[#48505a]">
                            <li>送信内容はセラピストのマイページだけに届きます。</li>
                            <li>予約の確保や返信を保証する機能ではありません。</li>
                            <li>後日そのエリアの空き枠が公開されたら、通常の予定予約へ進めます。</li>
                        </ul>
                    </section>

                    <section className="rounded-[28px] bg-[#17202b] p-6 text-white shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">TIPS</p>
                        <p className="mt-3 text-sm leading-7 text-[#d8d3ca]">
                            まずは都道府県と希望タイミングを簡潔に伝えるのがおすすめです。
                            詳しい住所や直接連絡を誘う文面は送れません。
                        </p>
                    </section>
                </aside>
            </div>
        </div>
    );
}
