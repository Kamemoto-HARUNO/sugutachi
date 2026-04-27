import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { LocationMapPicker } from '../components/location/LocationMapPicker';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatJstDateTime } from '../lib/datetime';
import { getServiceAddressLabel } from '../lib/discovery';
import type { ApiEnvelope, ServiceAddress } from '../lib/types';

type PlaceType = ServiceAddress['place_type'];

interface AddressDraft {
    public_id: string | null;
    label: string;
    place_type: PlaceType;
    postal_code: string;
    prefecture: string;
    city: string;
    address_line: string;
    building: string;
    access_notes: string;
    lat: string;
    lng: string;
    is_default: boolean;
}

const placeTypeOptions: Array<{ value: PlaceType; label: string; description: string }> = [
    { value: 'home', label: '自宅', description: '自宅や生活圏を登録します。' },
    { value: 'hotel', label: 'ホテル', description: '宿泊先や出張先を登録します。' },
    { value: 'office', label: '仕事先', description: 'オフィスや滞在先を登録します。' },
    { value: 'other', label: 'その他', description: '待ち合わせ用の任意地点です。' },
];

function createDraft(address?: ServiceAddress | null): AddressDraft {
    return {
        public_id: address?.public_id ?? null,
        label: address?.label ?? '',
        place_type: address?.place_type ?? 'home',
        postal_code: address?.postal_code ?? '',
        prefecture: address?.prefecture ?? '',
        city: address?.city ?? '',
        address_line: address?.address_line ?? '',
        building: address?.building ?? '',
        access_notes: address?.access_notes ?? '',
        lat: address?.lat != null ? String(address.lat) : '',
        lng: address?.lng != null ? String(address.lng) : '',
        is_default: address?.is_default ?? false,
    };
}

function formatPlaceType(placeType: PlaceType): string {
    return placeTypeOptions.find((option) => option.value === placeType)?.label ?? '待ち合わせ場所';
}

function buildAddressLine(address: ServiceAddress): string {
    return [address.prefecture, address.city, address.address_line, address.building].filter(Boolean).join(' ');
}

function formatDateTime(value: string | null): string {
    return formatJstDateTime(value, {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }) ?? '未更新';
}

