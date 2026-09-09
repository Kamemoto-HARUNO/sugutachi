import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { apiRequest } from '../lib/api';
import { dmError, type RelationshipPreview } from '../lib/directMessages';
import type { BookingDetailRecord, ReportRecord } from '../lib/types';
import { RelationshipBlockButton } from '../components/messages/RelationshipBlockButton';

export const TherapistBookingReportPage = UserBookingReportPage;
export function UserBookingReportPage() {
    const { publicId } = useParams();
    const location = useLocation();
    const { token } = useAuth();
    const role = location.pathname.startsWith('/therapist/')
        ? 'therapist'
        : 'user';
    const [booking, setBooking] = useState<BookingDetailRecord | null>(null);
    const [relationship, setRelationship] =
        useState<RelationshipPreview | null>(null);
    const [category, setCategory] = useState('safety_concern');
    const [severity, setSeverity] = useState('medium');
    const [detail, setDetail] = useState('');
    const [success, setSuccess] = useState<ReportRecord | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!token || !publicId) return;
        const abort = new AbortController();
        void Promise.all([
            apiRequest<{ data: BookingDetailRecord }>(`/bookings/${publicId}`, {
                token,
                signal: abort.signal,
            }),
            apiRequest<{ data: RelationshipPreview }>(
                `/${role}/relationships/for-booking/${publicId}`,
                { token, signal: abort.signal },
            ),
        ])
            .then(([b, r]) => {
                if (!abort.signal.aborted) {
                    setBooking(b.data);
                    setRelationship(r.data);
                }
            })
            .catch((e) => {
                if (!abort.signal.aborted) setError(dmError(e));
            });
        return () => abort.abort();
    }, [token, publicId, role]);
    async function submit(e: FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            setSuccess(
                (
                    await apiRequest<{ data: ReportRecord }>('/reports', {
                        token,
                        method: 'POST',
                        body: {
                            booking_id: publicId,
                            category,
                            severity,
                            detail,
                        },
                    })
                ).data,
            );
            setDetail('');
        } catch (e) {
            setError(dmError(e));
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="mx-auto max-w-2xl space-y-5">
            <Link
                to={`/${role}/bookings/${publicId}`}
                className="inline-flex min-h-11 items-center underline"
            >
                予約詳細へ戻る
            </Link>
            <h1 className="text-xl font-semibold">
                {role === 'user' ? '利用者' : 'タチキャスト'}
                として通報・ブロック
            </h1>
            {error && (
                <p role="alert" className="text-red-700">
                    {error}
                </p>
            )}
            {booking && (
                <p>{booking.counterparty?.display_name}との予約について</p>
            )}
            {success ? (
                <p role="status">通報を受け付けました。運営が確認します。</p>
            ) : (
                <form
                    onSubmit={(e) => void submit(e)}
                    className="space-y-4 rounded-2xl border bg-white p-5 text-slate-900"
                >
                    <label className="block text-sm">
                        内容
                        <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="mt-2 block min-h-11 w-full rounded-lg border p-2"
                        >
                            <option value="safety_concern">安全上の不安</option>
                            <option value="boundary_violation">
                                対応範囲・境界の違反
                            </option>
                            <option value="prohibited_request">
                                禁止行為の要求
                            </option>
                            <option value="prohibited_contact_exchange">
                                連絡先交換の誘導
                            </option>
                            <option value="violence">暴力・威圧・脅し</option>
                            <option value="other">その他</option>
                        </select>
                    </label>
                    <label className="block text-sm">
                        緊急度
                        <select
                            value={severity}
                            onChange={(e) => setSeverity(e.target.value)}
                            className="mt-2 block min-h-11 rounded-lg border p-2"
                        >
                            <option value="medium">通常</option>
                            <option value="high">高い</option>
                            <option value="critical">緊急</option>
                        </select>
                    </label>
                    <label className="block text-sm">
                        詳しい状況
                        <textarea
                            required
                            maxLength={2000}
                            value={detail}
                            onChange={(e) => setDetail(e.target.value)}
                            className="mt-2 w-full rounded-lg border p-3"
                            rows={5}
                        />
                    </label>
                    <button
                        disabled={busy || !booking}
                        className="min-h-11 rounded-full bg-slate-900 px-5 py-3 text-white"
                    >
                        {busy ? '送信中…' : '通報する'}
                    </button>
                </form>
            )}
            {relationship && (
                <section className="rounded-2xl border bg-white p-5 text-slate-900">
                    <h2 className="font-semibold">この役割の相手をブロック</h2>
                    <p className="my-3 text-sm">
                        通報とブロックは別々に設定できます。ブロック前に、予約への影響を確認できます。
                    </p>
                    <RelationshipBlockButton
                        role={role}
                        relationshipId={relationship.public_id}
                        onChange={() => {}}
                    />
                </section>
            )}
        </div>
    );
}
