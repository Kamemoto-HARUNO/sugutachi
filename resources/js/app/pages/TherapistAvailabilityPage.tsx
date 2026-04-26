import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import type {
    ApiEnvelope,
    TherapistAvailabilitySlotRecord,
    TherapistBookingSettingRecord,
} from '../lib/types';

interface SlotDraft {
    public_id: string | null;
    start_at: string;
    end_at: string;
    status: 'published' | 'hidden';
    dispatch_base_type: 'default' | 'custom';
    dispatch_area_label: string;
    custom_dispatch_base_label: string;
    custom_dispatch_base_lat: string;
    custom_dispatch_base_lng: string;
    custom_dispatch_base_accuracy_m: string;
}

function roundToNextQuarter(date: Date): Date {
    const rounded = new Date(date);
    rounded.setSeconds(0, 0);
    const minutes = rounded.getMinutes();
    const remainder = minutes % 15;

    if (remainder !== 0) {
        rounded.setMinutes(minutes + (15 - remainder), 0, 0);
    }

    return rounded;
}

function formatDateTime(value: string | null): string {
    if (!value) {
        return '未設定';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '未設定';
    }

    return new Intl.DateTimeFormat('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function toDateTimeLocalValue(value: string | null | undefined): string {
    if (!value) {
        return '';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function fromDateTimeLocalValue(value: string): string {
    return new Date(value).toISOString();
}

function leadTimeLabel(minutes: number): string {
    if (minutes % 60 === 0) {
        return `${minutes / 60}時間前まで`;
    }

    return `${minutes}分前まで`;
}

function slotStatusLabel(status: TherapistAvailabilitySlotRecord['status'] | SlotDraft['status']): string {
    switch (status) {
        case 'published':
            return '公開中';
        case 'hidden':
            return '非公開';
        case 'expired':
            return '期限切れ';
        default:
            return status;
    }
}

function slotStatusTone(status: TherapistAvailabilitySlotRecord['status'] | SlotDraft['status']): string {
    switch (status) {
        case 'published':
            return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100';
        case 'hidden':
            return 'border-white/10 bg-white/5 text-slate-300';
        case 'expired':
            return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
        default:
            return 'border-white/10 bg-white/5 text-slate-300';
    }
}

function createSlotDraft(slot?: TherapistAvailabilitySlotRecord | null): SlotDraft {
    if (slot) {
        return {
            public_id: slot.public_id,
            start_at: toDateTimeLocalValue(slot.start_at),
            end_at: toDateTimeLocalValue(slot.end_at),
            status: slot.status === 'hidden' ? 'hidden' : 'published',
            dispatch_base_type: slot.dispatch_base_type,
            dispatch_area_label: slot.dispatch_area_label ?? '',
            custom_dispatch_base_label: slot.custom_dispatch_base?.label ?? '',
            custom_dispatch_base_lat: slot.custom_dispatch_base?.lat != null ? String(slot.custom_dispatch_base.lat) : '',
            custom_dispatch_base_lng: slot.custom_dispatch_base?.lng != null ? String(slot.custom_dispatch_base.lng) : '',
            custom_dispatch_base_accuracy_m: slot.custom_dispatch_base?.accuracy_m != null ? String(slot.custom_dispatch_base.accuracy_m) : '',
        };
    }

    const start = roundToNextQuarter(new Date(Date.now() + 60 * 60 * 1000));
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    return {
        public_id: null,
        start_at: toDateTimeLocalValue(start.toISOString()),
        end_at: toDateTimeLocalValue(end.toISOString()),
        status: 'published',
        dispatch_base_type: 'default',
        dispatch_area_label: '',
        custom_dispatch_base_label: '',
        custom_dispatch_base_lat: '',
        custom_dispatch_base_lng: '',
        custom_dispatch_base_accuracy_m: '',
    };
}

export function TherapistAvailabilityPage() {
    const { token } = useAuth();
    const [bookingSetting, setBookingSetting] = useState<TherapistBookingSettingRecord | null>(null);
    const [availabilitySlots, setAvailabilitySlots] = useState<TherapistAvailabilitySlotRecord[]>([]);
    const [leadTimeMinutes, setLeadTimeMinutes] = useState('60');
    const [baseLabel, setBaseLabel] = useState('');
    const [baseLat, setBaseLat] = useState('');
    const [baseLng, setBaseLng] = useState('');
    const [baseAccuracy, setBaseAccuracy] = useState('');
    const [slotDraft, setSlotDraft] = useState<SlotDraft>(createSlotDraft());
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSavingSetting, setIsSavingSetting] = useState(false);
    const [isSavingSlot, setIsSavingSlot] = useState(false);
    const [isLocatingBase, setIsLocatingBase] = useState(false);
    const [isLocatingCustom, setIsLocatingCustom] = useState(false);
    const [pendingDeleteSlotId, setPendingDeleteSlotId] = useState<string | null>(null);

    usePageTitle('空き枠管理');

    const loadData = useCallback(async () => {
        if (!token) {
            return;
        }

        const [settingPayload, slotsPayload] = await Promise.all([
            apiRequest<ApiEnvelope<TherapistBookingSettingRecord>>('/me/therapist/scheduled-booking-settings', { token }),
            apiRequest<ApiEnvelope<TherapistAvailabilitySlotRecord[]>>('/me/therapist/availability-slots', { token }),
        ]);

        const nextSetting = unwrapData(settingPayload);
        const nextSlots = unwrapData(slotsPayload);

        setBookingSetting(nextSetting);
        setAvailabilitySlots(nextSlots);
        setLeadTimeMinutes(String(nextSetting.booking_request_lead_time_minutes));
        setBaseLabel(nextSetting.scheduled_base_location?.label ?? '');
        setBaseLat(nextSetting.scheduled_base_location?.lat != null ? String(nextSetting.scheduled_base_location.lat) : '');
        setBaseLng(nextSetting.scheduled_base_location?.lng != null ? String(nextSetting.scheduled_base_location.lng) : '');
        setBaseAccuracy(nextSetting.scheduled_base_location?.accuracy_m != null ? String(nextSetting.scheduled_base_location.accuracy_m) : '');
        setSlotDraft((currentDraft) => {
            if (!currentDraft.public_id) {
                return currentDraft;
            }

            const matched = nextSlots.find((slot) => slot.public_id === currentDraft.public_id);

            return matched ? createSlotDraft(matched) : createSlotDraft();
        });
    }, [token]);

    useEffect(() => {
        let isMounted = true;

        void loadData()
            .catch((requestError: unknown) => {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError
                        ? requestError.message
                        : '空き枠設定の取得に失敗しました。';

                setError(message);
            })
            .finally(() => {
                if (isMounted) {
                    setIsLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [loadData]);

    const publishedSlots = useMemo(
        () => availabilitySlots.filter((slot) => slot.status === 'published'),
        [availabilitySlots],
    );
    const hiddenSlots = useMemo(
        () => availabilitySlots.filter((slot) => slot.status === 'hidden'),
        [availabilitySlots],
    );
    const nextPublishedSlot = useMemo(
        () => publishedSlots.find((slot) => new Date(slot.end_at).getTime() > Date.now()) ?? null,
        [publishedSlots],
    );
    const selectedSlot = useMemo(
        () => availabilitySlots.find((slot) => slot.public_id === slotDraft.public_id) ?? null,
        [availabilitySlots, slotDraft.public_id],
    );

    async function handleSettingsSave(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token) {
            return;
        }

        setIsSavingSetting(true);
        setError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<ApiEnvelope<TherapistBookingSettingRecord>>('/me/therapist/scheduled-booking-settings', {
                method: 'PUT',
                token,
                body: {
                    booking_request_lead_time_minutes: Number(leadTimeMinutes),
                    scheduled_base_location: {
                        label: baseLabel || null,
                        lat: Number(baseLat),
                        lng: Number(baseLng),
                        accuracy_m: baseAccuracy ? Number(baseAccuracy) : null,
                    },
                },
            });

            await loadData();
            setSuccessMessage('予定予約の基本設定を更新しました。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '基本設定の保存に失敗しました。';

            setError(message);
        } finally {
            setIsSavingSetting(false);
        }
    }

    async function handleSlotSave(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token) {
            return;
        }

        setIsSavingSlot(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const body = {
                start_at: fromDateTimeLocalValue(slotDraft.start_at),
                end_at: fromDateTimeLocalValue(slotDraft.end_at),
                status: slotDraft.status,
                dispatch_base_type: slotDraft.dispatch_base_type,
                dispatch_area_label: slotDraft.dispatch_area_label,
                ...(slotDraft.dispatch_base_type === 'custom'
                    ? {
                        custom_dispatch_base: {
                            label: slotDraft.custom_dispatch_base_label || null,
                            lat: Number(slotDraft.custom_dispatch_base_lat),
                            lng: Number(slotDraft.custom_dispatch_base_lng),
                            accuracy_m: slotDraft.custom_dispatch_base_accuracy_m
                                ? Number(slotDraft.custom_dispatch_base_accuracy_m)
                                : null,
                        },
                    }
                    : {}),
            };

            if (slotDraft.public_id) {
                await apiRequest<ApiEnvelope<TherapistAvailabilitySlotRecord>>(`/me/therapist/availability-slots/${slotDraft.public_id}`, {
                    method: 'PATCH',
                    token,
                    body,
                });

                await loadData();
                setSuccessMessage('空き枠を更新しました。');
                return;
            }

            await apiRequest<ApiEnvelope<TherapistAvailabilitySlotRecord>>('/me/therapist/availability-slots', {
                method: 'POST',
                token,
                body,
            });

            await loadData();
            setSlotDraft(createSlotDraft());
            setSuccessMessage('空き枠を追加しました。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '空き枠の保存に失敗しました。';

            setError(message);
        } finally {
            setIsSavingSlot(false);
        }
    }

    async function handleDeleteSlot(slot: TherapistAvailabilitySlotRecord) {
        if (!token) {
            return;
        }

        if (!window.confirm(`「${formatDateTime(slot.start_at)} - ${formatDateTime(slot.end_at)}」の枠を削除しますか？`)) {
            return;
        }

        setPendingDeleteSlotId(slot.public_id);
        setError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<null>(`/me/therapist/availability-slots/${slot.public_id}`, {
                method: 'DELETE',
                token,
            });

            await loadData();

            if (slotDraft.public_id === slot.public_id) {
                setSlotDraft(createSlotDraft());
            }

            setSuccessMessage('空き枠を削除しました。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '空き枠の削除に失敗しました。';

            setError(message);
        } finally {
            setPendingDeleteSlotId(null);
        }
    }

    function handleUseCurrentLocation(target: 'base' | 'custom') {
        if (!navigator.geolocation) {
            setError('このブラウザでは現在地取得を利用できません。');
            return;
        }

        if (target === 'base') {
            setIsLocatingBase(true);
        } else {
            setIsLocatingCustom(true);
        }

        setError(null);
        setSuccessMessage(null);

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const latitude = position.coords.latitude.toFixed(6);
                const longitude = position.coords.longitude.toFixed(6);

                if (target === 'base') {
                    setBaseLat(latitude);
                    setBaseLng(longitude);
                    setBaseAccuracy(String(Math.round(position.coords.accuracy)));
                    setIsLocatingBase(false);
                    setSuccessMessage('予定予約の基本拠点に現在地座標を入力しました。');
                    return;
                }

                setSlotDraft((current) => ({
                    ...current,
                    custom_dispatch_base_lat: latitude,
                    custom_dispatch_base_lng: longitude,
                    custom_dispatch_base_accuracy_m: String(Math.round(position.coords.accuracy)),
                }));
                setIsLocatingCustom(false);
                setSuccessMessage('枠専用拠点に現在地座標を入力しました。');
            },
            () => {
                setError('現在地の取得に失敗しました。緯度・経度を手動で入力してください。');

                if (target === 'base') {
                    setIsLocatingBase(false);
                } else {
                    setIsLocatingCustom(false);
                }
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
            },
        );
    }

    if (isLoading) {
        return <LoadingScreen title="空き枠設定を読み込み中" message="予定予約の基本設定と公開中の枠をまとめています。" />;
    }

    return (
        <div className="space-y-8">
            <section className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-6 md:p-8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">AVAILABILITY</p>
                        <h1 className="text-3xl font-semibold text-white">空き枠管理</h1>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            予定予約の受付締切、基本の出動拠点、公開する空き枠をここで管理します。公開枠は15分単位で作成できます。
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-5 py-4 text-sm text-slate-200">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">SLOTS</p>
                        <p className="mt-2 text-3xl font-semibold text-white">{publishedSlots.length}</p>
                        <p className="mt-2 text-xs text-slate-400">公開中の空き枠</p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-slate-200">
                        受付締切: {leadTimeLabel(Number(leadTimeMinutes))}
                    </span>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-slate-200">
                        基本拠点: {bookingSetting?.has_scheduled_base_location ? '設定済み' : '未設定'}
                    </span>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-slate-200">
                        非公開枠: {hiddenSlots.length}件
                    </span>
                </div>

                <div className="flex flex-wrap gap-3">
                    <Link
                        to="/therapist/onboarding"
                        className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                    >
                        準備状況へ戻る
                    </Link>
                    <Link
                        to="/therapist/profile"
                        className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                    >
                        プロフィールへ
                    </Link>
                </div>

                {error ? (
                    <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                        {error}
                    </div>
                ) : null}

                {successMessage ? (
                    <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                        {successMessage}
                    </div>
                ) : null}
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <form onSubmit={handleSettingsSave} className="space-y-5 rounded-[24px] border border-white/10 bg-white/5 p-6">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">SCHEDULED SETTINGS</p>
                        <h2 className="text-xl font-semibold text-white">予定予約の基本設定</h2>
                        <p className="text-sm leading-7 text-slate-300">
                            公開枠で共通利用する受付締切と、標準の出動拠点を設定します。デフォルト拠点を使う枠はここが基準になります。
                        </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-white">受付締切（分）</span>
                            <input
                                type="number"
                                min={15}
                                max={10080}
                                step={15}
                                value={leadTimeMinutes}
                                onChange={(event) => setLeadTimeMinutes(event.target.value)}
                                className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                            />
                        </label>

                        <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-4 text-sm text-slate-300">
                            <p className="font-semibold text-white">現在の目安</p>
                            <p className="mt-2 leading-7">
                                ユーザーは開始時刻の <span className="font-semibold text-white">{leadTimeLabel(Number(leadTimeMinutes))}</span> まで予約リクエストを送れます。
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-white">拠点ラベル</span>
                            <input
                                value={baseLabel}
                                onChange={(event) => setBaseLabel(event.target.value)}
                                className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                placeholder="例: 平日ベース / 自宅付近"
                            />
                        </label>

                        <div className="flex items-end">
                            <button
                                type="button"
                                onClick={() => handleUseCurrentLocation('base')}
                                disabled={isLocatingBase}
                                className="inline-flex items-center rounded-full border border-white/10 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isLocatingBase ? '取得中...' : '現在地を使う'}
                            </button>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-white">緯度</span>
                            <input
                                value={baseLat}
                                onChange={(event) => setBaseLat(event.target.value)}
                                className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                placeholder="35.689500"
                                required
                            />
                        </label>
                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-white">経度</span>
                            <input
                                value={baseLng}
                                onChange={(event) => setBaseLng(event.target.value)}
                                className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                placeholder="139.691700"
                                required
                            />
                        </label>
                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-white">精度（m）</span>
                            <input
                                value={baseAccuracy}
                                onChange={(event) => setBaseAccuracy(event.target.value)}
                                className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                placeholder="150"
                            />
                        </label>
                    </div>

                    <button
                        type="submit"
                        disabled={isSavingSetting}
                        className="inline-flex items-center rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isSavingSetting ? '保存中...' : '基本設定を保存する'}
                    </button>
                </form>

                <article className="space-y-4 rounded-[24px] border border-white/10 bg-white/5 p-6">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">SUMMARY</p>
                        <h2 className="text-xl font-semibold text-white">公開状況</h2>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                        <p className="text-sm font-semibold text-white">基本拠点</p>
                        <p className="mt-2 text-sm text-slate-300">
                            {bookingSetting?.has_scheduled_base_location
                                ? (bookingSetting.scheduled_base_location?.label ?? 'ラベル未設定')
                                : '未設定'}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                        <p className="text-sm font-semibold text-white">次の公開枠</p>
                        <p className="mt-2 text-sm text-slate-300">
                            {nextPublishedSlot
                                ? `${formatDateTime(nextPublishedSlot.start_at)} - ${formatDateTime(nextPublishedSlot.end_at)}`
                                : '未公開'}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                        <p className="text-sm font-semibold text-white">編集できない枠</p>
                        <p className="mt-2 text-sm text-slate-300">
                            {availabilitySlots.filter((slot) => slot.has_blocking_booking).length}件
                        </p>
                        <p className="mt-2 text-xs text-slate-400">
                            予約が紐づく枠は更新・削除できません。
                        </p>
                    </div>
                </article>
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                <section className="space-y-5 rounded-[24px] border border-white/10 bg-white/5 p-6">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">SLOTS</p>
                        <h2 className="text-xl font-semibold text-white">公開枠一覧</h2>
                        <p className="text-sm leading-7 text-slate-300">
                            公開中・非公開の枠をここで確認できます。編集したい枠を選ぶと右側のフォームへ内容を読み込みます。
                        </p>
                    </div>

                    {availabilitySlots.length > 0 ? (
                        <div className="space-y-4">
                            {availabilitySlots.map((slot) => {
                                const isSelected = slotDraft.public_id === slot.public_id;
                                const isDeleting = pendingDeleteSlotId === slot.public_id;

                                return (
                                    <article
                                        key={slot.public_id}
                                        className={[
                                            'rounded-[22px] border p-5 transition',
                                            isSelected ? 'border-rose-300/40 bg-[#131d28]' : 'border-white/10 bg-[#111923]',
                                        ].join(' ')}
                                    >
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                            <div className="space-y-3">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${slotStatusTone(slot.status)}`}>
                                                        {slotStatusLabel(slot.status)}
                                                    </span>
                                                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-300">
                                                        {slot.dispatch_base_type === 'custom' ? '枠専用拠点' : 'デフォルト拠点'}
                                                    </span>
                                                    {slot.has_blocking_booking ? (
                                                        <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-100">
                                                            予約あり {slot.blocking_booking_count}件
                                                        </span>
                                                    ) : null}
                                                </div>

                                                <div className="space-y-1">
                                                    <p className="text-sm font-semibold text-white">
                                                        {formatDateTime(slot.start_at)} - {formatDateTime(slot.end_at)}
                                                    </p>
                                                    <p className="text-sm text-slate-300">{slot.dispatch_area_label ?? 'エリア未設定'}</p>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setSlotDraft(createSlotDraft(slot))}
                                                    className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                                                >
                                                    編集する
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        void handleDeleteSlot(slot);
                                                    }}
                                                    disabled={isDeleting || slot.has_blocking_booking}
                                                    className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    {isDeleting ? '削除中...' : '削除'}
                                                </button>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="rounded-[22px] border border-dashed border-white/15 bg-[#111923] px-4 py-5 text-sm leading-7 text-slate-300">
                            まだ公開枠がありません。まず1件作ると、予定予約から選ばれる状態に近づきます。
                        </div>
                    )}
                </section>

                <form onSubmit={handleSlotSave} className="space-y-5 rounded-[24px] border border-white/10 bg-white/5 p-6">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">
                            {slotDraft.public_id ? 'EDIT SLOT' : 'NEW SLOT'}
                        </p>
                        <h2 className="text-xl font-semibold text-white">
                            {slotDraft.public_id ? '空き枠を編集' : '新しい空き枠を追加'}
                        </h2>
                        <p className="text-sm leading-7 text-slate-300">
                            枠ごとに公開/非公開、公開エリア、使用する出動拠点を決められます。
                        </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-white">開始日時</span>
                            <input
                                type="datetime-local"
                                step={900}
                                value={slotDraft.start_at}
                                onChange={(event) => setSlotDraft((current) => ({ ...current, start_at: event.target.value }))}
                                className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                required
                            />
                        </label>
                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-white">終了日時</span>
                            <input
                                type="datetime-local"
                                step={900}
                                value={slotDraft.end_at}
                                onChange={(event) => setSlotDraft((current) => ({ ...current, end_at: event.target.value }))}
                                className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                required
                            />
                        </label>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-white">公開状態</span>
                            <select
                                value={slotDraft.status}
                                onChange={(event) => setSlotDraft((current) => ({ ...current, status: event.target.value as SlotDraft['status'] }))}
                                className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                            >
                                <option value="published">公開する</option>
                                <option value="hidden">非公開で保存</option>
                            </select>
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-white">公開エリア名</span>
                            <input
                                value={slotDraft.dispatch_area_label}
                                onChange={(event) => setSlotDraft((current) => ({ ...current, dispatch_area_label: event.target.value }))}
                                className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                placeholder="例: 新宿三丁目付近"
                                required
                            />
                        </label>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        {[
                            { value: 'default', label: 'デフォルト拠点', description: '基本設定の出動拠点を使います。' },
                            { value: 'custom', label: '枠専用拠点', description: 'この枠だけ別の出動拠点を使います。' },
                        ].map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => setSlotDraft((current) => ({ ...current, dispatch_base_type: option.value as SlotDraft['dispatch_base_type'] }))}
                                className={[
                                    'rounded-[20px] border px-4 py-4 text-left transition',
                                    slotDraft.dispatch_base_type === option.value
                                        ? 'border-rose-300/40 bg-[#131d28]'
                                        : 'border-white/10 bg-[#111923] hover:bg-[#16212d]',
                                ].join(' ')}
                            >
                                <p className="text-sm font-semibold text-white">{option.label}</p>
                                <p className="mt-2 text-sm leading-6 text-slate-400">{option.description}</p>
                            </button>
                        ))}
                    </div>

                    {slotDraft.dispatch_base_type === 'default' ? (
                        <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3 text-sm leading-7 text-slate-300">
                            {bookingSetting?.has_scheduled_base_location
                                ? `現在のデフォルト拠点: ${bookingSetting.scheduled_base_location?.label ?? 'ラベル未設定'}`
                                : 'まだデフォルト拠点がありません。上の基本設定を先に保存してください。'}
                        </div>
                    ) : (
                        <div className="space-y-4 rounded-[22px] border border-white/10 bg-[#111923] p-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-white">枠専用の出動拠点</p>
                                <button
                                    type="button"
                                    onClick={() => handleUseCurrentLocation('custom')}
                                    disabled={isLocatingCustom}
                                    className="inline-flex items-center rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isLocatingCustom ? '取得中...' : '現在地を使う'}
                                </button>
                            </div>

                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-white">拠点ラベル</span>
                                <input
                                    value={slotDraft.custom_dispatch_base_label}
                                    onChange={(event) => setSlotDraft((current) => ({ ...current, custom_dispatch_base_label: event.target.value }))}
                                    className="w-full rounded-[18px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                    placeholder="例: 週末ベース"
                                />
                            </label>

                            <div className="grid gap-4 md:grid-cols-3">
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">緯度</span>
                                    <input
                                        value={slotDraft.custom_dispatch_base_lat}
                                        onChange={(event) => setSlotDraft((current) => ({ ...current, custom_dispatch_base_lat: event.target.value }))}
                                        className="w-full rounded-[18px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                        placeholder="35.689500"
                                        required
                                    />
                                </label>
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">経度</span>
                                    <input
                                        value={slotDraft.custom_dispatch_base_lng}
                                        onChange={(event) => setSlotDraft((current) => ({ ...current, custom_dispatch_base_lng: event.target.value }))}
                                        className="w-full rounded-[18px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                        placeholder="139.691700"
                                        required
                                    />
                                </label>
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">精度（m）</span>
                                    <input
                                        value={slotDraft.custom_dispatch_base_accuracy_m}
                                        onChange={(event) => setSlotDraft((current) => ({ ...current, custom_dispatch_base_accuracy_m: event.target.value }))}
                                        className="w-full rounded-[18px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                        placeholder="150"
                                    />
                                </label>
                            </div>
                        </div>
                    )}

                    {selectedSlot?.has_blocking_booking ? (
                        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-7 text-amber-100">
                            この枠には予約が紐づいているため、更新と削除はできません。
                        </div>
                    ) : null}

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="submit"
                            disabled={isSavingSlot || (slotDraft.dispatch_base_type === 'default' && !bookingSetting?.has_scheduled_base_location) || Boolean(selectedSlot?.has_blocking_booking)}
                            className="inline-flex items-center rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSavingSlot ? '保存中...' : slotDraft.public_id ? '空き枠を更新する' : '空き枠を追加する'}
                        </button>

                        {slotDraft.public_id ? (
                            <button
                                type="button"
                                onClick={() => setSlotDraft(createSlotDraft())}
                                className="inline-flex items-center rounded-full border border-white/10 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/5"
                            >
                                新規作成に戻る
                            </button>
                        ) : null}
                    </div>
                </form>
            </section>
        </div>
    );
}
