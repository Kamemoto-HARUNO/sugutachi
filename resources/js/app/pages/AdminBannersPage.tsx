import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest } from '../lib/api';
import {
    BANNER_PLACEMENT_OPTIONS,
    BANNER_STATUS_OPTIONS,
    BANNER_VIEWER_SEGMENT_OPTIONS,
    buildBannerFormData,
    fetchAdminBanners,
    formatBannerFileSize,
} from '../lib/banners';
import {
    buildCurrentJstDateTimeLocalValue,
    formatJstDateTime,
    formatJstDateTimeLocalValue,
    parseJstDateTimeLocalInput,
} from '../lib/datetime';
import type {
    AdminBannerRecord,
    ApiEnvelope,
    BannerPlacement,
    BannerStatus,
    BannerViewerSegment,
} from '../lib/types';

interface BannerFormState {
    title: string;
    link_url: string;
    placements: BannerPlacement[];
    viewer_segments: BannerViewerSegment[];
    status: BannerStatus;
    sort_order: string;
    starts_at: string;
    ends_at: string;
}

function normalizePlacementFilter(value: string | null): BannerPlacement | 'all' {
    if (value === 'home' || value === 'therapist_detail' || value === 'dashboard') {
        return value;
    }

    return 'all';
}

function normalizeViewerSegmentFilter(value: string | null): BannerViewerSegment | 'all' {
    if (value === 'guest' || value === 'user' || value === 'therapist') {
        return value;
    }

    return 'all';
}

function normalizeStatusFilter(value: string | null): BannerStatus | 'all' {
    if (value === 'draft' || value === 'hidden' || value === 'published') {
        return value;
    }

    return 'all';
}

function buildEmptyForm(): BannerFormState {
    return {
        title: '',
        link_url: '',
        placements: ['home'],
        viewer_segments: ['guest'],
        status: 'draft',
        sort_order: '100',
        starts_at: buildCurrentJstDateTimeLocalValue(),
        ends_at: '',
    };
}

function buildFormFromBanner(banner: AdminBannerRecord): BannerFormState {
    return {
        title: banner.title,
        link_url: banner.link_url,
        placements: banner.placements,
        viewer_segments: banner.viewer_segments,
        status: banner.status,
        sort_order: String(banner.sort_order),
        starts_at: formatJstDateTimeLocalValue(banner.starts_at),
        ends_at: formatJstDateTimeLocalValue(banner.ends_at),
    };
}

function publicationTone(state: AdminBannerRecord['publication_state']): string {
    switch (state) {
        case 'visible':
            return 'bg-[#e8f4ea] text-[#24553a]';
        case 'scheduled':
            return 'bg-[#edf4ff] text-[#34557f]';
        case 'expired':
            return 'bg-[#fff2dd] text-[#8b5a16]';
        case 'hidden':
            return 'bg-[#f1efe8] text-[#48505a]';
        case 'draft':
            return 'bg-[#f4e9ff] text-[#6f4688]';
    }
}

