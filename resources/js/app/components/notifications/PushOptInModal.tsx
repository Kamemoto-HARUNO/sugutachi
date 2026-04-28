import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { useToast } from '../../hooks/useToast';

const DISMISS_STORAGE_PREFIX = 'sugutachi.push-optin-dismissed:';

function dismissalStorageKey(accountPublicId: string): string {
    return `${DISMISS_STORAGE_PREFIX}${accountPublicId}`;
}

export function PushOptInModal() {
    const { account, isAuthenticated } = useAuth();
    const {
        enablePushNotifications,
        isPushConfigReady,
        isPushConfigured,
        isPushEnabled,
        isPushLoading,
        isPushSupported,
        pushPermission,
    } = useNotifications();
    const { showError, showSuccess } = useToast();
    const [isOpen, setIsOpen] = useState(false);

    const accountPublicId = account?.public_id ?? null;

    const canPrompt = useMemo(() => {
        if (!isAuthenticated || !accountPublicId) {
            return false;
        }

        if (!isPushSupported || !isPushConfigReady || !isPushConfigured) {
            return false;
        }

        if (pushPermission !== 'default' || isPushEnabled) {
            return false;
        }

        return window.sessionStorage.getItem(dismissalStorageKey(accountPublicId)) !== '1';
    }, [
        accountPublicId,
        isAuthenticated,
        isPushConfigReady,
        isPushConfigured,
        isPushEnabled,
        isPushSupported,
        pushPermission,
    ]);

    useEffect(() => {
        setIsOpen(canPrompt);
    }, [canPrompt]);

    const dismiss = useCallback(() => {
        if (accountPublicId) {
            window.sessionStorage.setItem(dismissalStorageKey(accountPublicId), '1');
        }

        setIsOpen(false);
    }, [accountPublicId]);

    async function handleEnable() {
        try {
            await enablePushNotifications();
            if (accountPublicId) {
                window.sessionStorage.setItem(dismissalStorageKey(accountPublicId), '1');
            }
            setIsOpen(false);
            showSuccess('プッシュ通知を有効にしました。');
        } catch (error) {
            showError(error instanceof Error ? error.message : 'プッシュ通知の有効化に失敗しました。');
        }
    }

    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[rgba(12,16,24,0.46)] px-4 py-6 sm:items-center">
            <div className="w-full max-w-lg rounded-[32px] border border-white/10 bg-[linear-gradient(140deg,rgba(23,32,43,0.98)_0%,rgba(31,45,61,0.96)_100%)] p-6 text-white shadow-[0_30px_70px_rgba(15,23,42,0.32)] sm:p-7">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <span className="text-xs font-semibold tracking-[0.16em] text-[#e8d5b2]">プッシュ通知</span>
                        <h2 className="text-[1.6rem] font-semibold leading-[1.4] text-white">
                            プッシュ通知を有効にしませんか？
                        </h2>
                        <p className="text-sm leading-7 text-slate-300">
                            承認待ちの予約、進行中の対応、運営からのお知らせを、この端末やブラウザですぐ受け取れます。
                        </p>
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                        <p className="text-sm leading-7 text-slate-200">
                            このあと表示される端末の確認で <span className="font-semibold text-white">許可</span> を選ぶと、
                            予約の更新がブラウザを閉じていても届くようになります。
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={dismiss}
                            className="rounded-full border border-white/12 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/8"
                        >
                            後で
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                void handleEnable();
                            }}
                            disabled={isPushLoading}
                            className="rounded-full bg-[#e8d5b2] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isPushLoading ? '準備しています...' : 'プッシュ通知を有効にする'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
