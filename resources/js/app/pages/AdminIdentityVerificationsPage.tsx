import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import {
    formatDateTime,
    formatIdentityVerificationStatus,
    formatRejectionReason,
} from '../lib/therapist';
import type {
    AdminIdentityVerificationRecord,
    ApiEnvelope,
} from '../lib/types';

type VerificationStatusFilter = 'all' | 'pending' | 'approved' | 'rejected';
type SortField = 'submitted_at' | 'reviewed_at' | 'created_at';
type SortDirection = 'asc' | 'desc';

function normalizeStatusFilter(value: string | null): VerificationStatusFilter {
    if (value === 'pending' || value === 'approved' || value === 'rejected') {
        return value;
    }

    return 'all';
}

function normalizeSortField(value: string | null): SortField {
    if (value === 'reviewed_at' || value === 'created_at') {
        return value;
    }

    return 'submitted_at';
}

function normalizeSortDirection(value: string | null): SortDirection {
    return value === 'asc' ? 'asc' : 'desc';
}

function documentTypeLabel(value: string | null | undefined): string {
    switch (value) {
        case 'driver_license':
            return '運転免許証';
        case 'passport':
            return 'パスポート';
        case 'residence_card':
            return '在留カード';
        case 'my_number_card':
            return 'マイナンバーカード';
        default:
            return value ?? '未設定';
    }
}

function statusTone(status: string): string {
    switch (status) {
        case 'approved':
            return 'bg-[#e8f4ea] text-[#24553a]';
        case 'rejected':
            return 'bg-[#f8e8e5] text-[#8f4337]';
        default:
            return 'bg-[#fff3e3] text-[#8f5c22]';
    }
}

function displayVerificationName(verification: AdminIdentityVerificationRecord): string {
    return verification.account?.display_name?.trim()
        || verification.account?.email
        || `申請 #${verification.id}`;
}

function buildSelectedLink(searchParams: URLSearchParams, selectedId: number): string {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('selected', String(selectedId));
    const query = nextParams.toString();

    return query ? `/admin/identity-verifications?${query}` : '/admin/identity-verifications';
}

