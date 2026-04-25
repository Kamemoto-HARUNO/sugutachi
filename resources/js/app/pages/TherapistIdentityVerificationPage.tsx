import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import {
    formatDate,
    formatDateTime,
    formatIdentityVerificationStatus,
    formatRejectionReason,
} from '../lib/therapist';
import type {
    ApiEnvelope,
    IdentityVerificationRecord,
    TempFileRecord,
} from '../lib/types';

const documentTypeOptions = [
    { value: 'driver_license', label: '運転免許証' },
    { value: 'passport', label: 'パスポート' },
    { value: 'my_number_card', label: 'マイナンバーカード' },
    { value: 'residence_card', label: '在留カード' },
    { value: 'other', label: 'その他' },
];

async function uploadTempFile(token: string, purpose: 'identity_document' | 'selfie', file: File): Promise<TempFileRecord> {
    const formData = new FormData();
    formData.append('purpose', purpose);
    formData.append('file', file);

    const payload = await apiRequest<ApiEnvelope<TempFileRecord>>('/temp-files', {
        method: 'POST',
        token,
        body: formData,
    });

    return unwrapData(payload);
}

export function TherapistIdentityVerificationPage() {
    const { token } = useAuth();
    const [latestVerification, setLatestVerification] = useState<IdentityVerificationRecord | null>(null);
    const [fullName, setFullName] = useState('');
    const [birthdate, setBirthdate] = useState('');
    const [documentType, setDocumentType] = useState('driver_license');
    const [documentLast4, setDocumentLast4] = useState('');
    const [documentFile, setDocumentFile] = useState<File | null>(null);
    const [selfieFile, setSelfieFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    usePageTitle('本人確認・年齢確認');

    const loadLatestVerification = useCallback(async () => {
        if (!token) {
            return;
        }

        try {
            const payload = await apiRequest<ApiEnvelope<IdentityVerificationRecord>>('/me/identity-verification', {
                token,
            });

            setLatestVerification(unwrapData(payload));
        } catch (requestError) {
            if (requestError instanceof ApiError && requestError.status === 404) {
                setLatestVerification(null);
                return;
            }

            throw requestError;
        }
    }, [token]);

    useEffect(() => {
        let isMounted = true;

        void loadLatestVerification()
            .catch((requestError: unknown) => {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError
                        ? requestError.message
                        : '本人確認状態の取得に失敗しました。';

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
    }, [loadLatestVerification]);

    const allowsSubmission = useMemo(() => {
        return latestVerification == null || latestVerification.status === 'rejected';
    }, [latestVerification]);

    const submitEndpoint = latestVerification?.status === 'rejected'
        ? '/me/identity-verification/resubmit'
        : '/me/identity-verification';

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token) {
            return;
        }

        if (!documentFile || !selfieFile) {
            setError('本人確認書類とセルフィー画像の両方を選択してください。');
            return;
        }

        setIsSubmitting(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const [documentTempFile, selfieTempFile] = await Promise.all([
                uploadTempFile(token, 'identity_document', documentFile),
                uploadTempFile(token, 'selfie', selfieFile),
            ]);

            const payload = await apiRequest<ApiEnvelope<IdentityVerificationRecord>>(submitEndpoint, {
                method: 'POST',
                token,
                body: {
                    full_name: fullName,
                    birthdate,
                    self_declared_male: true,
                    document_type: documentType,
                    document_last4: documentLast4 || undefined,
                    document_file_id: documentTempFile.file_id,
                    selfie_file_id: selfieTempFile.file_id,
                },
            });

            const nextVerification = unwrapData(payload);

            setLatestVerification(nextVerification);
            setSuccessMessage(nextVerification.status === 'pending'
                ? '提出を受け付けました。運営による確認が終わるまでお待ちください。'
                : '本人確認情報を更新しました。');
            setDocumentFile(null);
            setSelfieFile(null);
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '本人確認の提出に失敗しました。';

            setError(message);
        } finally {
            setIsSubmitting(false);
        }
    }

    if (isLoading) {
        return <LoadingScreen title="本人確認を確認中" message="提出状況と必要な入力項目を読み込んでいます。" />;
    }

    return (
        <div className="space-y-8">
            <section className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-6 md:p-8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">IDENTITY</p>
                        <h1 className="text-3xl font-semibold text-white">本人確認・年齢確認</h1>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            18歳以上確認と本人確認が完了すると、セラピストプロフィールの審査提出条件を満たせます。書類画像とセルフィーは審査用途に限定して扱います。
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-5 py-4 text-sm text-slate-200">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">CURRENT STATUS</p>
                        <p className="mt-2 text-2xl font-semibold text-white">
                            {formatIdentityVerificationStatus(latestVerification?.status)}
                        </p>
                    </div>
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
                        プロフィールへ進む
                    </Link>
                </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
                <article className="rounded-[24px] border border-white/10 bg-white/5 p-6">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">SUBMISSION</p>
                        <h2 className="text-xl font-semibold text-white">
                            {latestVerification?.status === 'rejected' ? '差し戻し後の再提出' : '本人確認を提出する'}
                        </h2>
                        <p className="text-sm leading-7 text-slate-300">
                            氏名、生年月日、本人確認書類、セルフィーを送信します。提出後は運営確認が終わるまでお待ちください。
                        </p>
                    </div>

                    {error ? (
                        <div className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                            {error}
                        </div>
                    ) : null}

                    {successMessage ? (
                        <div className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                            {successMessage}
                        </div>
                    ) : null}

                    {!allowsSubmission ? (
                        <div className="mt-5 rounded-2xl border border-white/10 bg-[#111923] px-4 py-3 text-sm leading-7 text-slate-300">
                            {latestVerification?.status === 'pending'
                                ? '現在審査中です。追加提出が必要な場合は運営からの差し戻しをお待ちください。'
                                : '本人確認は承認済みです。プロフィールとメニューの整備へ進めます。'}
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">氏名</span>
                                    <input
                                        value={fullName}
                                        onChange={(event) => setFullName(event.target.value)}
                                        className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                        placeholder="山田 太郎"
                                        required
                                    />
                                </label>

                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">生年月日</span>
                                    <input
                                        type="date"
                                        value={birthdate}
                                        onChange={(event) => setBirthdate(event.target.value)}
                                        className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                        required
                                    />
                                </label>
                            </div>

                            <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">書類種別</span>
                                    <select
                                        value={documentType}
                                        onChange={(event) => setDocumentType(event.target.value)}
                                        className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                    >
                                        {documentTypeOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">書類番号末尾4桁など（任意）</span>
                                    <input
                                        value={documentLast4}
                                        onChange={(event) => setDocumentLast4(event.target.value)}
                                        className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                        placeholder="1234"
                                    />
                                </label>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">本人確認書類</span>
                                    <input
                                        type="file"
                                        accept=".jpg,.jpeg,.png,.webp,.pdf"
                                        onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)}
                                        className="block w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-slate-200"
                                    />
                                    <span className="text-xs text-slate-400">
                                        {documentFile ? documentFile.name : 'jpg / png / webp / pdf を選択'}
                                    </span>
                                </label>

                                <label className="space-y-2">
                                    <span className="text-sm font-semibold text-white">セルフィー画像</span>
                                    <input
                                        type="file"
                                        accept=".jpg,.jpeg,.png,.webp"
                                        onChange={(event) => setSelfieFile(event.target.files?.[0] ?? null)}
                                        className="block w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-slate-200"
                                    />
                                    <span className="text-xs text-slate-400">
                                        {selfieFile ? selfieFile.name : '顔がはっきり分かる画像を選択'}
                                    </span>
                                </label>
                            </div>

                            <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-[#111923] px-4 py-3 text-sm leading-7 text-slate-300">
                                <input type="checkbox" checked readOnly className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent text-rose-300" />
                                <span>男性専用サービス対象であることを自己申告のうえ、本人確認情報を送信します。</span>
                            </label>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="inline-flex items-center rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isSubmitting ? '提出中...' : latestVerification?.status === 'rejected' ? '再提出する' : '提出する'}
                            </button>
                        </form>
                    )}
                </article>

                <article className="space-y-4 rounded-[24px] border border-white/10 bg-white/5 p-6">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">LATEST RECORD</p>
                        <h2 className="text-xl font-semibold text-white">直近の提出状況</h2>
                    </div>

                    {latestVerification ? (
                        <div className="space-y-3">
                            <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                                <p className="text-sm font-semibold text-white">ステータス</p>
                                <p className="mt-2 text-sm text-slate-300">
                                    {formatIdentityVerificationStatus(latestVerification.status)}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                                <p className="text-sm font-semibold text-white">書類種別</p>
                                <p className="mt-2 text-sm text-slate-300">{latestVerification.document_type ?? '未設定'}</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                                <p className="text-sm font-semibold text-white">提出日時</p>
                                <p className="mt-2 text-sm text-slate-300">{formatDateTime(latestVerification.submitted_at)}</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                                <p className="text-sm font-semibold text-white">削除予定</p>
                                <p className="mt-2 text-sm text-slate-300">{formatDate(latestVerification.purge_after)}</p>
                            </div>
                            {latestVerification.rejection_reason_code ? (
                                <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-7 text-amber-100">
                                    差し戻し理由: {formatRejectionReason(latestVerification.rejection_reason_code)}
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3 text-sm leading-7 text-slate-300">
                            まだ提出はありません。必要情報を入力して本人確認を始めてください。
                        </div>
                    )}
                </article>
            </section>
        </div>
    );
}
