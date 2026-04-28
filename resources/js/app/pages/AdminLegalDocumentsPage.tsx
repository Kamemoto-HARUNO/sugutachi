import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatDateTime } from '../lib/therapist';
import type {
    AdminLegalDocumentRecord,
    ApiEnvelope,
} from '../lib/types';

type PublishedFilter = 'all' | '1' | '0';

const LEGAL_DOCUMENT_TYPE_OPTIONS = [
    { value: 'terms', label: '利用規約' },
    { value: 'privacy', label: 'プライバシーポリシー' },
    { value: 'commerce', label: '特定商取引法に基づく表記' },
] as const;

function normalizePublishedFilter(value: string | null): PublishedFilter {
    if (value === '1' || value === '0') {
        return value;
    }

    return 'all';
}

function buildSelectedLink(searchParams: URLSearchParams, id: number): string {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('selected', String(id));
    const query = nextParams.toString();

    return query ? `/admin/legal-documents?${query}` : '/admin/legal-documents';
}

function toIsoOrNull(value: string): string | null {
    if (!value.trim()) {
        return null;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toInputDateTime(value: string | null): string {
    if (!value) {
        return '';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toISOString().slice(0, 16);
}

function documentTypeLabel(value: string): string {
    return LEGAL_DOCUMENT_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function getConsentCount(document: AdminLegalDocumentRecord): number {
    return document.consent_count
        ?? (document.acceptances_count ?? 0) + (document.booking_consents_count ?? 0);
}

export function AdminLegalDocumentsPage() {
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [documents, setDocuments] = useState<AdminLegalDocumentRecord[]>([]);
    const [pageError, setPageError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [createDocumentType, setCreateDocumentType] = useState('terms');
    const [createVersion, setCreateVersion] = useState('');
    const [createTitle, setCreateTitle] = useState('');
    const [createBody, setCreateBody] = useState('');
    const [createPublishedAt, setCreatePublishedAt] = useState('');
    const [createEffectiveAt, setCreateEffectiveAt] = useState('');
    const [editTitle, setEditTitle] = useState('');
    const [editBody, setEditBody] = useState('');
    const [editPublishedAt, setEditPublishedAt] = useState('');
    const [editEffectiveAt, setEditEffectiveAt] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
    const [isSubmittingUpdate, setIsSubmittingUpdate] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const selectedId = searchParams.get('selected');
    const publishedFilter = normalizePublishedFilter(searchParams.get('is_published'));
    const documentType = searchParams.get('document_type')?.trim() ?? '';

    usePageTitle('法務文書管理');
    useToastOnMessage(successMessage, 'success');
    useToastOnMessage(actionError, 'error');

    const selectedDocument = useMemo(
        () => documents.find((document) => String(document.id) === selectedId) ?? null,
        [documents, selectedId],
    );

    const summary = useMemo(() => ({
        total: documents.length,
        published: documents.filter((document) => document.is_published).length,
        drafts: documents.filter((document) => !document.is_published).length,
        accepted: documents.reduce((sum, document) => sum + getConsentCount(document), 0),
        uniqueTypes: new Set(documents.map((document) => document.document_type)).size,
    }), [documents]);

    const loadDocuments = useCallback(async (refresh = false) => {
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

        if (documentType) {
            params.set('document_type', documentType);
        }

        if (publishedFilter !== 'all') {
            params.set('is_published', publishedFilter);
        }

        try {
            const payload = await apiRequest<ApiEnvelope<AdminLegalDocumentRecord[]>>(`/admin/legal-documents?${params.toString()}`, { token });
            setDocuments(unwrapData(payload));
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '法務文書の取得に失敗しました。';

            setPageError(message);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [documentType, publishedFilter, token]);

    useEffect(() => {
        void loadDocuments();
    }, [loadDocuments]);

    useEffect(() => {
        if (!selectedDocument) {
            setEditTitle('');
            setEditBody('');
            setEditPublishedAt('');
            setEditEffectiveAt('');
            return;
        }

        setEditTitle(selectedDocument.title);
        setEditBody(selectedDocument.body);
        setEditPublishedAt(toInputDateTime(selectedDocument.published_at));
        setEditEffectiveAt(toInputDateTime(selectedDocument.effective_at));
    }, [selectedDocument]);

    function updateFilters(next: Partial<Record<'document_type' | 'is_published' | 'selected', string | null>>) {
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

    async function handleCreate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !createDocumentType.trim() || !createVersion.trim() || !createTitle.trim() || !createBody.trim()) {
            return;
        }

        setIsSubmittingCreate(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminLegalDocumentRecord>>('/admin/legal-documents', {
                method: 'POST',
                token,
                body: {
                    document_type: createDocumentType.trim(),
                    version: createVersion.trim(),
                    title: createTitle.trim(),
                    body: createBody.trim(),
                    published_at: toIsoOrNull(createPublishedAt) ?? undefined,
                    effective_at: toIsoOrNull(createEffectiveAt) ?? undefined,
                },
            });

            const created = unwrapData(payload);
            setCreateVersion('');
            setCreateTitle('');
            setCreateBody('');
            setCreatePublishedAt('');
            setCreateEffectiveAt('');
            setSuccessMessage('法務文書を追加しました。');
            updateFilters({ selected: String(created.id) });
            await loadDocuments(true);
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '法務文書の追加に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmittingCreate(false);
        }
    }

    async function handleUpdate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !selectedDocument || selectedDocument.is_published || !editTitle.trim() || !editBody.trim()) {
            return;
        }

        setIsSubmittingUpdate(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            const payload = await apiRequest<ApiEnvelope<AdminLegalDocumentRecord>>(`/admin/legal-documents/${selectedDocument.id}`, {
                method: 'PATCH',
                token,
                body: {
                    title: editTitle.trim(),
                    body: editBody.trim(),
                    published_at: toIsoOrNull(editPublishedAt),
                    effective_at: toIsoOrNull(editEffectiveAt),
                },
            });

            const updated = unwrapData(payload);
            setDocuments((current) => current.map((document) => document.id === updated.id ? updated : document));
            setSuccessMessage('ドラフト文書を更新しました。');
            await loadDocuments(true);
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '法務文書の更新に失敗しました。';

            setActionError(message);
        } finally {
            setIsSubmittingUpdate(false);
        }
    }

    async function handleDelete() {
        if (!token || !selectedDocument || getConsentCount(selectedDocument) > 0 || isDeleting) {
            return;
        }

        if (!window.confirm(`「${selectedDocument.title}」を削除します。よろしいですか？`)) {
            return;
        }

        setIsDeleting(true);
        setActionError(null);
        setSuccessMessage(null);

        try {
            await apiRequest(`/admin/legal-documents/${selectedDocument.id}`, {
                method: 'DELETE',
                token,
            });

            setSuccessMessage('法務文書を削除しました。');
            updateFilters({ selected: null });
            await loadDocuments(true);
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : '法務文書の削除に失敗しました。';

            setActionError(message);
        } finally {
            setIsDeleting(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="法務文書を読み込み中" message="公開中とドラフトの文書を集約しています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_16px_34px_rgba(2,6,23,0.14)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">法務文書</p>
                        <h2 className="text-2xl font-semibold text-white sm:text-[2rem]">法務文書管理</h2>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            規約、ポリシー、特商法文書のドラフト作成と公開履歴の確認をまとめて行えます。
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            void loadDocuments(true);
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

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {[
                    { label: '総件数', value: summary.total, hint: '現在の表示対象' },
                    { label: '公開中', value: summary.published, hint: '現在公開されている文書' },
                    { label: 'ドラフト', value: summary.drafts, hint: '未公開の下書き' },
                    { label: '承諾件数', value: summary.accepted, hint: '同意済み件数の合計' },
                    { label: '文書タイプ数', value: summary.uniqueTypes, hint: '扱っている文書の種類' },
                ].map((item) => (
                    <article key={item.label} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">{item.label}</p>
                        <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
                        <p className="mt-2 text-sm text-slate-400">{item.hint}</p>
                    </article>
                ))}
            </section>

            <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">文書タイプ</span>
                        <select
                            value={documentType || 'all'}
                            onChange={(event) => updateFilters({ document_type: event.target.value === 'all' ? null : event.target.value, selected: null })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition placeholder:text-[#9aa3ad] focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            {LEGAL_DOCUMENT_TYPE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-semibold text-[#17202b]">公開状態</span>
                        <select
                            value={publishedFilter}
                            onChange={(event) => updateFilters({ is_published: event.target.value, selected: null })}
                            className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                        >
                            <option value="all">すべて</option>
                            <option value="1">公開中のみ</option>
                            <option value="0">ドラフトのみ</option>
                        </select>
                    </label>
                </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="space-y-6">
                    <div className="rounded-[28px] bg-white p-5 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <div className="flex items-center justify-between gap-4 border-b border-[#ece3d4] pb-4">
                            <div>
                                <h3 className="text-lg font-semibold text-[#17202b]">文書一覧</h3>
                                <p className="mt-1 text-sm text-[#68707a]">タイプごとに公開版とドラフトを追えます。</p>
                            </div>
                            <p className="text-sm font-semibold text-[#7d6852]">{documents.length}件</p>
                        </div>

                        <div className="mt-4 space-y-3">
                            {documents.length > 0 ? documents.map((document) => {
                                const isSelected = String(document.id) === selectedId;

                                return (
                                    <Link
                                        key={document.id}
                                        to={buildSelectedLink(searchParams, document.id)}
                                        className={`block rounded-[24px] border px-4 py-4 transition ${
                                            isSelected
                                                ? 'border-[#b5894d] bg-[#fff8ef] shadow-[0_14px_30px_rgba(181,137,77,0.16)]'
                                                : 'border-[#ece3d4] bg-[#fffcf6] hover:border-[#d8c2a0] hover:bg-[#fff8ef]'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-base font-semibold text-[#17202b]">{document.title}</p>
                                                <p className="mt-1 text-xs text-[#7d6852]">{documentTypeLabel(document.document_type)} / {document.version}</p>
                                            </div>
                                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${document.is_published ? 'bg-[#e8f4ea] text-[#24553a]' : 'bg-[#fff3e3] text-[#8f5c22]'}`}>
                                                {document.is_published ? '公開中' : 'ドラフト'}
                                            </span>
                                        </div>

                                        <div className="mt-3 text-sm text-[#55606d]">
                                            <p>公開日時 <span className="font-medium text-[#17202b]">{formatDateTime(document.published_at)}</span></p>
                                            <p className="mt-1">承諾件数 <span className="font-medium text-[#17202b]">{getConsentCount(document)}</span></p>
                                        </div>
                                    </Link>
                                );
                            }) : (
                                <div className="rounded-[24px] border border-dashed border-[#d9c9ae] bg-[#fffdf8] px-5 py-8 text-center text-sm text-[#7d6852]">
                                    条件に合う文書はありません。
                                </div>
                            )}
                        </div>
                    </div>

                    <form onSubmit={handleCreate} className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                        <div className="border-b border-[#ece3d4] pb-4">
                            <h3 className="text-lg font-semibold text-[#17202b]">新しい文書を作成</h3>
                            <p className="mt-1 text-sm text-[#68707a]">同じ文書タイプで新しく作成すると、以前の公開版は公開状態から外れます。</p>
                        </div>

                        {actionError ? (
                            <div className="mt-4 rounded-[22px] border border-[#f1d4b5] bg-[#fff4e8] px-4 py-3 text-sm text-[#9a4b35]">
                                {actionError}
                            </div>
                        ) : null}


                        <div className="mt-4 grid gap-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-[#17202b]">文書タイプ</span>
                                    <select
                                        value={createDocumentType}
                                        onChange={(event) => setCreateDocumentType(event.target.value)}
                                        className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                    >
                                        {LEGAL_DOCUMENT_TYPE_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </label>

                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-[#17202b]">バージョン</span>
                                    <input
                                        value={createVersion}
                                        onChange={(event) => setCreateVersion(event.target.value)}
                                        placeholder="2026-05-01"
                                        className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition placeholder:text-[#9aa3ad] focus:border-[#b5894d]"
                                    />
                                </label>
                            </div>

                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">タイトル</span>
                                <input
                                    value={createTitle}
                                    onChange={(event) => setCreateTitle(event.target.value)}
                                    className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                />
                            </label>

                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-[#17202b]">公開日時</span>
                                    <input
                                        type="datetime-local"
                                        value={createPublishedAt}
                                        onChange={(event) => setCreatePublishedAt(event.target.value)}
                                        className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                    />
                                </label>

                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-[#17202b]">効力発生日</span>
                                    <input
                                        type="datetime-local"
                                        value={createEffectiveAt}
                                        onChange={(event) => setCreateEffectiveAt(event.target.value)}
                                        className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                    />
                                </label>
                            </div>

                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-[#17202b]">本文</span>
                                <textarea
                                    value={createBody}
                                    onChange={(event) => setCreateBody(event.target.value)}
                                    rows={10}
                                    className="w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm leading-7 text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                />
                            </label>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmittingCreate || !createDocumentType.trim() || !createVersion.trim() || !createTitle.trim() || !createBody.trim()}
                            className="mt-5 inline-flex rounded-full bg-[#17202b] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#223243] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSubmittingCreate ? '作成中...' : '文書を作成'}
                        </button>
                    </form>
                </div>

                <div className="rounded-[28px] bg-white p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                    {selectedDocument ? (
                        <div className="space-y-6">
                            <div className="border-b border-[#ece3d4] pb-5">
                                <p className="text-xs font-semibold tracking-wide text-[#b5894d]">文書詳細</p>
                                <h3 className="mt-2 text-2xl font-semibold text-[#17202b]">{selectedDocument.title}</h3>
                                <p className="mt-2 text-sm text-[#68707a]">{documentTypeLabel(selectedDocument.document_type)} / {selectedDocument.version}</p>
                                <p className="mt-1 text-xs text-[#7d6852]">作成 {formatDateTime(selectedDocument.created_at)}</p>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <article className="rounded-[22px] border border-[#ece3d4] bg-[#fffcf6] p-4 text-sm text-[#55606d]">
                                    <p className="text-xs font-semibold tracking-wide text-[#b5894d]">公開情報</p>
                                    <p className="mt-2 font-semibold text-[#17202b]">{selectedDocument.is_published ? '公開中' : 'ドラフト'}</p>
                                    <p className="mt-1">公開日時 {formatDateTime(selectedDocument.published_at)}</p>
                                    <p className="mt-1">効力発生日 {formatDateTime(selectedDocument.effective_at)}</p>
                                </article>

                                <article className="rounded-[22px] border border-[#ece3d4] bg-[#fffcf6] p-4 text-sm text-[#55606d]">
                                    <p className="text-xs font-semibold tracking-wide text-[#b5894d]">承諾状況</p>
                                    <p className="mt-2 font-semibold text-[#17202b]">{getConsentCount(selectedDocument)}件</p>
                                    <p className="mt-1">承諾件数が0件の文書だけ削除できます。</p>
                                </article>
                            </div>

                            <section className="rounded-[24px] border border-[#ece3d4] bg-[#fffcf6] p-5">
                                <p className="text-sm font-semibold text-[#17202b]">本文プレビュー</p>
                                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#17202b]">{selectedDocument.body}</p>
                            </section>

                            {selectedDocument.is_published ? (
                                <div className="space-y-4">
                                    <section className="rounded-[24px] border border-[#ece3d4] bg-[#fffdf8] px-5 py-4 text-sm text-[#7d6852]">
                                        この文書はすでに公開済みです。修正が必要な場合は、新しいバージョンを左下の作成フォームから追加してください。
                                    </section>
                                    {getConsentCount(selectedDocument) === 0 ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                void handleDelete();
                                            }}
                                            disabled={isDeleting}
                                            className="inline-flex rounded-full border border-[#d9c9ae] px-5 py-2.5 text-sm font-semibold text-[#7d6852] transition hover:bg-[#fff8ef] disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isDeleting ? '削除中...' : 'この文書を削除'}
                                        </button>
                                    ) : null}
                                </div>
                            ) : (
                                <form onSubmit={handleUpdate} className="rounded-[24px] border border-[#ece3d4] bg-[#fffcf6] p-5">
                                    <div className="border-b border-[#ece3d4] pb-4">
                                        <h4 className="text-lg font-semibold text-[#17202b]">ドラフトを更新</h4>
                                        <p className="mt-1 text-sm text-[#68707a]">公開前のタイトル、本文、公開予定日時を編集できます。</p>
                                    </div>

                                    <div className="mt-4 grid gap-4">
                                        <label className="space-y-2">
                                            <span className="text-sm font-semibold text-[#17202b]">タイトル</span>
                                            <input
                                                value={editTitle}
                                                onChange={(event) => setEditTitle(event.target.value)}
                                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-white px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                            />
                                        </label>

                                        <div className="grid gap-4 md:grid-cols-2">
                                            <label className="space-y-2">
                                                <span className="text-sm font-semibold text-[#17202b]">公開日時</span>
                                                <input
                                                    type="datetime-local"
                                                    value={editPublishedAt}
                                                    onChange={(event) => setEditPublishedAt(event.target.value)}
                                                    className="w-full rounded-[18px] border border-[#d9c9ae] bg-white px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                                />
                                            </label>

                                            <label className="space-y-2">
                                                <span className="text-sm font-semibold text-[#17202b]">効力発生日</span>
                                                <input
                                                    type="datetime-local"
                                                    value={editEffectiveAt}
                                                    onChange={(event) => setEditEffectiveAt(event.target.value)}
                                                    className="w-full rounded-[18px] border border-[#d9c9ae] bg-white px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                                />
                                            </label>
                                        </div>

                                        <label className="space-y-2">
                                            <span className="text-sm font-semibold text-[#17202b]">本文</span>
                                            <textarea
                                                value={editBody}
                                                onChange={(event) => setEditBody(event.target.value)}
                                                rows={12}
                                                className="w-full rounded-[18px] border border-[#d9c9ae] bg-white px-4 py-3 text-sm leading-7 text-[#17202b] outline-none transition focus:border-[#b5894d]"
                                            />
                                        </label>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isSubmittingUpdate || !editTitle.trim() || !editBody.trim()}
                                        className="mt-5 inline-flex rounded-full bg-[#8f5c22] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#74460f] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isSubmittingUpdate ? '更新中...' : 'ドラフトを更新'}
                                    </button>
                                    {getConsentCount(selectedDocument) === 0 ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                void handleDelete();
                                            }}
                                            disabled={isDeleting}
                                            className="mt-5 ml-3 inline-flex rounded-full border border-[#d9c9ae] px-5 py-2.5 text-sm font-semibold text-[#7d6852] transition hover:bg-[#fff8ef] disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isDeleting ? '削除中...' : 'この文書を削除'}
                                        </button>
                                    ) : null}
                                </form>
                            )}
                        </div>
                    ) : (
                        <div className="flex min-h-[420px] items-center justify-center rounded-[24px] border border-dashed border-[#d9c9ae] bg-[#fffdf8] px-6 text-center text-sm leading-7 text-[#7d6852]">
                            左の一覧から文書を選ぶと、公開状態と本文を確認できます。
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