export function AdminIdentityVerificationsPage() {
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [verifications, setVerifications] = useState<AdminIdentityVerificationRecord[]>([]);
    const [pageError, setPageError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [documentTypeInput, setDocumentTypeInput] = useState(searchParams.get('document_type') ?? '');
    const [accountInput, setAccountInput] = useState(searchParams.get('account_id') ?? '');
    const [rejectionReason, setRejectionReason] = useState('document_unclear');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const selectedId = searchParams.get('selected');
    const statusFilter = normalizeStatusFilter(searchParams.get('status'));
    const sortField = normalizeSortField(searchParams.get('sort'));
    const direction = normalizeSortDirection(searchParams.get('direction'));
    const documentType = searchParams.get('document_type')?.trim() ?? '';
    const accountId = searchParams.get('account_id')?.trim() ?? '';

    usePageTitle('本人確認審査');
    useToastOnMessage(successMessage, 'success');

    const selectedVerification = useMemo(
        () => verifications.find((verification) => String(verification.id) === selectedId) ?? null,
        [selectedId, verifications],
    );

    const summary = useMemo(() => ({
        total: verifications.length,
        pending: verifications.filter((verification) => verification.status === 'pending').length,
        approved: verifications.filter((verification) => verification.status === 'approved').length,
        rejected: verifications.filter((verification) => verification.status === 'rejected').length,
    }), [verifications]);

    const loadVerifications = useCallback(async (refresh = false) => {
        if (!token) {
            return;
        }

        if (refresh) {
            setIsRefreshing(true);
        } else {
            setIsLoading(true);
        }

        setPageError(null);

        const params = new URLSearchParams();

        if (statusFilter !== 'all') {
            params.set('status', statusFilter);
        }

        if (documentType) {
            params.set('document_type', documentType);
        }

        if (accountId) {
            params.set('account_id', accountId);
        }

        params.set('sort', sortField);
        params.set('direction', direction);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminIdentityVerificationRecord[]>>(`/admin/identity-verifications?${params.toString()}`, { token });
            setVerifications(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '本人確認一覧の取得に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [accountId, direction, documentType, sortField, statusFilter, token]);

    useEffect(() => {
        void loadVerifications();
    }, [loadVerifications]);

    function updateFilters(next: Partial<Record<'status' | 'sort' | 'direction' | 'document_type' | 'account_id' | 'selected', string | null>>) {
        const params = new URLSearchParams(searchParams);

        Object.entries(next).forEach(([key, value]) => {
            if (!value || value === 'all') {
                params.delete(key);
                return;
            }

            params.set(key, value);
        });

        setSearchParams(params, { replace: true });
    }

    async function handleApprove() {
        if (!token || !selectedVerification) {
            return;
        }

        setIsSubmitting(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminIdentityVerificationRecord>>(`/admin/identity-verifications/${selectedVerification.id}/approve`, {
                method: 'POST',
                token,
            });

            const updated = unwrapData(payload);
            setVerifications((current) => current.map((verification) => verification.id === updated.id ? updated : verification));
            setSuccessMessage('本人確認を承認しました。');
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '本人確認の承認に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleReject() {
        if (!token || !selectedVerification || !rejectionReason.trim()) {
            return;
        }

        setIsSubmitting(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminIdentityVerificationRecord>>(`/admin/identity-verifications/${selectedVerification.id}/reject`, {
                method: 'POST',
                token,
                body: {
                    rejection_reason_code: rejectionReason.trim(),
                },
            });

            const updated = unwrapData(payload);
            setVerifications((current) => current.map((verification) => verification.id === updated.id ? updated : verification));
            setSuccessMessage('本人確認を差し戻しました。');
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '本人確認の差し戻しに失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmitting(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="本人確認審査を読み込み中" message="提出状況と年齢確認の審査キューを集約しています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">本人確認審査</p>
                        <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">本人確認審査</h2>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            年齢確認と本人確認の提出一覧です。会員ごとの提出状況を確認し、承認または差し戻しを行えます。
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            void loadVerifications(true);
                        }}
                        disabled={isRefreshing}
                        className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isRefreshing ? '更新中...' : '最新化'}
                    </button>
                </div>
            </section>

            {pageError ? (
                <section className="rounded-[24px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                    {pageError}
                </section>
            ) : null}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                    { label: '総件数', value: summary.total, hint: '現在の表示対象' },
                    { label: '審査待ち', value: summary.pending, hint: '優先確認' },
                    { label: '承認済み', value: summary.approved, hint: '年齢確認済み' },
                    { label: '差し戻し', value: summary.rejected, hint: '再提出待ち' },
                ].map((item) => (
                    <article key={item.label} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">{item.label}</p>
                        <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
                        <p className="mt-2 text-sm text-slate-400">{item.hint}</p>
                    </article>
                ))}
            </section>

            <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">状態</span>
                        <select
                            value={statusFilter}
                            onChange={(event) => updateFilters({ status: event.target.value, selected: null })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="pending">審査待ち</option>
                            <option value="approved">承認済み</option>
                            <option value="rejected">差し戻し</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">書類種別</span>
                        <div className="flex gap-2">
                            <input
                                value={documentTypeInput}
                                onChange={(event) => setDocumentTypeInput(event.target.value)}
                                onBlur={() => updateFilters({ document_type: documentTypeInput.trim() || null, selected: null })}
                                placeholder="運転免許証など"
                                className="min-w-0 flex-1 rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                            />
                        </div>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">アカウントID</span>
                        <input
                            value={accountInput}
                            onChange={(event) => setAccountInput(event.target.value)}
                            onBlur={() => updateFilters({ account_id: accountInput.trim() || null, selected: null })}
                            placeholder="会員番号で絞り込み"
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        />
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">並び替え</span>
                        <select
                            value={sortField}
                            onChange={(event) => updateFilters({ sort: event.target.value, selected: null })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="submitted_at">提出日時</option>
                            <option value="reviewed_at">審査日時</option>
                            <option value="created_at">登録日時</option>
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">順序</span>
                        <select
                            value={direction}
                            onChange={(event) => updateFilters({ direction: event.target.value, selected: null })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="desc">新しい順</option>
                            <option value="asc">古い順</option>
                        </select>
                    </label>
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(360px,0.88fr)]">
                <section className="space-y-4">
                    {verifications.length > 0 ? verifications.map((verification) => {
                        const isSelected = String(verification.id) === selectedId;

                        return (
                            <Link
                                key={verification.id}
                                to={buildSelectedLink(searchParams, verification.id)}
                                className={[
                                    'block rounded-[24px] border p-5 shadow-[0_16px_30px_rgba(23,32,43,0.08)] transition',
                                    isSelected
                                        ? 'border-[#d2b179] bg-[#fff8ee]'
                                        : 'border-[#efe5d7] bg-white hover:bg-[#fffdf8]',
                                ].join(' ')}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-lg font-semibold text-[#17202b]">{displayVerificationName(verification)}</h3>
                                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(verification.status)}`}>
                                                {formatIdentityVerificationStatus(verification.status)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-[#68707a]">{verification.account?.email ?? 'メール未設定'}</p>
                                        <p className="text-xs text-[#7d6852]">申請番号 {verification.id}</p>
                                    </div>

                                    <div className="text-right text-xs text-[#68707a]">
                                        <p>{documentTypeLabel(verification.document_type)}</p>
                                        <p className="mt-1">提出 {formatDateTime(verification.submitted_at)}</p>
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-3 md:grid-cols-3">
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">年齢確認</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">{verification.is_age_verified ? '済み' : '未確認'}</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">男性申告</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">{verification.self_declared_male ? 'あり' : 'なし'}</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">審査者</p>
                                        <p className="mt-1 text-sm font-semibold text-[#17202b]">{verification.reviewed_by?.display_name ?? verification.reviewed_by?.public_id ?? '未設定'}</p>
                                    </div>
                                </div>
                            </Link>
                        );
                    }) : (
                        <section className="rounded-[28px] bg-white px-6 py-10 text-center shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <p className="text-sm leading-7 text-[#68707a]">条件に合う本人確認提出はありません。</p>
                        </section>
                    )}
                </section>

                <aside className="space-y-5">
                    {actionError ? (
                        <section className="rounded-[24px] border border-[#f1d4b5] bg-[#fff4e8] px-5 py-4 text-sm text-[#9a4b35]">
                            {actionError}
                        </section>
                    ) : null}

                    {selectedVerification ? (
                        <section className="space-y-5">
                            <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">審査詳細</p>
                                        <h3 className="mt-2 text-2xl font-semibold text-[#17202b]">{displayVerificationName(selectedVerification)}</h3>
                                        <p className="mt-2 text-sm text-[#68707a]">{selectedVerification.account?.email ?? 'メール未設定'}</p>
                                        <p className="mt-1 text-xs text-[#7d6852]">申請番号 {selectedVerification.id}</p>
                                    </div>
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(selectedVerification.status)}`}>
                                        {formatIdentityVerificationStatus(selectedVerification.status)}
                                    </span>
                                </div>

                                <div className="mt-5 grid gap-4 md:grid-cols-2">
                                    <section className="rounded-[20px] border border-[#efe5d7] bg-[#fffdf8] p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-sm font-semibold text-[#17202b]">本人確認書類</p>
                                            {selectedVerification.document_file_url ? (
                                                <a
                                                    href={selectedVerification.document_file_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-xs font-semibold text-[#8f5c22] hover:text-[#6f4718]"
                                                >
                                                    別タブで開く
                                                </a>
                                            ) : null}
                                        </div>
                                        {selectedVerification.document_file_url ? (
                                            <img
                                                src={selectedVerification.document_file_url}
                                                alt="本人確認書類"
                                                className="mt-3 h-64 w-full rounded-[16px] border border-[#efe5d7] object-contain bg-[#f8f4ed]"
                                            />
                                        ) : (
                                            <div className="mt-3 flex h-64 items-center justify-center rounded-[16px] border border-dashed border-[#d9c9ae] bg-[#f8f4ed] text-sm text-[#68707a]">
                                                書類画像はまだ確認できません。
                                            </div>
                                        )}
                                    </section>

                                    <section className="rounded-[20px] border border-[#efe5d7] bg-[#fffdf8] p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-sm font-semibold text-[#17202b]">セルフィー</p>
                                            {selectedVerification.selfie_file_url ? (
                                                <a
                                                    href={selectedVerification.selfie_file_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-xs font-semibold text-[#8f5c22] hover:text-[#6f4718]"
                                                >
                                                    別タブで開く
                                                </a>
                                            ) : null}
                                        </div>
                                        {selectedVerification.selfie_file_url ? (
                                            <img
                                                src={selectedVerification.selfie_file_url}
                                                alt="本人確認セルフィー"
                                                className="mt-3 h-64 w-full rounded-[16px] border border-[#efe5d7] object-contain bg-[#f8f4ed]"
                                            />
                                        ) : (
                                            <div className="mt-3 flex h-64 items-center justify-center rounded-[16px] border border-dashed border-[#d9c9ae] bg-[#f8f4ed] text-sm text-[#68707a]">
                                                セルフィー画像はまだ確認できません。
                                            </div>
                                        )}
                                    </section>
                                </div>

                                <div className="mt-5 grid gap-3">
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">提出情報</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">{documentTypeLabel(selectedVerification.document_type)}</p>
                                        <p className="mt-1">提出日時 {formatDateTime(selectedVerification.submitted_at)}</p>
                                        <p className="mt-1">審査日時 {formatDateTime(selectedVerification.reviewed_at)}</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">確認結果</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">年齢確認 {selectedVerification.is_age_verified ? '済み' : '未確認'}</p>
                                        <p className="mt-1">男性申告 {selectedVerification.self_declared_male ? 'あり' : 'なし'}</p>
                                        <p className="mt-1">生年 {selectedVerification.birth_year ?? '未設定'}</p>
                                    </div>
                                    <div className="rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                                        <p className="text-xs font-semibold tracking-wide text-[#7d6852]">審査ログ</p>
                                        <p className="mt-1 font-semibold text-[#17202b]">{selectedVerification.reviewed_by?.display_name ?? selectedVerification.reviewed_by?.public_id ?? '未設定'}</p>
                                        <p className="mt-1">理由 {formatRejectionReason(selectedVerification.rejection_reason_code)}</p>
                                        <p className="mt-1">削除予定 {formatDateTime(selectedVerification.purge_after)}</p>
                                    </div>
                                </div>
                            </article>

                            <article className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">審査アクション</p>
                                {selectedVerification.status === 'pending' ? (
                                    <div className="mt-4 space-y-4">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                void handleApprove();
                                            }}
                                            disabled={isSubmitting || !selectedVerification.self_declared_male}
                                            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#243140] disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isSubmitting ? '処理中...' : '承認する'}
                                        </button>

                                        <label className="block space-y-2">
                                            <span className="text-sm font-semibold text-[#17202b]">差し戻し理由コード</span>
                                            <input
                                                value={rejectionReason}
                                                onChange={(event) => setRejectionReason(event.target.value)}
                                                placeholder="document_unclear"
                                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                            />
                                        </label>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                void handleReject();
                                            }}
                                            disabled={isSubmitting || !rejectionReason.trim()}
                                            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f8f4ed] disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isSubmitting ? '処理中...' : '差し戻す'}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="mt-4 rounded-[18px] bg-[#f8f4ed] px-4 py-3 text-sm text-[#48505a]">
                                        この提出はすでに審査済みです。
                                    </div>
                                )}
                            </article>
                        </section>
                    ) : (
                        <section className="rounded-[28px] bg-white px-6 py-10 text-center shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                            <p className="text-sm leading-7 text-[#68707a]">
                                一覧から本人確認提出を選ぶと、ここに審査詳細が表示されます。
                            </p>
                        </section>
                    )}
                </aside>
            </div>
        </div>
    );
}
