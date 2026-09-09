import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../../hooks/useAuth";
import { apiRequest } from "../../lib/api";
import {
    dmError,
    loadRelationship,
    type MessageRole,
    type RelationshipPreview,
} from "../../lib/directMessages";

export function RelationshipBlockButton({
    role,
    relationshipId,
    onChange,
    className,
    children,
}: {
    role: MessageRole;
    relationshipId: string;
    onChange: () => void;
    className?: string;
    children?: ReactNode;
}) {
    const { token } = useAuth();
    const dialog = useRef<HTMLDialogElement>(null);
    const [preview, setPreview] = useState<RelationshipPreview | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (preview && !dialog.current?.open) dialog.current?.showModal();
    }, [preview]);
    async function open() {
        if (!token) return;
        setBusy(true);
        setError("");
        try {
            setPreview(
                (await loadRelationship(token, role, relationshipId)).data,
            );
        } catch (e) {
            setError(dmError(e));
        } finally {
            setBusy(false);
        }
    }
    async function confirm() {
        if (!token || !preview) return;
        setBusy(true);
        setError("");
        try {
            await apiRequest(`/${role}/relationships/${relationshipId}/block`, {
                token,
                method: preview.blocked_by_me ? "DELETE" : "POST",
                body: preview.blocked_by_me ? undefined : { confirm: true },
            });
            setPreview(null);
            onChange();
        } catch (e) {
            setError(dmError(e));
        } finally {
            setBusy(false);
        }
    }
    return (
        <div>
            <button
                type="button"
                disabled={busy}
                onClick={() => void open()}
                className={className ?? "min-h-11 text-sm underline"}
            >
                {children ?? "ブロック設定"}
            </button>
            {error && (
                <p role="alert" className="text-sm text-red-700">
                    {error}
                </p>
            )}
            {preview && (
                <dialog
                    ref={dialog}
                    onCancel={(e) => {
                        if (busy) e.preventDefault();
                        else setPreview(null);
                    }}
                    aria-label="ブロックの確認"
                    className="m-auto max-w-lg rounded-2xl p-0 backdrop:bg-black/60"
                >
                    <div className="max-h-[90dvh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 text-slate-900">
                        <h2 className="text-lg font-semibold">
                            {preview.blocked_by_me
                                ? "この役割のブロックを解除しますか？"
                                : "この相手をブロックしますか？"}
                        </h2>
                        <p className="my-3 text-sm">
                            {preview.blocked_by_me
                                ? "予約は復活しません。既存のブロック設定がある場合、その制限は残ります。"
                                : "この役割の相手とのDM・予約チャットの送信と、新しい予約を停止します。逆の役割には影響しません。"}
                        </p>
                        {!preview.blocked_by_me &&
                            preview.affected_bookings.map((b) => (
                                <div
                                    key={b.public_id}
                                    className="my-2 rounded-lg bg-slate-50 p-3 text-sm"
                                >
                                    <p>
                                        {b.scheduled_start_at
                                            ? new Date(
                                                  b.scheduled_start_at,
                                              ).toLocaleString("ja-JP")
                                            : "今すぐ予約"}
                                    </p>
                                    <p>
                                        {b.requires_review
                                            ? "開始後・確認中のため、運営が精算を確認します。"
                                            : `予約をキャンセルし、利用者負担は0円になります（予約額 ${b.paid_amount_estimate.toLocaleString()}円）。`}
                                    </p>
                                </div>
                            ))}
                        {!preview.blocked_by_me && role === "user" && (
                            <p className="text-sm">
                                予約をキャンセルする場合は予約詳細からお手続きください。利用者側のキャンセル条件が適用されます。
                            </p>
                        )}
                        <div className="mt-5 flex flex-wrap gap-3">
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => void confirm()}
                                className="min-h-11 rounded-full bg-slate-900 px-5 py-2 text-white"
                            >
                                {busy
                                    ? "処理中…"
                                    : preview.blocked_by_me
                                      ? "ブロックを解除する"
                                      : preview.affected_bookings.some(
                                              (b) => !b.requires_review,
                                          )
                                        ? "ブロックして予約をキャンセルする"
                                        : preview.affected_bookings.length
                                          ? "ブロックして運営に相談する"
                                          : "ブロックする"}
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => setPreview(null)}
                                className="min-h-11 px-3"
                            >
                                戻る
                            </button>
                        </div>
                    </div>
                </dialog>
            )}
        </div>
    );
}