export function UserServiceAddressesPage() {
    const { token } = useAuth();
    const [addresses, setAddresses] = useState<ServiceAddress[]>([]);
    const [draft, setDraft] = useState<AddressDraft>(createDraft());
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [pendingAddressId, setPendingAddressId] = useState<string | null>(null);

    usePageTitle('待ち合わせ場所');
    useToastOnMessage(successMessage, 'success');
    useToastOnMessage(error, 'error');

    const selectedAddress = useMemo(
        () => addresses.find((address) => address.public_id === draft.public_id) ?? null,
        [addresses, draft.public_id],
    );
    const hasSelectedCoordinates = draft.lat.trim() !== '' && draft.lng.trim() !== '';

    const loadAddresses = useCallback(async () => {
        if (!token) {
            return;
        }

        const payload = await apiRequest<ApiEnvelope<ServiceAddress[]>>('/me/service-addresses', { token });
        const nextAddresses = unwrapData(payload);

        setAddresses(nextAddresses);

        setDraft((currentDraft) => {
            if (currentDraft.public_id) {
                const matched = nextAddresses.find((address) => address.public_id === currentDraft.public_id);

                if (matched) {
                    return createDraft(matched);
                }
            }

            return currentDraft.public_id ? currentDraft : createDraft(nextAddresses[0] ?? null);
        });
    }, [token]);

    useEffect(() => {
        let isMounted = true;

        void loadAddresses()
            .catch((requestError: unknown) => {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError
                        ? requestError.message
                        : '待ち合わせ場所の取得に失敗しました。';

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
    }, [loadAddresses]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token) {
            return;
        }

        setIsSaving(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const body = {
                label: draft.label || null,
                place_type: draft.place_type,
                postal_code: draft.postal_code || null,
                prefecture: draft.prefecture || null,
                city: draft.city || null,
                address_line: draft.address_line,
                building: draft.building || null,
                access_notes: draft.access_notes || null,
                lat: Number(draft.lat),
                lng: Number(draft.lng),
                ...(draft.public_id ? {} : { is_default: draft.is_default }),
            };

            if (draft.public_id) {
                await apiRequest<ApiEnvelope<ServiceAddress>>(`/me/service-addresses/${draft.public_id}`, {
                    method: 'PATCH',
                    token,
                    body,
                });

                if (draft.is_default && !selectedAddress?.is_default) {
                    await apiRequest<ApiEnvelope<ServiceAddress>>(`/me/service-addresses/${draft.public_id}/default`, {
                        method: 'POST',
                        token,
                    });
                }

                await loadAddresses();
                setSuccessMessage('待ち合わせ場所を更新しました。');
                return;
            }

            const payload = await apiRequest<ApiEnvelope<ServiceAddress>>('/me/service-addresses', {
                method: 'POST',
                token,
                body,
            });

            const createdAddress = unwrapData(payload);
            await loadAddresses();
            setDraft(createDraft(createdAddress));
            setSuccessMessage('待ち合わせ場所を追加しました。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '待ち合わせ場所の保存に失敗しました。';

            setError(message);
        } finally {
            setIsSaving(false);
        }
    }

    async function handleSetDefault(address: ServiceAddress) {
        if (!token) {
            return;
        }

        setPendingAddressId(address.public_id);
        setError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<ApiEnvelope<ServiceAddress>>(`/me/service-addresses/${address.public_id}/default`, {
                method: 'POST',
                token,
            });
            await loadAddresses();
            setDraft(createDraft({ ...address, is_default: true }));
            setSuccessMessage('既定の待ち合わせ場所を更新しました。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '既定設定の更新に失敗しました。';

            setError(message);
        } finally {
            setPendingAddressId(null);
        }
    }

    async function handleDelete(address: ServiceAddress) {
        if (!token) {
            return;
        }

        if (!window.confirm(`「${getServiceAddressLabel(address)}」を削除しますか？`)) {
            return;
        }

        setPendingAddressId(address.public_id);
        setError(null);
        setSuccessMessage(null);

        try {
            await apiRequest<null>(`/me/service-addresses/${address.public_id}`, {
                method: 'DELETE',
                token,
            });
            await loadAddresses();
            setDraft(createDraft());
            setSuccessMessage('待ち合わせ場所を削除しました。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '待ち合わせ場所の削除に失敗しました。';

            setError(message);
        } finally {
            setPendingAddressId(null);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="待ち合わせ場所を読み込み中" message="登録済みの住所とデフォルト設定を確認しています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[32px] bg-[linear-gradient(117deg,#17202b_0%,#243447_52%,#2b4158_100%)] p-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-[#d2b179]">待ち合わせ場所</p>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold">来てほしい場所を管理</h1>
                            <p className="max-w-3xl text-sm leading-7 text-slate-300">
                                検索や空き時間確認では、ここで登録した待ち合わせ場所を基準に徒歩目安と概算料金を計算します。
                                よく使う場所を既定にしておくと、検索導線がかなり軽くなります。
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Link
                            to="/user/therapists"
                            className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/8"
                        >
                            検索へ戻る
                        </Link>
                        <button
                            type="button"
                            onClick={() => {
                                setDraft(createDraft());
                                setSuccessMessage(null);
                                setError(null);
                            }}
                            className="inline-flex items-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105"
                        >
                            新しい待ち合わせ場所を追加
                        </button>
                    </div>
                </div>
            </section>



            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(380px,0.82fr)]">
                <section className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">登録済み住所</p>
                            <h2 className="mt-2 text-2xl font-semibold text-white">登録済みの待ち合わせ場所</h2>
                        </div>
                        <span className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-300">
                            {addresses.length} 件
                        </span>
                    </div>

                    {addresses.length > 0 ? (
                        <div className="grid gap-4">
                            {addresses.map((address) => {
                                const isSelected = draft.public_id === address.public_id;
                                const isPending = pendingAddressId === address.public_id;

                                return (
                                    <article
                                        key={address.public_id}
                                        className={[
                                            'rounded-[28px] border p-5 shadow-[0_12px_28px_rgba(15,23,42,0.08)] transition',
                                            isSelected
                                                ? 'border-[#d2b179] bg-[#fffaf2]'
                                                : 'border-white/10 bg-white/95',
                                        ].join(' ')}
                                    >
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                            <div className="space-y-3">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="rounded-full bg-[#f5efe4] px-3 py-1 text-xs font-semibold text-[#48505a]">
                                                        {formatPlaceType(address.place_type)}
                                                    </span>
                                                    {address.is_default ? (
                                                        <span className="rounded-full bg-[#17202b] px-3 py-1 text-xs font-semibold text-white">
                                                            既定
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <div>
                                                    <h3 className="text-xl font-semibold text-[#17202b]">
                                                        {getServiceAddressLabel(address)}
                                                    </h3>
                                                    <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                                        {buildAddressLine(address)}
                                                    </p>
                                                    {address.access_notes ? (
                                                        <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                                            補足: {address.access_notes}
                                                        </p>
                                                    ) : null}
                                                </div>
                                            </div>

                                            <div className="space-y-3 text-right">
                                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">
                                                    更新 {formatDateTime(address.updated_at)}
                                                </p>
                                                <div className="flex flex-wrap justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setDraft(createDraft(address));
                                                            setError(null);
                                                            setSuccessMessage(null);
                                                        }}
                                                        className="inline-flex items-center rounded-full border border-[#d9c9ae] px-4 py-2 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                                                    >
                                                        編集
                                                    </button>
                                                    {!address.is_default ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                void handleSetDefault(address);
                                                            }}
                                                            disabled={isPending}
                                                            className="inline-flex items-center rounded-full border border-[#d9c9ae] px-4 py-2 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee] disabled:cursor-not-allowed disabled:opacity-60"
                                                        >
                                                            {isPending ? '更新中...' : '既定にする'}
                                                        </button>
                                                    ) : null}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            void handleDelete(address);
                                                        }}
                                                        disabled={isPending}
                                                        className="inline-flex items-center rounded-full border border-[#f0d3cb] px-4 py-2 text-sm font-semibold text-[#9a4b35] transition hover:bg-[#fff1ed] disabled:cursor-not-allowed disabled:opacity-60"
                                                    >
                                                        {isPending ? '削除中...' : '削除'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="rounded-[28px] border border-dashed border-white/15 bg-white/5 p-8 text-center text-slate-300">
                            <h3 className="text-xl font-semibold text-white">まだ待ち合わせ場所がありません</h3>
                            <p className="mt-3 text-sm leading-7">
                                まず1件登録すると、検索一覧や空き時間確認でそのまま使えるようになります。
                            </p>
                        </div>
                    )}
                </section>

                <section className="rounded-[32px] bg-[#fffdf8] p-6 shadow-[0_18px_36px_rgba(23,32,43,0.12)] md:p-7">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">
                            {draft.public_id ? '住所を編集' : '新しい住所を追加'}
                        </p>
                        <h2 className="text-2xl font-semibold text-[#17202b]">
                            {draft.public_id ? '待ち合わせ場所を編集' : '新しい待ち合わせ場所を追加'}
                        </h2>
                        <p className="text-sm leading-7 text-[#68707a]">
                            位置はユーザー本人と運営だけが扱う前提です。セラピストには正確な住所ではなく、予約時に必要な情報だけを渡します。
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="mt-6 space-y-6">
                        <div className="grid gap-3 sm:grid-cols-2">
                            {placeTypeOptions.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                        setDraft((current) => ({ ...current, place_type: option.value }));
                                    }}
                                    className={[
                                        'rounded-[20px] border px-4 py-4 text-left transition',
                                        draft.place_type === option.value
                                            ? 'border-[#d2b179] bg-[#fff8ee]'
                                            : 'border-[#e7dccb] bg-[#fffdf8] hover:bg-[#fff9f1]',
                                    ].join(' ')}
                                >
                                    <p className="text-sm font-semibold text-[#17202b]">{option.label}</p>
                                    <p className="mt-2 text-sm leading-6 text-[#68707a]">{option.description}</p>
                                </button>
                            ))}
                        </div>

                        <div className="grid gap-5 md:grid-cols-2">
                            <div className="space-y-2">
                                <label htmlFor="label" className="text-sm font-semibold text-[#17202b]">表示名</label>
                                <input
                                    id="label"
                                    value={draft.label}
                                    onChange={(event) => {
                                        setDraft((current) => ({ ...current, label: event.target.value }));
                                    }}
                                    className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm outline-none transition focus:border-[#c6a16a]"
                                    placeholder="例: 新宿のホテル / 自宅"
                                />
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="postal_code" className="text-sm font-semibold text-[#17202b]">郵便番号</label>
                                <input
                                    id="postal_code"
                                    value={draft.postal_code}
                                    onChange={(event) => {
                                        setDraft((current) => ({ ...current, postal_code: event.target.value }));
                                    }}
                                    className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm outline-none transition focus:border-[#c6a16a]"
                                    placeholder="160-0022"
                                />
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="prefecture" className="text-sm font-semibold text-[#17202b]">都道府県</label>
                                <input
                                    id="prefecture"
                                    value={draft.prefecture}
                                    onChange={(event) => {
                                        setDraft((current) => ({ ...current, prefecture: event.target.value }));
                                    }}
                                    className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm outline-none transition focus:border-[#c6a16a]"
                                    placeholder="東京都"
                                />
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="city" className="text-sm font-semibold text-[#17202b]">市区町村</label>
                                <input
                                    id="city"
                                    value={draft.city}
                                    onChange={(event) => {
                                        setDraft((current) => ({ ...current, city: event.target.value }));
                                    }}
                                    className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm outline-none transition focus:border-[#c6a16a]"
                                    placeholder="新宿区新宿"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="address_line" className="text-sm font-semibold text-[#17202b]">番地・町名</label>
                            <input
                                id="address_line"
                                value={draft.address_line}
                                onChange={(event) => {
                                    setDraft((current) => ({ ...current, address_line: event.target.value }));
                                }}
                                className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm outline-none transition focus:border-[#c6a16a]"
                                placeholder="1-2-3"
                                required
                            />
                        </div>

                        <div className="grid gap-5 md:grid-cols-2">
                            <div className="space-y-2">
                                <label htmlFor="building" className="text-sm font-semibold text-[#17202b]">建物名・部屋番号</label>
                                <input
                                    id="building"
                                    value={draft.building}
                                    onChange={(event) => {
                                        setDraft((current) => ({ ...current, building: event.target.value }));
                                    }}
                                    className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm outline-none transition focus:border-[#c6a16a]"
                                    placeholder="サンプルホテル 1203"
                                />
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="access_notes" className="text-sm font-semibold text-[#17202b]">補足</label>
                                <input
                                    id="access_notes"
                                    value={draft.access_notes}
                                    onChange={(event) => {
                                        setDraft((current) => ({ ...current, access_notes: event.target.value }));
                                    }}
                                    className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm outline-none transition focus:border-[#c6a16a]"
                                    placeholder="フロントに着いたら連絡してほしい など"
                                />
                            </div>
                        </div>

                        <div className="rounded-[24px] bg-[#f8f4ed] p-5">
                            <div className="space-y-2">
                                <p className="text-sm font-semibold text-[#17202b]">地図で位置を設定</p>
                                <p className="text-sm leading-7 text-[#68707a]">
                                    徒歩目安の計算に使うため、位置情報も保存します。地図を押してピンを置くか、地名・住所検索から設定してください。
                                </p>
                            </div>

                            <div className="mt-4">
                                <LocationMapPicker
                                    label="待ち合わせ場所"
                                    latValue={draft.lat}
                                    lngValue={draft.lng}
                                    fallbackLatValue={selectedAddress?.lat != null ? String(selectedAddress.lat) : undefined}
                                    fallbackLngValue={selectedAddress?.lng != null ? String(selectedAddress.lng) : undefined}
                                    onLatChange={(value) => {
                                        setDraft((current) => ({ ...current, lat: value }));
                                    }}
                                    onLngChange={(value) => {
                                        setDraft((current) => ({ ...current, lng: value }));
                                    }}
                                    searchToken={token}
                                    disabled={isSaving}
                                />
                            </div>

                            <p className="mt-3 text-xs leading-6 text-[#7a7066]">
                                {hasSelectedCoordinates
                                    ? `保存する位置: 緯度 ${draft.lat} / 経度 ${draft.lng}`
                                    : '保存前に、検索または地図タップで位置を設定してください。'}
                            </p>
                        </div>

                        {!draft.public_id ? (
                            <label className="flex items-start gap-3 rounded-[20px] bg-[#f8f4ed] px-4 py-4 text-sm leading-7 text-[#48505a]">
                                <input
                                    type="checkbox"
                                    checked={draft.is_default}
                                    onChange={(event) => {
                                        setDraft((current) => ({ ...current, is_default: event.target.checked }));
                                    }}
                                    className="mt-1 h-4 w-4 rounded border-[#d1c4b1]"
                                />
                                <span>この場所を既定の待ち合わせ場所として保存する</span>
                            </label>
                        ) : (
                            <label className="flex items-start gap-3 rounded-[20px] bg-[#f8f4ed] px-4 py-4 text-sm leading-7 text-[#48505a]">
                                <input
                                    type="checkbox"
                                    checked={draft.is_default}
                                    onChange={(event) => {
                                        setDraft((current) => ({ ...current, is_default: event.target.checked }));
                                    }}
                                    className="mt-1 h-4 w-4 rounded border-[#d1c4b1]"
                                />
                                <span>保存後、この場所を既定にする</span>
                            </label>
                        )}

                        <div className="flex flex-wrap gap-3">
                            <button
                                type="submit"
                                disabled={isSaving || !hasSelectedCoordinates}
                                className="inline-flex items-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isSaving ? '保存中...' : draft.public_id ? '更新する' : '追加する'}
                            </button>

                            {draft.public_id ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDraft(createDraft());
                                        setError(null);
                                        setSuccessMessage(null);
                                    }}
                                    className="inline-flex items-center rounded-full border border-[#d9c9ae] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                                >
                                    新規入力に切り替える
                                </button>
                            ) : null}
                        </div>
                    </form>
                </section>
            </div>
        </div>
    );
}
