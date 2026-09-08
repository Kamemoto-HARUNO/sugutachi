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
        <details className="rounded-xl border p-4">
            <summary className="cursor-pointer">
                この役割でブロックしている相手
            </summary>
            {error && <p role="alert">{error}</p>}
            {rows.length === 0 && (
                <p className="mt-3 text-sm">ブロックしている相手はいません。</p>
            )}
            {rows.map((r) => (
                <div
                    key={r.public_id}
                    className="mt-3 flex items-center justify-between gap-3"
                >
                    <span>{r.counterparty.display_name}</span>
                    <RelationshipBlockButton
                        role={role}
                        relationshipId={r.public_id}
                        onChange={() => void load()}
                    />
                </div>
            ))}
            {page && (
                <button
                    className="min-h-11 underline"
                    onClick={() => void load(undefined, page)}
                >
                    さらに表示
                </button>
            )}
        </details>
    );
}
