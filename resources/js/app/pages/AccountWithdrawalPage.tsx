import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrandMark } from '../components/brand/BrandMark';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import { formatCurrency } from '../lib/discovery';
import { formatDateTime } from '../lib/therapist';
import type {
    AccountWithdrawalStatusRecord,
    ApiEnvelope,
} from '../lib/types';

type WithdrawalStep = 'select' | 'confirm';

function blockerRoleLabel(role: 'user' | 'therapist'): string {
    return role === 'therapist' ? 'タチキャストとしての予約' : '利用者としての予約';
}

export function AccountWithdrawalPage() {
    const navigate = useNavigate();
    const { clearSession, token } = useAuth();
    const [status, setStatus] = useState<AccountWithdrawalStatusRecord | null>(null);
    const [selectedReasonCode, setSelectedReasonCode] = useState('');
    const [step, setStep] = useState<WithdrawalStep>('select');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    usePageTitle('退会');
    useToastOnMessage(error, 'error');

    const loadStatus = useCallback(async () => {
        if (!token) {
            return;
        }

        const payload = await apiRequest<ApiEnvelope<AccountWithdrawalStatusRecord>>('/me/withdrawal', { token });
        setStatus(unwrapData(payload));
    }, [token]);

    useEffect(() => {
        let isMounted = true;

        void loadStatus()
            .catch((requestError: unknown) => {
                if (!isMounted) {
                    return;
                }

                const message = requestError instanceof ApiError ? requestError.message : '退会情報の取得に失敗しました。';
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
    }, [loadStatus]);

    const selectedReasonLabel = useMemo(() => {
        return status?.reason_options.find((option) => option.code === selectedReasonCode)?.label ?? null;
    }, [selectedReasonCode, status?.reason_options]);

    const hasRemainingBalance = (status?.remaining_balance_amount ?? 0) > 0;

    async function handleWithdraw() {
        if (!token || !selectedReasonCode || isSubmitting) {
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            await apiRequest<{ message: string }>('/me/withdrawal', {
                method: 'POST',
                token,
                body: {
                    reason_code: selectedReasonCode,
                },
            });

            clearSession();
            navigate('/withdrawal/completed', { replace: true });
        } catch (requestError) {
            const message = requestError instanceof ApiError ? requestError.message : '退会処理に失敗しました。';
            setError(message);
            setStep('select');
            await loadStatus().catch(() => undefined);
        } finally {
            setIsSubmitting(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="退会情報を確認中" message="進行中の予約や残高の状態を確認しています。" />;
    }

    return (
        <div className="mx-auto w-full max-w-[920px] px-4 py-8 sm:px-6 lg:px-8">
            <div className="space-y-8 rounded-[32px] border border-white/10 bg-[#0f1722] p-6 shadow-[0_24px_60px_rgba(2,6,23,0.24)] sm:p-8">
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                        <BrandMark inverse compact />
                        <span className="text-slate-500">/</span>
                        <Link to="/profile" className="transition hover:text-white">アカウント設定</Link>
                        <span className="text-slate-500">/</span>
                        <span>退会</span>
                    </div>

                    <div className="space-y-3">
                        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold tracking-wide text-slate-200">
                            アカウント手続き
                        </span>
                        <h1 className="text-[2.4rem] font-semibold leading-[1.3] text-white sm:text-[3rem]">
                            退会
                        </h1>
                        <p className="text-sm leading-7 text-slate-300">
                            退会すると、このアカウントを元に戻すことはできません。必要な確認を済ませてから、最後にご自身で確定してください。
                        </p>
                    </div>
                </div>

                {status?.blocking_booking_count ? (
                    <section className="rounded-[24px] border border-rose-300/25 bg-rose-300/10 p-5 text-sm text-rose-100">
                        <p className="text-base font-semibold text-white">予約が残っているため、いまは退会できません。</p>
                        <p className="mt-2 leading-7">
                            進行中または未完了の予約が {status.blocking_booking_count} 件あります。予約がすべて終了してから、もう一度手続きを進めてください。
                        </p>
                        {status.next_blocking_booking ? (
                            <div className="mt-4 rounded-[18px] border border-white/10 bg-[#111923] px-4 py-4 text-slate-200">
                                <p className="text-xs font-semibold tracking-wide text-slate-400">次に確認が必要な予約</p>
                                <p className="mt-2 text-sm">
                                    {blockerRoleLabel(status.next_blocking_booking.role)} / {formatDateTime(status.next_blocking_booking.scheduled_start_at)}
                                </p>
                            </div>
                        ) : null}
                    </section>
                ) : null}

                {status?.has_processing_payout_request ? (
                    <section className="rounded-[24px] border border-rose-300/25 bg-rose-300/10 p-5 text-sm text-rose-100">
                        <p className="text-base font-semibold text-white">出金処理中の申請があるため、いまは退会できません。</p>
                        <p className="mt-2 leading-7">
                            売上の出金処理が完了するまでは退会を受け付けられません。処理完了後にもう一度お試しください。
                        </p>
                    </section>
                ) : null}

                {hasRemainingBalance ? (
                    <section className="rounded-[24px] border border-amber-300/25 bg-amber-300/10 p-5 text-sm text-amber-100">
                        <p className="text-base font-semibold text-white">残高の注意</p>
                        <p className="mt-2 leading-7">
                            現在の残高 {formatCurrency(status?.remaining_balance_amount ?? 0)} は、退会すると引き落とせなくなります。
                        </p>
                    </section>
                ) : null}

                {step === 'select' ? (
                    <section className="space-y-5 rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">退会理由</p>
                            <h2 className="text-2xl font-semibold text-white">退会理由（選択式）</h2>
                            <p className="text-sm leading-7 text-slate-300">
                                今後の改善の参考にするため、もっとも近い理由を1つ選んでください。
                            </p>
                        </div>

                        <div className="space-y-3">
                            {status?.reason_options.map((option) => {
                                const isChecked = selectedReasonCode === option.code;

                                return (
                                    <label
                                        key={option.code}
                                        className={`flex cursor-pointer items-start gap-3 rounded-[20px] border px-4 py-4 transition ${
                                            isChecked
                                                ? 'border-[#f3dec0]/70 bg-[#f3dec0]/10'
                                                : 'border-white/10 bg-[#111923] hover:border-white/20'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="withdrawal_reason"
                                            value={option.code}
                                            checked={isChecked}
                                            onChange={(event) => {
                                                setSelectedReasonCode(event.target.value);
                                                setError(null);
                                            }}
                                            className="mt-1 h-4 w-4 accent-[#f3dec0]"
                                        />
                                        <span className="text-sm font-medium text-white">{option.label}</span>
                                    </label>
                                );
                            })}
                        </div>

                        <div className="flex flex-wrap gap-3 pt-2">
                            <Link
                                to="/profile"
                                className="inline-flex min-h-11 items-center rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/5"
                            >
                                アカウント設定へ戻る
                            </Link>
                            <button
                                type="button"
                                disabled={!selectedReasonCode || !status?.can_withdraw}
                                onClick={() => {
                                    if (!selectedReasonCode) {
                                        setError('退会理由を選択してください。');
                                        return;
                                    }

                                    setError(null);
                                    setStep('confirm');
                                }}
                                className="inline-flex min-h-11 items-center rounded-full bg-[#f3dec0] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f7e7cd] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                退会する
                            </button>
                        </div>
                    </section>
                ) : (
                    <section className="space-y-5 rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold tracking-wide text-[#f3dec0]">最終確認</p>
                            <h2 className="text-2xl font-semibold text-white">この内容で退会しますか？</h2>
                            <p className="text-sm leading-7 text-slate-300">
                                退会したらアカウントを元に戻すことはできません。内容を確認してから最後のボタンを押してください。
                            </p>
                        </div>

                        <div className="space-y-4 rounded-[24px] border border-white/10 bg-[#111923] p-5">
                            <div>
                                <p className="text-xs font-semibold tracking-wide text-slate-400">選択した退会理由</p>
                                <p className="mt-2 text-sm font-medium text-white">{selectedReasonLabel ?? '未選択'}</p>
                            </div>

                            {hasRemainingBalance ? (
                                <div className="rounded-[18px] border border-amber-300/20 bg-amber-300/10 px-4 py-4 text-sm text-amber-100">
                                    退会すると、残高 {formatCurrency(status?.remaining_balance_amount ?? 0)} は引き落とせなくなります。
                                </div>
                            ) : null}

                            <div className="rounded-[18px] border border-rose-300/20 bg-rose-300/10 px-4 py-4 text-sm text-rose-100">
                                この操作は取り消せません。退会後はログインできなくなります。
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setStep('select')}
                                className="inline-flex min-h-11 items-center rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/5"
                            >
                                戻る
                            </button>
                            <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => {
                                    void handleWithdraw();
                                }}
                                className="inline-flex min-h-11 items-center rounded-full bg-[#e7a7a7] px-5 py-3 text-sm font-semibold text-[#2b1414] transition hover:bg-[#ebb6b6] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isSubmitting ? '退会処理中...' : '本当に退会する'}
                            </button>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
