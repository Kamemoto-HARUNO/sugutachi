import { ConversationActionIcon } from "./ConversationActionIcon";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { apiRequest } from "../../lib/api";
import {
    dmError,
    type DmParticipant,
    type MessageRole,
} from "../../lib/directMessages";
import { RelationshipBlockButton } from "./RelationshipBlockButton";
export function RoleBlocks({ role }: { role: MessageRole }) {
    const { token } = useAuth();
    const counterpartyLabel = role === "user" ? "タチキャスト" : "利用者";
    const [rows, setRows] = useState<
        { public_id: string; counterparty: DmParticipant }[]
    >([]);
    const [page, setPage] = useState<number | null>(null);
    const [error, setError] = useState("");
    const load = useCallback(
        async (signal?: AbortSignal, next?: number) => {
            try {
                const r = await apiRequest<{
                    data: typeof rows;
                    meta: { next_page: number | null };
                }>(`/${role}/relationships?page=${next ?? 1}`, {
                    token,
                    signal,
                });
                if (!signal?.aborted) {
                    setRows((old) => (next ? [...old, ...r.data] : r.data));
                    setPage(r.meta.next_page);
                }
            } catch (e) {
                if (!signal?.aborted) setError(dmError(e));
            }
        },
        [role, token],
    );
    useEffect(() => {
        const c = new AbortController();
        void load(c.signal);
        return () => c.abort();
    }, [load]);
    return (
        <details className="group rounded-2xl border border-slate-200 bg-white">
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b5894d] [&::-webkit-details-marker]:hidden">
                <span className="text-slate-500">
                    <ConversationActionIcon kind="block" />
                </span>
                <span className="min-w-0 flex-1">
                    ブロックしている{counterpartyLabel}
                </span>
                <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                >
                    <path d="m6 9 6 6 6-6" />
                </svg>
            </summary>
            <div className="mx-4 border-t border-[#efe5d7] py-3">
                {error && (
                    <p role="alert" className="text-xs leading-5 text-red-700">
                        {error}
                    </p>
                )}
                {!error && rows.length === 0 && (
                    <p className="py-1 text-xs leading-5 text-[#68707a]">
                        ブロックしている{counterpartyLabel}はいません。
                    </p>
                )}
                {rows.map((r) => (
                    <div
                        key={r.public_id}
                        className="flex items-center gap-3 py-2"
                    >
                        <span
                            aria-hidden="true"
                            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f3e5d1] text-sm font-semibold text-[#6f4b26]"
                        >
                            {r.counterparty.avatar_url ? (
                                <img
                                    src={r.counterparty.avatar_url}
                                    alt=""
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                r.counterparty.display_name.slice(0, 1)
                            )}
                        </span>
                        <span className="min-w-0 flex-1 break-words text-sm font-semibold text-[#17202b]">
                            {r.counterparty.display_name}
                        </span>
                        <RelationshipBlockButton
                            role={role}
                            relationshipId={r.public_id}
                            onChange={() => void load()}
                            className="min-h-10 shrink-0 rounded-full border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                        >
                            解除
                        </RelationshipBlockButton>
                    </div>
                ))}
                {page && (
                    <button
                        className="mt-2 min-h-10 w-full rounded-full bg-slate-50 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                        onClick={() => void load(undefined, page)}
                    >
                        さらに表示
                    </button>
                )}
            </div>
        </details>
    );
}
