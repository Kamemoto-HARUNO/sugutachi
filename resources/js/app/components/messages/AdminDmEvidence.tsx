import { useEffect, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { apiRequest } from "../../lib/api";
import { dmError } from "../../lib/directMessages";
export function AdminDmEvidence({ reportId }: { reportId: string }) {
    const { token } = useAuth();
    const [body, setBody] = useState<string | null>(null);
    const [image, setImage] = useState<string | null>(null);
    const [opened, setOpened] = useState(false);
    const [error, setError] = useState("");
    const [note, setNote] = useState("");
    useEffect(() => {
        if (!opened || !token) return;
        const c = new AbortController();
        let url: string | undefined;
        void apiRequest<{ data: { body: string | null; has_image: boolean } }>(
            `/admin/reports/${reportId}/dm-evidence`,
            { token, signal: c.signal },
        )
            .then(async (r) => {
                if (c.signal.aborted) return;
                setBody(r.data.body);
                if (r.data.has_image) {
                    const res = await fetch(
                        `/api/admin/reports/${reportId}/dm-evidence?image=1`,
                        {
                            headers: { Authorization: `Bearer ${token}` },
                            signal: c.signal,
                        },
                    );
                    if (!res.ok) throw new Error("画像を取得できません。");
                    const blob = await res.blob();
                    if (c.signal.aborted) return;
                    url = URL.createObjectURL(blob);
                    setImage(url);
                }
            })
            .catch((e) => {
                if (!c.signal.aborted) setError(dmError(e));
            });
        return () => {
            c.abort();
            if (url) URL.revokeObjectURL(url);
        };
    }, [opened, token, reportId]);
    async function retain() {
        try {
            await apiRequest(`/admin/reports/${reportId}/dm-evidence/retain`, {
                token,
                method: "POST",
                body: { note },
            });
            setNote("");
            setError("保全理由を記録しました。");
        } catch (e) {
            setError(dmError(e));
        }
    }
    return (
        <article className="mt-4 space-y-3 rounded-xl bg-slate-900 p-5">
            <h3>DM通報の証拠</h3>
            <p className="text-sm">
                証拠の閲覧と保全操作は監査記録に残ります。
            </p>
            {!opened ? (
                <button
                    onClick={() => setOpened(true)}
                    className="min-h-11 underline"
                >
                    証拠を開く
                </button>
            ) : (
                <>
                    <p className="whitespace-pre-wrap">{body}</p>
                    {image && (
                        <img
                            src={image}
                            alt="保全された通報画像"
                            className="max-h-80 object-contain"
                        />
                    )}
                </>
            )}
            {error && <p role="status">{error}</p>}
            <label className="block text-sm">
                保全を継続する理由
                <textarea
                    minLength={5}
                    maxLength={2000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="mt-2 block w-full rounded bg-slate-800 p-3"
                />
            </label>
            <button
                disabled={note.trim().length < 5}
                onClick={() => void retain()}
                className="min-h-11 underline disabled:opacity-40"
            >
                保全理由を記録する
            </button>
        </article>
    );
}
