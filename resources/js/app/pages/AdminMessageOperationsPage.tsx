import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { apiRequest } from "../lib/api";
import { dmError } from "../lib/directMessages";
interface Action {
    id: number;
    booking_id: string;
    booking_status: string;
    status: string;
    attempts: number;
}
export function AdminMessageOperationsPage() {
    const { token } = useAuth();
    const [rows, setRows] = useState<Action[]>([]);
    const [meta, setMeta] = useState({
        failed_notifications: 0,
        evidence_reviews_due: 0,
    });
    const [error, setError] = useState("");
    const [selected, setSelected] = useState<Action | null>(null);
    const [decision, setDecision] = useState("retry");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const load = useCallback(
        async (signal?: AbortSignal) => {
            try {
                const r = await apiRequest<{
                    data: Action[];
                    meta: typeof meta;
                }>("/admin/message-operations", { token, signal });
                if (!signal?.aborted) {
                    setRows(r.data);
                    setMeta(r.meta);
                }
            } catch (e) {
                if (!signal?.aborted) setError(dmError(e));
            }
        },
        [token],
    );
    useEffect(() => {
        const c = new AbortController();
        void load(c.signal);
        return () => c.abort();
    }, [load]);
    async function resolve() {
        if (!selected) return;
        setBusy(true);
        setError("");
        try {
            await apiRequest(
                `/admin/message-operations/${selected.booking_id}`,
                { token, method: "POST", body: { decision, note } },
            );
            setSelected(null);
            setNote("");
            await load();
        } catch (e) {
            setError(dmError(e));
        } finally {
            setBusy(false);
        }
    }
    return (
        <section className="space-y-5 text-white">
            <h1 className="text-2xl font-semibold">DM・ブロックの運営確認</h1>
            <p>
                通知の再送上限到達：{meta.failed_notifications}件 ／
                証拠の保全確認期限：{meta.evidence_reviews_due}件
            </p>
            <Link className="underline" to="/admin/reports">
                通報の確認へ
            </Link>
            {error && (
                <p role="alert" className="text-red-300">
                    {error}
                </p>
            )}
            <button
                className="block min-h-11 underline"
                onClick={() => void load()}
            >
                更新する
            </button>
            {!rows.length && <p>確認待ちの予約はありません。</p>}
            {rows.map((r) => (
                <article
                    key={r.id}
                    className="rounded-xl border border-white/20 p-4"
                >
                    <Link
                        to={`/admin/bookings/${r.booking_id}`}
                        className="underline"
                    >
                        予約 {r.booking_id}
                    </Link>
                    <p className="my-2">
                        予約：{r.booking_status} ／ 精算：{r.status} ／ 試行：
                        {r.attempts}回
                    </p>
                    {r.status === "review" && (
                        <button
                            className="min-h-11 underline"
                            onClick={() => {
                                setSelected(r);
                                setDecision(
                                    [
                                        "canceled",
                                        "rejected",
                                        "payment_canceled",
                                    ].includes(r.booking_status)
                                        ? "retry"
                                        : "refund",
                                );
                                setNote("");
                            }}
                        >
                            精算方針を確認する
                        </button>
                    )}
                </article>
            ))}
            {selected && (
                <form
                    className="space-y-4 rounded-xl bg-slate-800 p-5"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void resolve();
                    }}
                >
                    <h2>予約 {selected.booking_id} の精算確認</h2>
                    <p className="text-sm">
                        Stripeの決済・返金履歴を確認してから実行してください。処理結果が不明な返金は新しく作り直さず、既存の返金番号で照合します。
                    </p>
                    <label className="block">
                        方針
                        <select
                            className="ml-3 rounded bg-slate-900 p-3"
                            value={decision}
                            onChange={(e) => setDecision(e.target.value)}
                        >
                            {[
                                "canceled",
                                "rejected",
                                "payment_canceled",
                            ].includes(selected.booking_status) ? (
                                <option value="retry">
                                    取消・返金を再確認する
                                </option>
                            ) : (
                                <>
                                    <option value="refund">
                                        予約をキャンセルして全額返金する
                                    </option>
                                    <option value="release">
                                        精算の保留を解除し、通常の完了確認へ戻す
                                    </option>
                                </>
                            )}
                        </select>
                    </label>
                    <label className="block">
                        判断理由
                        <textarea
                            required
                            minLength={5}
                            maxLength={2000}
                            className="mt-2 block w-full rounded bg-slate-900 p-3"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </label>
                    <button
                        disabled={busy}
                        className="min-h-11 rounded bg-white px-5 text-slate-900"
                    >
                        {busy ? "処理中…" : "この方針で実行する"}
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => setSelected(null)}
                        className="min-h-11 px-5"
                    >
                        戻る
                    </button>
                </form>
            )}
        </section>
    );
}
