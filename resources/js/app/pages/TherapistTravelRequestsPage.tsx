import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatDateTime } from '../lib/therapist';
import type { ApiEnvelope, TherapistTravelRequestRecord } from '../lib/types';

type StatusFilter = 'all' | 'unread' | 'read' | 'archived';

function normalizeStatusFilter(value: string | null): StatusFilter {
    if (value === 'unread' || value === 'read' || value === 'archived') {
        return value;
    }

    return 'all';
}

function normalizeQuery(value: string | null): string {
    return value?.trim() ?? '';
}

function statusLabel(status: TherapistTravelRequestRecord['status']): string {
    switch (status) {
        case 'unread':
            return '未読';
        case 'read':
            return '確認済み';
        case 'archived':
            return 'アーカイブ済み';
        default:
            return status;
    }
}

function statusTone(status: TherapistTravelRequestRecord['status']): string {
    switch (status) {
        case 'unread':
            return 'bg-[#fff2dd] text-[#8b5a16]';
        case 'read':
            return 'bg-[#eaf2ff] text-[#30527a]';
        case 'archived':
            return 'bg-[#f1efe8] text-[#48505a]';
        default:
            return 'bg-[#f1efe8] text-[#48505a]';
    }
}

function filterRequests(
    requests: TherapistTravelRequestRecord[],
    status: StatusFilter,
    query: string,
): TherapistTravelRequestRecord[] {
    const normalizedQuery = query.trim().toLowerCase();

    return requests.filter((request) => {
        if (status !== 'all' && request.status !== status) {
            return false;
        }

        if (!normalizedQuery) {
            return true;
        }

        const haystack = [
            request.prefecture,
            request.message ?? '',
            request.sender?.display_name ?? '',
        ]
            .join(' ')
            .toLowerCase();

        return haystack.includes(normalizedQuery);
    });
}

function buildTravelRequestDetailPath(publicId: string, search: string): string {
    return search ? `/therapist/travel-requests/${publicId}${search}` : `/therapist/travel-requests/${publicId}`;
}

