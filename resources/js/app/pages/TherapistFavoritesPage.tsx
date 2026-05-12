import { useEffect, useState } from 'react';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToast } from '../hooks/useToast';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import type { ApiEnvelope, TherapistFavoriteUserRecord } from '../lib/types';

export function TherapistFavoritesPage() {
    const { token } = useAuth();
    const { showError } = useToast();
    const [favorites, setFavorites] = useState<TherapistFavoriteUserRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    usePageTitle('お気に入り利用者');

    useEffect(() => {
        let isMounted = true;

        async function loadData() {
            if (!token) {
                return;
            }

            try {
                const payload = await apiRequest<ApiEnvelope<TherapistFavoriteUserRecord[]>>('/me/therapist/favorites', { token });

                if (isMounted) {
                    setFavorites(unwrapData(payload));
                }
            } catch (error) {
                if (isMounted) {
                    showError(error instanceof ApiError ? error.message : 'お気に入り利用者の取得に失敗しました。');
                }
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

    if (isLoading) {
        return <LoadingScreen title="お気に入り利用者を読み込み中" message="あなたを保存した利用者を確認しています。" />;
    }

    return (
        <div className="space-y-6">
            <section className="rounded-[28px] bg-white p-6 shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">FAVORITED USERS</p>
                <h1 className="mt-2 text-2xl font-semibold text-[#17202b]">お気に入り利用者</h1>
                <p className="mt-2 text-sm leading-6 text-[#68707a]">
                    あなたをお気に入りに追加している利用者の一覧です。ブロック関係や停止中アカウントは表示されません。
                </p>
            </section>

            <section className="rounded-[28px] bg-white shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                {favorites.length === 0 ? (
                    <p className="p-8 text-center text-sm text-[#68707a]">まだお気に入りに追加されていません。</p>
                ) : (
                    <div className="divide-y divide-[#efe5d7]">
                        {favorites.map((favorite) => (
                            <div key={favorite.id} className="flex items-center justify-between gap-4 p-5">
                                <div>
                                    <p className="font-semibold text-[#17202b]">{favorite.user.display_name}</p>
                                    <p className="mt-1 text-xs text-[#68707a]">追加日 {new Date(favorite.created_at).toLocaleDateString('ja-JP')}</p>
                                </div>
                                <span className="rounded-full bg-[#f6f1e7] px-3 py-1 text-xs font-semibold text-[#48505a]">
                                    {favorite.user.status}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
