import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToast } from '../hooks/useToast';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import type { ApiEnvelope, FavoriteTherapistRecord, UserProfileRecord } from '../lib/types';

function compactCount(value: number): string {
    return value >= 1000 ? `${Math.floor(value / 100) / 10}k` : String(value);
}

interface FavoriteNotificationSwitchProps {
    checked: boolean;
    description: string;
    disabled: boolean;
    label: string;
    onChange: (checked: boolean) => void;
}

function FavoriteNotificationSwitch({
    checked,
    description,
    disabled,
    label,
    onChange,
}: FavoriteNotificationSwitchProps) {
    return (
        <label className="flex items-center justify-between gap-4 py-3">
            <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#17202b]">{label}</span>
                <span className="mt-1 block text-xs leading-5 text-[#68707a]">{description}</span>
            </span>
            <span className="relative inline-flex shrink-0 items-center">
                <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={(event) => onChange(event.target.checked)}
                    className="peer sr-only"
                />
                <span className="h-7 w-12 rounded-full bg-[#ded4c5] transition peer-checked:bg-[#17202b] peer-disabled:opacity-50" />
                <span className="pointer-events-none absolute left-1 h-5 w-5 rounded-full bg-white shadow-[0_2px_8px_rgba(23,32,43,0.22)] transition peer-checked:translate-x-5" />
            </span>
        </label>
    );
}

export function UserFavoriteTherapistsPage() {
    const { token } = useAuth();
    const { showError, showSuccess } = useToast();
    const [favorites, setFavorites] = useState<FavoriteTherapistRecord[]>([]);
    const [profile, setProfile] = useState<UserProfileRecord | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    usePageTitle('お気に入りタチキャスト');

    useEffect(() => {
        let isMounted = true;

        async function loadData() {
            if (!token) {
                return;
            }

            try {
                const [favoritesPayload, profilePayload] = await Promise.all([
                    apiRequest<ApiEnvelope<FavoriteTherapistRecord[]>>('/me/favorite-therapists', { token }),
                    apiRequest<ApiEnvelope<UserProfileRecord | null>>('/me/user-profile', { token }),
                ]);

                if (!isMounted) {
                    return;
                }

                setFavorites(unwrapData(favoritesPayload));
                setProfile(unwrapData(profilePayload));
            } catch (error) {
                if (!isMounted) {
                    return;
                }

                showError(error instanceof ApiError ? error.message : 'お気に入り情報の取得に失敗しました。');
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        }

        void loadData();

        return () => {
            isMounted = false;
        };
    }, [showError, token]);

    async function updateSettings(nextProfile: UserProfileRecord) {
        if (!token) {
            return;
        }

        setIsSaving(true);

        try {
            const payload = await apiRequest<ApiEnvelope<UserProfileRecord>>('/me/user-profile/favorite-notifications', {
                method: 'PATCH',
                token,
                body: {
                    favorite_notify_online: nextProfile.favorite_notify_online,
                    favorite_notify_availability: nextProfile.favorite_notify_availability,
                    favorite_email_notifications_enabled: nextProfile.favorite_email_notifications_enabled,
                },
            });

            setProfile(unwrapData(payload));
            showSuccess('お気に入り通知設定を保存しました。');
        } catch (error) {
            showError(error instanceof ApiError ? error.message : '通知設定の保存に失敗しました。');
        } finally {
            setIsSaving(false);
        }
    }

    const settings = profile ?? {
        favorite_notify_online: true,
        favorite_notify_availability: true,
        favorite_email_notifications_enabled: true,
    } as UserProfileRecord;

    if (isLoading) {
        return <LoadingScreen title="お気に入りを読み込み中" message="保存したタチキャストと通知設定を確認しています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[28px] bg-white p-6 shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                <div className="space-y-6">
                    <div>
                        <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">FAVORITES</p>
                        <h1 className="mt-2 text-2xl font-semibold text-[#17202b]">お気に入りタチキャスト</h1>
                        <p className="mt-2 text-sm leading-6 text-[#68707a]">
                            お気に入りに追加したタチキャストがオンラインになったとき、または空き枠を公開したときに通知を受け取れます。
                        </p>
                    </div>

                    <div className="border-t border-[#efe5d7] pt-5">
                        <h2 className="text-sm font-semibold text-[#17202b]">通知設定</h2>
                        <div className="mt-2 divide-y divide-[#efe5d7]">
                        {([
                            ['favorite_notify_online', 'オンライン時の通知', 'お気に入りのタチキャストがオンライン受付を開始したときにアプリ内通知を受け取ります。'],
                            ['favorite_notify_availability', '空き枠設定時の通知', 'お気に入りのタチキャストが新しい空き枠を公開したときにアプリ内通知を受け取ります。'],
                            ['favorite_email_notifications_enabled', 'メール通知', 'お気に入り通知にあわせてメールも受け取ります。オフにしてもアプリ内通知は届きます。'],
                        ] as const).map(([key, label, description]) => (
                            <FavoriteNotificationSwitch
                                key={key}
                                checked={Boolean(settings[key])}
                                description={description}
                                disabled={isSaving}
                                label={label}
                                onChange={(checked) => updateSettings({ ...settings, [key]: checked })}
                            />
                        ))}
                        </div>
                    </div>
                </div>
            </section>

            {favorites.length === 0 ? (
                <section className="rounded-[28px] bg-white p-8 text-center shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                    <p className="text-sm text-[#68707a]">まだお気に入りに追加したタチキャストはいません。</p>
                    <Link to="/user/therapists" className="mt-4 inline-flex rounded-full bg-[#17202b] px-5 py-3 text-sm font-semibold text-white">
                        タチキャストを探す
                    </Link>
                </section>
            ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                    {favorites.map((favorite) => (
                        <Link
                            key={favorite.id}
                            to={`/therapists/${favorite.therapist.public_id}`}
                            className="flex gap-4 rounded-[24px] bg-white p-4 shadow-[0_10px_24px_rgba(23,32,43,0.08)] transition hover:-translate-y-0.5"
                        >
                            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[20px] bg-[#ede2cf]">
                                {favorite.therapist.photo?.url ? (
                                    <img src={favorite.therapist.photo.url} alt="" className="h-full w-full object-cover" />
                                ) : null}
                            </div>
                            <div className="min-w-0 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-lg font-semibold text-[#17202b]">{favorite.therapist.public_name}</h2>
                                    <span className={favorite.therapist.is_online ? 'rounded-full bg-[#e8f1eb] px-2 py-1 text-xs text-[#2d5b3d]' : 'rounded-full bg-[#f3eee4] px-2 py-1 text-xs text-[#68707a]'}>
                                        {favorite.therapist.is_online ? 'オンライン' : 'オフライン'}
                                    </span>
                                </div>
                                <p className="line-clamp-2 text-sm leading-6 text-[#68707a]">{favorite.therapist.bio_excerpt ?? 'プロフィール詳細を確認できます。'}</p>
                                <p className="text-xs font-semibold text-[#48505a]">
                                    ★{favorite.therapist.rating_average.toFixed(1)}（{favorite.therapist.review_count}） / 
                                    <span className="inline-flex items-center gap-1" aria-label={`保存${favorite.therapist.favorite_count}件`}>
                                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <path d="M6.5 4.75A2.25 2.25 0 0 1 8.75 2.5h6.5a2.25 2.25 0 0 1 2.25 2.25v16.1l-5.5-3.2-5.5 3.2V4.75Z" />
                                        </svg>
                                        {compactCount(favorite.therapist.favorite_count)}
                                    </span>
                                </p>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