export function TherapistTravelRequestsPage() {
    const { token } = useAuth();
    const { publicId } = useParams<{ publicId: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [requests, setRequests] = useState<TherapistTravelRequestRecord[]>([]);
    const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isMarkingRead, setIsMarkingRead] = useState(false);
    const [isArchiving, setIsArchiving] = useState(false);

    const statusFilter = normalizeStatusFilter(searchParams.get('status'));
    const query = normalizeQuery(searchParams.get('q'));

    usePageTitle('出張リクエスト一覧');
    useToastOnMessage(error, 'error');
    useToastOnMessage(successMessage, 'success');

    async function loadRequests(nextIsRefresh = false) {
        if (!token) {
            return;
        }

        if (nextIsRefresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        try {
            const payload = await apiRequest<ApiEnvelope<TherapistTravelRequestRecord[]>>('/me/therapist/travel-requests', {
                token,
            });

            const nextRequests = unwrapData(payload);
            setRequests(nextRequests);
            setError(null);
            setSelectedRequestId((current) => {
                const preferredId = publicId ?? current;

                if (preferredId && nextRequests.some((request) => request.public_id === preferredId)) {
                    return preferredId;
                }

                return nextRequests[0]?.public_id ?? null;
            });
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '出張リクエスト一覧の取得に失敗しました。';

            setError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }

    useEffect(() => {
        void loadRequests();
    }, [token]);

    const filteredRequests = useMemo(
        () => filterRequests(requests, statusFilter, query),
        [query, requests, statusFilter],
    );

    useEffect(() => {
        if (filteredRequests.length === 0) {
            setSelectedRequestId(null);

            if (publicId) {
                navigate(location.search ? `/therapist/travel-requests${location.search}` : '/therapist/travel-requests', { replace: true });
            }

            return;
        }

        if (publicId) {
            const matchedRequest = filteredRequests.find((request) => request.public_id === publicId);

            if (matchedRequest) {
                if (selectedRequestId !== matchedRequest.public_id) {
                    setSelectedRequestId(matchedRequest.public_id);
                }

                return;
            }

            const fallbackId = filteredRequests[0].public_id;
            setSelectedRequestId(fallbackId);
            navigate(buildTravelRequestDetailPath(fallbackId, location.search), { replace: true });
            return;
        }

        if (!selectedRequestId || !filteredRequests.some((request) => request.public_id === selectedRequestId)) {
            setSelectedRequestId(filteredRequests[0].public_id);
        }
    }, [filteredRequests, location.search, navigate, publicId, selectedRequestId]);

    const summary = useMemo(() => ({
        total: requests.length,
        unread: requests.filter((request) => request.status === 'unread').length,
        read: requests.filter((request) => request.status === 'read').length,
        archived: requests.filter((request) => request.status === 'archived').length,
    }), [requests]);

    const selectedRequest = useMemo(
        () => requests.find((request) => request.public_id === selectedRequestId) ?? null,
        [requests, selectedRequestId],
    );

    async function markAsRead() {
        if (!token || !selectedRequest || selectedRequest.status !== 'unread' || isMarkingRead) {
            return;
        }

        setIsMarkingRead(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<TherapistTravelRequestRecord>>(
                `/me/therapist/travel-requests/${selectedRequest.public_id}/read`,
                {
                    method: 'POST',
                    token,
                },
            );

            const updated = unwrapData(payload);
            setRequests((current) => current.map((request) => (
                request.public_id === updated.public_id ? updated : request
            )));
            setSuccessMessage('既読に更新しました。需要メモとして一覧に残ります。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '既読化に失敗しました。';

            setError(message);
        } finally {
            setIsMarkingRead(false);
        }
    }

    async function archiveRequest() {
        if (!token || !selectedRequest || isArchiving) {
            return;
        }

        setIsArchiving(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<TherapistTravelRequestRecord>>(
                `/me/therapist/travel-requests/${selectedRequest.public_id}/archive`,
                {
                    method: 'POST',
                    token,
                },
            );

            const updated = unwrapData(payload);
            setRequests((current) => current.map((request) => (
                request.public_id === updated.public_id ? updated : request
            )));
            setSuccessMessage('アーカイブしました。必要なときは一覧から確認できます。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : 'アーカイブに失敗しました。';

            setError(message);
        } finally {
            setIsArchiving(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="出張リクエストを読み込み中" message="都道府県別の需要通知とメッセージをまとめています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[32px] bg-[linear-gradient(117deg,#17202b_0%,#243447_52%,#2b4158_100%)] p-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">出張需要</p>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold">出張リクエスト一覧</h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300">
                                予約にならなかった地域から届いた需要メッセージをまとめて確認します。
                                返信機能は持たせず、どのエリアに声が集まっているかを判断するための受信箱として使います。
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                void loadRequests(true);
                            }}
                            disabled={isRefreshing}
                            className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isRefreshing ? '更新中...' : '更新'}
                        </button>
                        <Link
                            to="/therapist/availability"
                            className="inline-flex items-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105"
                        >
                            空き枠を見直す
                        </Link>
                    </div>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                    { label: '受信総数', value: summary.total, hint: 'これまで届いた需要通知' },
                    { label: '未読', value: summary.unread, hint: 'まだ確認していないもの' },
                    { label: '確認済み', value: summary.read, hint: '需要メモとして保持中' },
                    { label: 'アーカイブ', value: summary.archived, hint: '整理済みのメッセージ' },
                ].map((item) => (
                    <article
                        key={item.label}
                        className="rounded-[24px] border border-white/10 bg-white/5 p-5 shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
                    >
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">{item.label}</p>
                        <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-300">{item.hint}</p>
                    </article>
                ))}
            </section>

            <section className="rounded-[28px] bg-white p-5 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                    <div className="space-y-4">
                        <div>
                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">絞り込み</p>
                            <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">表示条件</h2>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {[
                                ['all', 'すべて'],
                                ['unread', '未読'],
                                ['read', '確認済み'],
                                ['archived', 'アーカイブ'],
                            ].map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => {
                                        setSearchParams((previous) => {
                                            const next = new URLSearchParams(previous);

                                            if (value === 'all') {
                                                next.delete('status');
                                            } else {
                                                next.set('status', value);
                                            }

                                            return next;
                                        });
                                    }}
                                    className={[
                                        'rounded-full px-4 py-2 text-sm font-semibold transition',
                                        statusFilter === value
                                            ? 'bg-[#17202b] text-white'
                                            : 'bg-[#f5efe4] text-[#48505a] hover:bg-[#ebe2d3]',
                                    ].join(' ')}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="w-full max-w-md space-y-2">
                        <label htmlFor="travel-request-query" className="text-sm font-semibold text-[#17202b]">
                            エリア・送信者・本文で検索
                        </label>
                        <input
                            id="travel-request-query"
                            type="search"
                            value={query}
                            onChange={(event) => {
                                setSearchParams((previous) => {
                                    const next = new URLSearchParams(previous);

                                    if (event.target.value.trim()) {
                                        next.set('q', event.target.value);
                                    } else {
                                        next.delete('q');
                                    }

                                    return next;
                                });
                            }}
                            placeholder="例: 北海道 / 札幌 / 出張"
                            className="w-full rounded-[16px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                        />
                    </div>
                </div>

                <div className="mt-6 flex items-center justify-between gap-4 border-t border-[#efe5d7] pt-5">
                    <p className="text-sm text-[#68707a]">{filteredRequests.length}件表示</p>
                    <p className="text-sm text-[#68707a]">
                        一方向の需要通知なので、必要なら既読やアーカイブで整理していきます。
                    </p>
                </div>
            </section>

            <section className="space-y-4">
                {filteredRequests.length > 0 && filteredRequests.length > 1 ? (
                    <section className="rounded-[28px] bg-white p-5 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div className="space-y-2">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">表示中のリクエスト</p>
                                <h2 className="text-2xl font-semibold text-[#17202b]">確認する需要通知を選びます</h2>
                                <p className="text-sm leading-7 text-[#68707a]">
                                    同じ情報を左右に重ねず、ここで切り替えて内容を確認できるようにしています。
                                </p>
                            </div>

                            <div className="w-full max-w-xl space-y-2">
                                <label htmlFor="travel-request-selector" className="text-sm font-semibold text-[#17202b]">
                                    表示する需要通知
                                </label>
                                <select
                                    id="travel-request-selector"
                                    value={selectedRequestId ?? ''}
                                    onChange={(event) => {
                                        const nextPublicId = event.target.value;
                                        setSelectedRequestId(nextPublicId);
                                        setSuccessMessage(null);
                                        navigate(buildTravelRequestDetailPath(nextPublicId, location.search));
                                    }}
                                    className="w-full rounded-[16px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm font-medium text-[#17202b] outline-none transition focus:border-[#c6a16a]"
                                >
                                    {filteredRequests.map((request) => (
                                        <option key={request.public_id} value={request.public_id}>
                                            {`${request.sender?.display_name ?? '送信者情報を確認中'} / ${request.prefecture} / ${formatDateTime(request.created_at)}`}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </section>
                ) : null}

                {filteredRequests.length > 0 ? (
                    selectedRequest ? (
                        <section className="space-y-5 rounded-[28px] border border-white/10 bg-white/5 p-6">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="space-y-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(selectedRequest.status)}`}>
                                            {statusLabel(selectedRequest.status)}
                                        </span>
                                        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
                                            {selectedRequest.prefecture}
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        <h2 className="text-2xl font-semibold text-white">
                                            {selectedRequest.sender?.display_name ?? '送信者情報を確認中'}
                                        </h2>
                                        <p className="text-sm text-slate-300">
                                            受信 {formatDateTime(selectedRequest.created_at)}
                                        </p>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-white/10 bg-[#17202b] px-4 py-3 text-right">
                                    <p className="text-xs font-semibold tracking-wide text-slate-400">受信番号</p>
                                    <p className="mt-2 font-mono text-xs text-white">{selectedRequest.public_id}</p>
                                </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="rounded-2xl border border-white/10 bg-[#17202b] px-5 py-4">
                                    <p className="text-xs font-semibold tracking-wide text-slate-400">希望エリア</p>
                                    <p className="mt-2 text-sm text-white">{selectedRequest.prefecture}</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-[#17202b] px-5 py-4">
                                    <p className="text-xs font-semibold tracking-wide text-slate-400">状態</p>
                                    <p className="mt-2 text-sm text-white">{statusLabel(selectedRequest.status)}</p>
                                    <p className="mt-2 text-xs text-slate-400">
                                        {selectedRequest.read_at ? `既読 ${formatDateTime(selectedRequest.read_at)}` : 'まだ既読にしていません'}
                                    </p>
                                </div>
                            </div>

                            <section className="rounded-[24px] border border-white/10 bg-[#17202b] px-5 py-5">
                                <h3 className="text-lg font-semibold text-white">メッセージ</h3>
                                <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-200">
                                    {selectedRequest.message ?? '本文を表示できませんでした。'}
                                </p>
                            </section>

                            <section className="rounded-[24px] border border-[#f0d6a4] bg-[#fff7e8] px-5 py-5 text-[#17202b]">
                                <h3 className="text-lg font-semibold">運用メモ</h3>
                                <p className="mt-3 text-sm leading-7 text-[#475569]">
                                    これは予約や返信ではなく、「このエリアで会いたい人がいる」という需要メモです。
                                    空き枠や出動拠点を見直す材料として使い、整理できたものはアーカイブしていく運用を想定しています。
                                </p>
                            </section>

                            <section className="flex flex-wrap gap-3">
                                {selectedRequest.status === 'unread' ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            void markAsRead();
                                        }}
                                        disabled={isMarkingRead || isArchiving}
                                        className="inline-flex items-center rounded-full bg-[#f6e7cb] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f3ddb2] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isMarkingRead ? '更新中...' : '既読にする'}
                                    </button>
                                ) : null}
                                {selectedRequest.status !== 'archived' ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            void archiveRequest();
                                        }}
                                        disabled={isArchiving || isMarkingRead}
                                        className="inline-flex items-center rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isArchiving ? '整理中...' : 'アーカイブする'}
                                    </button>
                                ) : null}
                                <Link
                                    to="/therapist/availability"
                                    className="inline-flex items-center rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/6"
                                >
                                    空き枠を開く
                                </Link>
                            </section>
                        </section>
                    ) : (
                        <section className="rounded-[28px] border border-dashed border-white/10 bg-white/5 px-6 py-10 text-center">
                            <p className="text-sm font-semibold text-white">確認する出張リクエストを選んでください。</p>
                            <p className="mt-3 text-sm leading-7 text-slate-300">
                                上の条件に合う通知がある場合は、自動で最新のリクエストを表示します。
                            </p>
                        </section>
                    )
                ) : (
                    <section className="rounded-[28px] border border-dashed border-white/15 bg-white/5 p-8 text-center">
                        <h2 className="text-2xl font-semibold text-white">条件に合う出張リクエストはありません</h2>
                        <p className="mt-3 text-sm leading-7 text-slate-300">
                            まだ受信がないか、検索条件が厳しめです。公開エリアや空き枠を整えておくと、需要が届いたときに動きやすくなります。
                        </p>
                        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                            <Link
                                to="/therapist/availability"
                                className="inline-flex items-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105"
                            >
                                空き枠を確認
                            </Link>
                            <Link
                                to="/therapist/profile"
                                className="inline-flex items-center rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/6"
                            >
                                プロフィールを確認
                            </Link>
                        </div>
                    </section>
                )}
            </section>
        </div>
    );
}