export function AdminBannersPage() {
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [banners, setBanners] = useState<AdminBannerRecord[]>([]);
    const [form, setForm] = useState<BannerFormState>(() => buildEmptyForm());
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [pageError, setPageError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);

    const placementFilter = normalizePlacementFilter(searchParams.get('placement'));
    const viewerSegmentFilter = normalizeViewerSegmentFilter(searchParams.get('viewer_segment'));
    const statusFilter = normalizeStatusFilter(searchParams.get('status'));
    const selectedBannerId = searchParams.get('banner_id');
    const keywordFilter = searchParams.get('q') ?? '';

    usePageTitle('バナー管理');
    useToastOnMessage(pageError, 'error');
    useToastOnMessage(formError, 'error');
    useToastOnMessage(successMessage, 'success');

    const selectedBanner = useMemo(
        () => banners.find((banner) => banner.public_id === selectedBannerId) ?? null,
        [banners, selectedBannerId],
    );
    const summary = useMemo(() => ({
        total: banners.length,
        visible: banners.filter((banner) => banner.publication_state === 'visible').length,
        scheduled: banners.filter((banner) => banner.publication_state === 'scheduled').length,
        hidden: banners.filter((banner) => banner.status === 'hidden').length,
        draft: banners.filter((banner) => banner.status === 'draft').length,
    }), [banners]);

    useEffect(() => {
        if (!selectedFile) {
            setFilePreviewUrl(null);
            return;
        }

        const nextUrl = URL.createObjectURL(selectedFile);
        setFilePreviewUrl(nextUrl);

        return () => {
            URL.revokeObjectURL(nextUrl);
        };
    }, [selectedFile]);

    useEffect(() => {
        if (selectedBanner) {
            setForm(buildFormFromBanner(selectedBanner));
            setSelectedFile(null);
            setFormError(null);
            return;
        }

        if (!selectedBannerId) {
            setForm(buildEmptyForm());
            setSelectedFile(null);
        }
    }, [selectedBanner, selectedBannerId]);

    useEffect(() => {
        if (!token) {
            return;
        }

        const params = new URLSearchParams();

        if (placementFilter !== 'all') {
            params.set('placement', placementFilter);
        }

        if (viewerSegmentFilter !== 'all') {
            params.set('viewer_segment', viewerSegmentFilter);
        }

        if (statusFilter !== 'all') {
            params.set('status', statusFilter);
        }

        if (keywordFilter.trim()) {
            params.set('q', keywordFilter.trim());
        }

        let isMounted = true;

        const loadBanners = async (refresh = false) => {
            if (refresh) {
                setIsRefreshing(true);
            } else {
                setIsLoading(true);
            }

            try {
                const nextBanners = await fetchAdminBanners(token, params);

                if (!isMounted) {
                    return;
                }

                setBanners(nextBanners);
                setPageError(null);
            } catch (requestError) {
                if (!isMounted) {
                    return;
                }

                const message = requestError instanceof ApiError
                    ? requestError.message
                    : 'バナー一覧の取得に失敗しました。';

                setPageError(message);
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                    setIsRefreshing(false);
                }
            }
        };

        void loadBanners();

        return () => {
            isMounted = false;
        };
    }, [keywordFilter, placementFilter, statusFilter, token, viewerSegmentFilter]);

    const imagePreviewUrl = filePreviewUrl ?? selectedBanner?.image_url ?? null;
    const adminFieldClass = 'w-full rounded-[18px] border border-[#d9c9ae] bg-[#fffdf8] px-4 py-3 text-sm text-[#17202b] outline-none transition focus:border-[#b5894d]';

    if (isLoading) {
        return <LoadingScreen title="バナー管理" message="登録済みバナーを読み込んでいます。" />;
    }

    const setFilterValue = (key: string, value: string) => {
        setSearchParams((previous) => {
            const next = new URLSearchParams(previous);

            if (!value || value === 'all') {
                next.delete(key);
            } else {
                next.set(key, value);
            }

            return next;
        }, { replace: true });
    };

    const refreshBanners = async () => {
        if (!token) {
            return;
        }

        const params = new URLSearchParams(searchParams);

        try {
            setIsRefreshing(true);
            setBanners(await fetchAdminBanners(token, params));
            setPageError(null);
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : 'バナー一覧の更新に失敗しました。';

            setPageError(message);
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleCheckboxToggle = <T extends string>(
        key: 'placements' | 'viewer_segments',
        value: T,
    ) => {
        setForm((current) => {
            const values = current[key] as T[];
            const nextValues = values.includes(value)
                ? values.filter((item) => item !== value)
                : [...values, value];

            return {
                ...current,
                [key]: nextValues,
            };
        });
    };

    const handleCreateNew = () => {
        setSearchParams((previous) => {
            const next = new URLSearchParams(previous);
            next.delete('banner_id');

            return next;
        }, { replace: true });
        setForm(buildEmptyForm());
        setSelectedFile(null);
        setFormError(null);
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!token) {
            return;
        }

        setFormError(null);
        setSuccessMessage(null);

        if (form.placements.length === 0) {
            setFormError('掲載場所を1つ以上選択してください。');
            return;
        }

        if (form.viewer_segments.length === 0) {
            setFormError('表示対象を1つ以上選択してください。');
            return;
        }

        const startsAt = parseJstDateTimeLocalInput(form.starts_at)?.toISOString() ?? '';
        const endsAt = form.ends_at ? parseJstDateTimeLocalInput(form.ends_at)?.toISOString() ?? '' : '';

        if (!startsAt) {
            setFormError('開始日時を正しく入力してください。');
            return;
        }

        if (form.ends_at && !endsAt) {
            setFormError('終了日時を正しく入力してください。');
            return;
        }

        if (!selectedBanner && !selectedFile) {
            setFormError('バナー画像を選択してください。');
            return;
        }

        setIsSubmitting(true);

        try {
            const formData = buildBannerFormData({
                title: form.title,
                linkUrl: form.link_url,
                placements: form.placements,
                viewerSegments: form.viewer_segments,
                status: form.status,
                sortOrder: form.sort_order,
                startsAt,
                endsAt,
                imageFile: selectedFile,
                method: selectedBanner ? 'PATCH' : undefined,
            });

            const response = await apiRequest<ApiEnvelope<AdminBannerRecord>>(
                selectedBanner ? `/admin/banners/${selectedBanner.public_id}` : '/admin/banners',
                {
                    method: 'POST',
                    token,
                    body: formData,
                },
            );
            const nextBanner = response.data;

            await refreshBanners();
            setSearchParams((previous) => {
                const next = new URLSearchParams(previous);
                next.set('banner_id', nextBanner.public_id);

                return next;
            }, { replace: true });
            setSelectedFile(null);
            setSuccessMessage(selectedBanner ? 'バナーを更新しました。' : 'バナーを登録しました。');
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : 'バナーの保存に失敗しました。';

            setFormError(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!token || !selectedBanner) {
            return;
        }

        setIsDeleting(true);
        setFormError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<null>(`/admin/banners/${selectedBanner.public_id}`, {
                method: 'DELETE',
                token,
            });

            await refreshBanners();
            setSearchParams((previous) => {
                const next = new URLSearchParams(previous);
                next.delete('banner_id');

                return next;
            }, { replace: true });
            setForm(buildEmptyForm());
            setSelectedFile(null);
            setSuccessMessage('バナーを削除しました。');
        } catch (requestError) {
            const message = requestError instanceof ApiError
                ? requestError.message
                : 'バナーの削除に失敗しました。';

            setFormError(message);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-6 text-[#17202b]">
            <section className="rounded-[28px] bg-[#fffaf2] p-6 shadow-[0_10px_24px_rgba(23,32,43,0.08)] md:p-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-[0.18em] text-[#b5894d]">BANNER MANAGEMENT</p>
                        <h1 className="text-3xl font-semibold text-[#17202b]">バナー管理</h1>
                        <p className="max-w-3xl text-sm leading-7 text-[#5b6470]">
                            トップページ、セラピスト詳細ページ、ダッシュボードに掲載するバナー画像を管理します。公開バナーは表示対象と掲載場所が一致するとカルーセルで表示されます。
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={handleCreateNew}
                            className="inline-flex items-center rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#223142]"
                        >
                            新規バナー
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                void refreshBanners();
                            }}
                            className="inline-flex items-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f6efe2]"
                        >
                            {isRefreshing ? '更新中…' : '一覧を更新'}
                        </button>
                    </div>
                </div>
                <div className="mt-6 grid gap-3 md:grid-cols-5">
                    <div className="rounded-[22px] bg-[#f8f1e4] px-4 py-4">
                        <p className="text-xs font-semibold text-[#8b6a3e]">総数</p>
                        <p className="mt-2 text-2xl font-semibold">{summary.total}</p>
                    </div>
                    <div className="rounded-[22px] bg-[#ecf7ef] px-4 py-4">
                        <p className="text-xs font-semibold text-[#2b6a46]">表示中</p>
                        <p className="mt-2 text-2xl font-semibold">{summary.visible}</p>
                    </div>
                    <div className="rounded-[22px] bg-[#edf4ff] px-4 py-4">
                        <p className="text-xs font-semibold text-[#34557f]">開始待ち</p>
                        <p className="mt-2 text-2xl font-semibold">{summary.scheduled}</p>
                    </div>
                    <div className="rounded-[22px] bg-[#f1efe8] px-4 py-4">
                        <p className="text-xs font-semibold text-[#48505a]">非公開</p>
                        <p className="mt-2 text-2xl font-semibold">{summary.hidden}</p>
                    </div>
                    <div className="rounded-[22px] bg-[#f4e9ff] px-4 py-4">
                        <p className="text-xs font-semibold text-[#6f4688]">下書き</p>
                        <p className="mt-2 text-2xl font-semibold">{summary.draft}</p>
                    </div>
                </div>
            </section>

            <section className="rounded-[28px] bg-[#fffaf2] p-6 shadow-[0_10px_24px_rgba(23,32,43,0.08)] md:p-7">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.2fr)]">
                    <div className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                            <input
                                value={keywordFilter}
                                onChange={(event) => setFilterValue('q', event.target.value)}
                                placeholder="タイトル / public_id で検索"
                                className={adminFieldClass}
                            />
                            <select
                                value={placementFilter}
                                onChange={(event) => setFilterValue('placement', event.target.value)}
                                className={adminFieldClass}
                            >
                                <option value="all">掲載場所: すべて</option>
                                {BANNER_PLACEMENT_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                            <select
                                value={viewerSegmentFilter}
                                onChange={(event) => setFilterValue('viewer_segment', event.target.value)}
                                className={adminFieldClass}
                            >
                                <option value="all">表示対象: すべて</option>
                                {BANNER_VIEWER_SEGMENT_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                            <select
                                value={statusFilter}
                                onChange={(event) => setFilterValue('status', event.target.value)}
                                className={adminFieldClass}
                            >
                                <option value="all">状態: すべて</option>
                                {BANNER_STATUS_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-3">
                            {banners.length === 0 ? (
                                <div className="rounded-[24px] border border-dashed border-[#d8c7aa] bg-[#fffdf8] p-6 text-sm text-[#5b6470]">
                                    条件に合うバナーはありません。右側のフォームから新規作成できます。
                                </div>
                            ) : (
                                banners.map((banner) => {
                                    const isSelected = banner.public_id === selectedBannerId;

                                    return (
                                        <button
                                            key={banner.public_id}
                                            type="button"
                                            onClick={() => {
                                                setSearchParams((previous) => {
                                                    const next = new URLSearchParams(previous);
                                                    next.set('banner_id', banner.public_id);

                                                    return next;
                                                }, { replace: true });
                                            }}
                                            className={[
                                                'w-full rounded-[24px] border px-4 py-4 text-left transition',
                                                isSelected
                                                    ? 'border-[#c69c5c] bg-[#fff4df] shadow-[0_18px_36px_rgba(182,137,77,0.14)]'
                                                    : 'border-[#eadfce] bg-[#fffdf8] hover:border-[#d9c9ae] hover:bg-[#fff8ec]',
                                            ].join(' ')}
                                        >
                                            <div className="flex gap-4">
                                                <div className="h-20 w-24 shrink-0 overflow-hidden rounded-[18px] border border-[#eadfce] bg-white">
                                                    <img src={banner.image_url} alt={banner.title} className="h-full w-full object-cover" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                                        <div className="space-y-1">
                                                            <p className="text-base font-semibold text-[#17202b]">{banner.title}</p>
                                                            <p className="text-xs text-[#7b6b58]">{banner.public_id}</p>
                                                        </div>
                                                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${publicationTone(banner.publication_state)}`}>
                                                            {banner.publication_state_label}
                                                        </span>
                                                    </div>
                                                    <p className="mt-2 text-xs leading-6 text-[#5b6470]">
                                                        {banner.placement_labels.join(' / ')} | {banner.viewer_segment_labels.join(' / ')}
                                                    </p>
                                                    <p className="mt-2 text-xs leading-6 text-[#5b6470]">
                                                        開始 {formatJstDateTime(banner.starts_at) ?? '未設定'}
                                                        {banner.ends_at ? ` / 終了 ${formatJstDateTime(banner.ends_at)}` : ' / 無期限'}
                                                    </p>
                                                    <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-[#7b6b58]">
                                                        <span>順番 {banner.sort_order}</span>
                                                        <span>表示 {banner.impression_count}</span>
                                                        <span>クリック {banner.click_count}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div className="rounded-[26px] border border-[#eadfce] bg-[#fffdf8] p-5 md:p-6">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold tracking-[0.18em] text-[#b5894d]">EDITOR</p>
                                <h2 className="mt-2 text-2xl font-semibold text-[#17202b]">
                                    {selectedBanner ? 'バナーを編集' : '新規バナーを作成'}
                                </h2>
                            </div>
                            {selectedBanner ? (
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={isDeleting}
                                    className="inline-flex rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isDeleting ? '削除中…' : '削除'}
                                </button>
                            ) : null}
                        </div>

                        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                                <div className="space-y-4">
                                    <label className="block space-y-2">
                                        <span className="text-sm font-semibold text-[#17202b]">タイトル</span>
                                        <input
                                            value={form.title}
                                            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                                            className={adminFieldClass}
                                            placeholder="例: 初回予約キャンペーン"
                                        />
                                    </label>
                                    <label className="block space-y-2">
                                        <span className="text-sm font-semibold text-[#17202b]">クリック先URL</span>
                                        <input
                                            value={form.link_url}
                                            onChange={(event) => setForm((current) => ({ ...current, link_url: event.target.value }))}
                                            className={adminFieldClass}
                                            placeholder="https://example.com/campaign"
                                        />
                                    </label>
                                    <label className="block space-y-2">
                                        <span className="text-sm font-semibold text-[#17202b]">バナー画像</span>
                                        <input
                                            type="file"
                                            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                                            onChange={(event: ChangeEvent<HTMLInputElement>) => {
                                                setSelectedFile(event.target.files?.[0] ?? null);
                                            }}
                                            className="block w-full text-sm text-[#5b6470] file:mr-4 file:rounded-full file:border-0 file:bg-[#17202b] file:px-4 file:py-2 file:font-semibold file:text-white hover:file:bg-[#223142]"
                                        />
                                        <p className="text-xs text-[#7b6b58]">jpg / png / webp、最大10MB。更新時に差し替えると旧画像は削除されます。</p>
                                    </label>
                                </div>

                                <div className="space-y-3">
                                    <span className="text-sm font-semibold text-[#17202b]">プレビュー</span>
                                    <div className="overflow-hidden rounded-[24px] border border-[#eadfce] bg-white">
                                        {imagePreviewUrl ? (
                                            <img src={imagePreviewUrl} alt={form.title || 'バナープレビュー'} className="block h-auto w-full object-contain" />
                                        ) : (
                                            <div className="flex min-h-[180px] items-center justify-center px-6 py-10 text-center text-sm text-[#7b6b58]">
                                                画像を選択するとここにプレビューが表示されます。
                                            </div>
                                        )}
                                    </div>
                                    {selectedBanner ? (
                                        <div className="text-xs leading-6 text-[#7b6b58]">
                                            <p>現在の画像: {selectedBanner.image_original_name ?? 'ファイル名不明'}</p>
                                            <p>{selectedBanner.image_mime_type ?? 'MIME不明'}{selectedBanner.image_size_bytes ? ` / ${formatBannerFileSize(selectedBanner.image_size_bytes)}` : ''}</p>
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            <div className="grid gap-5 xl:grid-cols-2">
                                <fieldset className="space-y-3">
                                    <legend className="text-sm font-semibold text-[#17202b]">掲載場所</legend>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        {BANNER_PLACEMENT_OPTIONS.map((option) => (
                                            <label key={option.value} className="flex items-center gap-3 rounded-[18px] border border-[#eadfce] bg-[#fffaf2] px-4 py-3">
                                                <input
                                                    type="checkbox"
                                                    checked={form.placements.includes(option.value)}
                                                    onChange={() => handleCheckboxToggle('placements', option.value)}
                                                    className="h-4 w-4 rounded border-[#c7b089] text-[#b5894d] focus:ring-[#b5894d]"
                                                />
                                                <span className="text-sm font-medium text-[#17202b]">{option.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>

                                <fieldset className="space-y-3">
                                    <legend className="text-sm font-semibold text-[#17202b]">表示対象</legend>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        {BANNER_VIEWER_SEGMENT_OPTIONS.map((option) => (
                                            <label key={option.value} className="flex items-center gap-3 rounded-[18px] border border-[#eadfce] bg-[#fffaf2] px-4 py-3">
                                                <input
                                                    type="checkbox"
                                                    checked={form.viewer_segments.includes(option.value)}
                                                    onChange={() => handleCheckboxToggle('viewer_segments', option.value)}
                                                    className="h-4 w-4 rounded border-[#c7b089] text-[#b5894d] focus:ring-[#b5894d]"
                                                />
                                                <span className="text-sm font-medium text-[#17202b]">{option.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>
                            </div>

                            <div className="grid gap-4 xl:grid-cols-2">
                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#17202b]">状態</span>
                                    <select
                                        value={form.status}
                                        onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as BannerStatus }))}
                                        className={adminFieldClass}
                                    >
                                        {BANNER_STATUS_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#17202b]">表示順</span>
                                    <input
                                        type="number"
                                        min={1}
                                        value={form.sort_order}
                                        onChange={(event) => setForm((current) => ({ ...current, sort_order: event.target.value }))}
                                        className={adminFieldClass}
                                    />
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#17202b]">開始日時（JST）</span>
                                    <input
                                        type="datetime-local"
                                        value={form.starts_at}
                                        onChange={(event) => setForm((current) => ({ ...current, starts_at: event.target.value }))}
                                        className={adminFieldClass}
                                    />
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-sm font-semibold text-[#17202b]">終了日時（JST / 任意）</span>
                                    <input
                                        type="datetime-local"
                                        value={form.ends_at}
                                        onChange={(event) => setForm((current) => ({ ...current, ends_at: event.target.value }))}
                                        className={adminFieldClass}
                                    />
                                </label>
                            </div>

                            {selectedBanner ? (
                                <div className="rounded-[22px] bg-[#f8f1e4] px-4 py-4 text-sm text-[#5b6470]">
                                    <p className="font-semibold text-[#17202b]">現在の公開状況</p>
                                    <p className="mt-2">
                                        {selectedBanner.publication_state_label}
                                        {selectedBanner.ends_at ? ` / ${formatJstDateTime(selectedBanner.ends_at)}` : ' / 無期限'}
                                    </p>
                                    <p className="mt-2">
                                        表示回数 {selectedBanner.impression_count} / クリック数 {selectedBanner.click_count}
                                    </p>
                                </div>
                            ) : null}

                            <div className="flex flex-wrap justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={handleCreateNew}
                                    className="inline-flex rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f6efe2]"
                                >
                                    入力をリセット
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="inline-flex rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-6 py-3 text-sm font-bold text-[#17202b] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isSubmitting ? '保存中…' : selectedBanner ? '更新する' : '登録する'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </section>
        </div>
    );
}
