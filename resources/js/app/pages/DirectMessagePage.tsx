import { usePageTitle } from "../hooks/usePageTitle";
import {
    getDirectMessageDraft,
    setDirectMessageDraft,
} from "../lib/directMessageDrafts";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    Link,
    useNavigate,
    useParams,
    useSearchParams,
} from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { apiRequest } from "../lib/api";
import {
    dmBase,
    dmChanged,
    dmError,
    type DmMessage,
    type DmPage,
    type DmParticipant,
    type DmThread,
    type MessageRole,
} from "../lib/directMessages";
import { RelationshipBlockButton } from "../components/messages/RelationshipBlockButton";

function CounterpartyAvatar({ participant }: { participant: DmParticipant }) {
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const url = participant.avatar_url;

    return (
        <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#eadfd0] bg-[#f5efe4] text-[#8a6516]"
        >
            {url && url !== failedUrl ? (
                <img
                    src={url}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => setFailedUrl(url)}
                />
            ) : (
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-7 w-7"
                >
                    <circle cx="12" cy="8" r="3.5" />
                    <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
                </svg>
            )}
        </span>
    );
}

function PrivateImage({ url, token }: { url: string; token: string }) {
    const [blob, setBlob] = useState<string | null>(null);
    const [error, setError] = useState(false);
    useEffect(() => {
        const abort = new AbortController();
        let objectUrl: string | undefined;
        setBlob(null);
        setError(false);
        void fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
            credentials: "same-origin",
            signal: abort.signal,
        })
            .then(async (r) => {
                if (!r.ok) throw new Error("Image unavailable");
                const data = await r.blob();
                if (abort.signal.aborted) return;
                objectUrl = URL.createObjectURL(data);
                setBlob(objectUrl);
            })
            .catch(() => {
                if (!abort.signal.aborted) setError(true);
            });
        return () => {
            abort.abort();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [url, token]);
    return blob ? (
        <a href={blob} target="_blank" rel="noreferrer">
            <img
                src={blob}
                alt="送信された画像"
                className="max-h-80 max-w-full rounded-xl object-contain"
            />
        </a>
    ) : (
        <p className="text-sm">
            {error ? "画像を表示できません。" : "画像を読み込み中…"}
        </p>
    );
}

function MessageBubble({
    message,
    token,
    onRead,
    onDelete,
    onReport,
}: {
    message: DmMessage;
    token: string;
    onRead: (id: string) => void;
    onDelete: (m: DmMessage) => void;
    onReport: (m: DmMessage) => void;
}) {
    const element = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (
            !element.current ||
            message.is_own ||
            message.is_read ||
            message.is_deleted
        )
            return;
        let visible = false;
        let timer: number | undefined;
        const update = () => {
            clearTimeout(timer);
            if (visible && !document.hidden)
                timer = window.setTimeout(() => onRead(message.public_id), 500);
        };
        const observer = new IntersectionObserver(
            (entries) => {
                visible = entries.some(
                    (e) => e.isIntersecting && e.intersectionRatio >= 0.6,
                );
                update();
            },
            { threshold: 0.6 },
        );
        observer.observe(element.current);
        document.addEventListener("visibilitychange", update);
        return () => {
            clearTimeout(timer);
            observer.disconnect();
            document.removeEventListener("visibilitychange", update);
        };
    }, [
        message.public_id,
        message.is_own,
        message.is_read,
        message.is_deleted,
        onRead,
    ]);
    return (
        <div
            ref={element}
            data-dm-id={message.public_id}
            className={`flex ${message.is_own ? "justify-end" : "justify-start"}`}
        >
            <div
                className={`max-w-[88%] rounded-2xl px-4 py-3 ${message.is_own ? "bg-[#f3e5d1]" : "border border-[#eadfd0] bg-white"}`}
            >
                {message.is_deleted ? (
                    <p className="text-sm text-slate-500">
                        {message.message_type === "image"
                            ? "画像は削除されました"
                            : "メッセージは削除されました"}
                    </p>
                ) : message.image_url ? (
                    <PrivateImage url={message.image_url} token={token} />
                ) : (
                    <p className="whitespace-pre-wrap break-words text-sm leading-7">
                        {message.body}
                    </p>
                )}
                <p className="mt-2 text-xs text-slate-500">
                    {new Date(message.sent_at).toLocaleString("ja-JP")}
                    {message.is_own && message.is_read ? "・既読" : ""}
                </p>
                {message.is_own &&
                    message.message_type === "image" &&
                    !message.is_deleted && (
                        <button
                            type="button"
                            onClick={() => onDelete(message)}
                            className="mt-1 min-h-10 text-xs underline"
                        >
                            画像を削除
                        </button>
                    )}
                {!message.is_own && !message.is_deleted && (
                    <button
                        type="button"
                        onClick={() => onReport(message)}
                        className="mt-1 min-h-10 text-xs text-slate-500 underline"
                    >
                        通報
                    </button>
                )}
            </div>
        </div>
    );
}

export function DirectMessagePage({ role }: { role: MessageRole }) {
    usePageTitle("DM");
    const { publicId } = useParams();
    const [params] = useSearchParams();
    const targetId = params.get("therapist_id");
    const { account } = useAuth();
    // Mount a fresh conversation when the route, role, or login changes.
    return (
        <DirectMessageConversation
            key={`${account?.public_id}:${role}:${publicId ?? targetId}`}
            role={role}
            threadId={publicId}
            targetId={targetId}
        />
    );
}

function DirectMessageConversation({
    role,
    threadId,
    targetId,
}: {
    role: MessageRole;
    threadId?: string;
    targetId: string | null;
}) {
    const { token, account } = useAuth();
    const navigate = useNavigate();
    const [thread, setThread] = useState<DmThread | null>(null);
    const [draftParticipants, setDraftParticipants] = useState<{
        self: DmParticipant;
        counterparty: DmParticipant;
    } | null>(null);
    const [messages, setMessages] = useState<DmMessage[]>([]);
    const draftKey = `${account?.public_id}:${role}:${threadId ?? targetId}`;
    const [body, setBody] = useState(
        () => getDirectMessageDraft(draftKey)?.body ?? "",
    );
    const [file, setFile] = useState<File | null>(
        () => getDirectMessageDraft(draftKey)?.file ?? null,
    );
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [sendKey, setSendKey] = useState(
        () => getDirectMessageDraft(draftKey)?.sendKey ?? crypto.randomUUID(),
    );
    useEffect(() => {
        setDirectMessageDraft(draftKey, { body, file, sendKey });
    }, [draftKey, body, file, sendKey]);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [reportMessage, setReportMessage] = useState<
        DmMessage | "thread" | null
    >(null);
    const [reportDetail, setReportDetail] = useState("");
    const end = useRef<HTMLDivElement>(null);
    const latest = useRef(0);
    const reading = useRef(new Set<string>());
    const loadedMessages = useRef<DmMessage[]>([]);
    loadedMessages.current = messages;
    const alive = useRef(true);
    const loading = useRef(false);
    const typingAt = useRef(0);
    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);
    useEffect(() => {
        if (!file) {
            setImagePreview(null);
            return;
        }
        const url = URL.createObjectURL(file);
        setImagePreview(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);
    const refresh = useCallback(
        async (signal?: AbortSignal, before?: number) => {
            if (!token || !threadId || loading.current) return;
            loading.current = true;
            try {
                const query = before
                    ? `?before=${before}`
                    : latest.current
                      ? `?after=${latest.current}`
                      : "";
                const page = await apiRequest<DmPage>(
                    `${dmBase(role)}/${threadId}${query}`,
                    { token, signal },
                );
                if (!alive.current || signal?.aborted) return;
                setThread(page.meta.thread);
                setMessages((old) => {
                    const map = new Map(old.map((m) => [m.public_id, m]));
                    for (const m of page.data) map.set(m.public_id, m);
                    return [...map.values()].sort(
                        (a, b) => a.cursor - b.cursor,
                    );
                });
                if (!latest.current || before) setHasMore(page.meta.has_more);
                if (!before)
                    latest.current = Math.max(
                        latest.current,
                        page.meta.latest_cursor ?? 0,
                    );
                // Refresh visible existing messages so read/deleted state changes propagate too.
                if (query && !before) {
                    const visibleIds = loadedMessages.current
                        .filter(
                            (m) =>
                                document
                                    .querySelector(
                                        `[data-dm-id="${m.public_id}"]`,
                                    )
                                    ?.getBoundingClientRect().bottom! > 0 &&
                                document
                                    .querySelector(
                                        `[data-dm-id="${m.public_id}"]`,
                                    )
                                    ?.getBoundingClientRect().top! <
                                    window.innerHeight,
                        )
                        .map((m) => m.public_id)
                        .slice(0, 50);
                    if (visibleIds.length) {
                        const recent = await apiRequest<{ data: DmMessage[] }>(
                            `${dmBase(role)}/${threadId}/states`,
                            {
                                token,
                                signal,
                                method: "POST",
                                body: { message_ids: visibleIds },
                            },
                        );
                        if (alive.current && !signal?.aborted)
                            setMessages((old) => {
                                const updates = new Map(
                                    recent.data.map((m) => [m.public_id, m]),
                                );
                                return old.map(
                                    (m) => updates.get(m.public_id) ?? m,
                                );
                            });
                    }
                }
            } catch (e) {
                if (alive.current && !signal?.aborted) setError(dmError(e));
            } finally {
                loading.current = false;
            }
        },
        [token, role, threadId],
    );
    useEffect(() => {
        if (!token) return;
        const abort = new AbortController();
        if (threadId) void refresh(abort.signal);
        else if (targetId && role === "user")
            void apiRequest<{
                data: {
                    thread_id: string | null;
                    self: DmParticipant;
                    counterparty: DmParticipant;
                };
            }>(
                `${dmBase(role)}/draft?therapist_id=${encodeURIComponent(targetId)}`,
                { token, signal: abort.signal },
            )
                .then((r) => {
                    if (abort.signal.aborted) return;
                    if (r.data.thread_id)
                        navigate(`${dmBase(role)}/${r.data.thread_id}`, {
                            replace: true,
                        });
                    else setDraftParticipants(r.data);
                })
                .catch((e) => {
                    if (!abort.signal.aborted) setError(dmError(e));
                });
        const timer = setInterval(() => {
            if (!document.hidden) void refresh(abort.signal);
        }, 5000);
        return () => {
            abort.abort();
            clearInterval(timer);
        };
    }, [token, role, threadId, targetId, refresh, navigate]);
    const markRead = useCallback(
        (id: string) => {
            if (!token || !threadId || reading.current.has(id)) return;
            reading.current.add(id);
            void apiRequest(`${dmBase(role)}/${threadId}/read`, {
                token,
                method: "POST",
                body: { message_ids: [id] },
            })
                .then(() => {
                    if (alive.current) {
                        setMessages((old) =>
                            old.map((m) =>
                                m.public_id === id
                                    ? { ...m, is_read: true }
                                    : m,
                            ),
                        );
                        dmChanged();
                    }
                })
                .catch(() => {})
                .finally(() => reading.current.delete(id));
        },
        [token, threadId, role],
    );
    async function send() {
        if (!token || busy || (!body.trim() && !file)) return;
        setBusy(true);
        setError("");
        const form = new FormData();
        form.set("client_message_id", sendKey);
        if (file) form.set("image", file);
        else form.set("body", body.trim());
        if (!threadId && targetId)
            form.set("target_therapist_profile_id", targetId);
        try {
            const sent = await apiRequest<{
                data: { thread: DmThread; message: DmMessage };
            }>(
                threadId
                    ? `${dmBase(role)}/${threadId}/messages`
                    : dmBase(role),
                { token, method: "POST", body: form },
            );
            if (!alive.current) return;
            setDirectMessageDraft(draftKey, {
                body: "",
                file: null,
                sendKey: "",
            });
            setBody("");
            setFile(null);
            setSendKey(crypto.randomUUID());
            dmChanged();
            if (!threadId)
                navigate(`${dmBase(role)}/${sent.data.thread.public_id}`, {
                    replace: true,
                });
            else {
                setThread(sent.data.thread);
                await refresh();
                end.current?.scrollIntoView({ behavior: "smooth" });
            }
        } catch (e) {
            if (alive.current) setError(dmError(e));
        } finally {
            if (alive.current) setBusy(false);
        }
    }
    async function preferences(change: Partial<DmThread["preferences"]>) {
        if (!threadId) return;
        try {
            const r = await apiRequest<{ data: DmThread }>(
                `${dmBase(role)}/${threadId}/preferences`,
                { token, method: "PATCH", body: change },
            );
            if (alive.current) setThread(r.data);
        } catch (e) {
            setError(dmError(e));
        }
    }
    async function removeImage(m: DmMessage) {
        if (
            !window.confirm(
                "この画像を削除しますか？相手からも表示できなくなります。",
            )
        )
            return;
        try {
            const r = await apiRequest<{ data: DmMessage }>(
                `${dmBase(role)}/${threadId}/messages/${m.public_id}/image`,
                { token, method: "DELETE" },
            );
            if (alive.current)
                setMessages((old) =>
                    old.map((x) => (x.public_id === m.public_id ? r.data : x)),
                );
        } catch (e) {
            setError(dmError(e));
        }
    }
    async function report() {
        if (!threadId || !reportDetail.trim()) return;
        setBusy(true);
        try {
            await apiRequest(`${dmBase(role)}/${threadId}/reports`, {
                token,
                method: "POST",
                body: {
                    category: "safety_concern",
                    detail: reportDetail.trim(),
                    message_id:
                        reportMessage !== "thread"
                            ? reportMessage?.public_id
                            : undefined,
                },
            });
            if (alive.current) {
                setReportMessage(null);
                setReportDetail("");
            }
        } catch (e) {
            setError(dmError(e));
        } finally {
            if (alive.current) setBusy(false);
        }
    }
    const participants = thread ?? draftParticipants;
    if (!token) return null;
    return (
        <section className="mx-auto max-w-3xl space-y-4 text-slate-900">
            <Link
                to={`/${role}/messages?tab=dm`}
                className="inline-flex min-h-11 items-center text-sm text-white underline"
            >
                DM一覧へ
            </Link>
            <header className="rounded-2xl border border-[#eadfd0] bg-white p-5">
                <p className="text-xs font-semibold text-[#8a6516]">
                    {role === "user"
                        ? "利用者として送信"
                        : "タチキャストとして返信"}
                </p>
                <div className="mt-3 flex items-center gap-3">
                    {participants && (
                        <CounterpartyAvatar participant={participants.counterparty} />
                    )}
                    <h1 className="min-w-0 break-words text-xl font-semibold">
                        {participants
                            ? `${participants.counterparty.display_name}とのDM`
                            : "DMを読み込み中…"}
                    </h1>
                </div>
                {participants && (
                    <div className="mt-3 flex items-center gap-2 text-sm">
                        {participants.self.avatar_url && (
                            <img
                                src={participants.self.avatar_url}
                                alt=""
                                className="h-8 w-8 rounded-full object-cover"
                            />
                        )}
                        <span>
                            送信するプロフィール：
                            {participants.self.display_name}
                        </span>
                    </div>
                )}
                {role === "user" && participants?.counterparty.profile_url && (
                    <Link
                        to={participants.counterparty.profile_url}
                        className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[#17202b] px-5 text-sm text-white"
                    >
                        予約する
                    </Link>
                )}
                <p className="mt-3 text-xs text-slate-500">
                    予約の連絡は予約ごとのチャットをご利用ください。DM本文・画像は送信から1年間保存されます。
                </p>
            </header>
            {thread && (
                <div className="flex flex-wrap items-center gap-4 rounded-xl bg-white p-4 text-sm">
                    <button
                        onClick={() =>
                            void preferences({
                                muted: !thread.preferences.muted,
                            })
                        }
                        className="min-h-11 underline"
                    >
                        {thread.preferences.muted
                            ? "通知を再開"
                            : "このDMをミュート"}
                    </button>
                    <button
                        onClick={() =>
                            void preferences({
                                archived: !thread.preferences.archived,
                            })
                        }
                        className="min-h-11 underline"
                    >
                        {thread.preferences.archived
                            ? "アーカイブ解除"
                            : "アーカイブ"}
                    </button>
                    <button
                        onClick={() =>
                            void preferences({
                                paused: !thread.preferences.paused,
                            })
                        }
                        className="min-h-11 underline"
                    >
                        {thread.preferences.paused
                            ? "DMを再開"
                            : "このDMを停止"}
                    </button>
                    <RelationshipBlockButton
                        role={role}
                        relationshipId={thread.relationship_id}
                        onChange={() => {
                            void refresh();
                            dmChanged();
                        }}
                    />
                    <button
                        onClick={() => setReportMessage("thread")}
                        className="min-h-11 underline"
                    >
                        運営へ通報
                    </button>
                </div>
            )}
            {error && (
                <p
                    role="alert"
                    className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
                >
                    {error}
                </p>
            )}
            <div className="space-y-4 rounded-2xl bg-[#faf7f2] p-4">
                {hasMore && (
                    <button
                        className="min-h-11 underline"
                        onClick={() =>
                            void refresh(undefined, messages[0]?.cursor)
                        }
                    >
                        以前のメッセージを表示
                    </button>
                )}
                {!messages.length && participants && (
                    <p className="py-6 text-center text-sm text-slate-500">
                        質問を送って会話を始めましょう。
                    </p>
                )}
                {messages.map((m) => (
                    <MessageBubble
                        key={m.public_id}
                        message={m}
                        token={token}
                        onRead={markRead}
                        onDelete={(m) => void removeImage(m)}
                        onReport={setReportMessage}
                    />
                ))}
                {thread?.typing && (
                    <p className="text-xs text-slate-500">相手が入力中…</p>
                )}
                <div ref={end} />
            </div>
            {thread && !thread.can_send ? (
                <p className="rounded-xl bg-slate-100 p-4 text-sm">
                    現在このDMには送信できません。予約の確認や運営への相談は引き続きご利用いただけます。
                </p>
            ) : (
                participants && (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            void send();
                        }}
                        className="space-y-3 rounded-2xl border bg-white p-4"
                    >
                        <p className="text-xs font-semibold">
                            {role === "user" ? "利用者" : "タチキャスト"}「
                            {participants.self.display_name}」として送信
                        </p>
                        <label className="block text-sm">
                            メッセージ
                            <textarea
                                rows={3}
                                maxLength={1000}
                                disabled={busy || !!file}
                                value={body}
                                onChange={(e) => {
                                    setBody(e.target.value);
                                    setSendKey(crypto.randomUUID());
                                    if (
                                        threadId &&
                                        Date.now() - typingAt.current > 3000
                                    ) {
                                        typingAt.current = Date.now();
                                        void apiRequest(
                                            `${dmBase(role)}/${threadId}/typing`,
                                            {
                                                token,
                                                method: "POST",
                                                body: {
                                                    is_typing: !!e.target.value,
                                                },
                                            },
                                        ).catch(() => {});
                                    }
                                }}
                                placeholder="予約前に確認したいことなど"
                                className="mt-2 w-full rounded-xl border p-3"
                            />
                        </label>
                        {imagePreview && (
                            <div>
                                <img
                                    src={imagePreview}
                                    alt="送信前の画像プレビュー"
                                    className="max-h-48 rounded-xl"
                                />
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                        setFile(null);
                                        setSendKey(crypto.randomUUID());
                                    }}
                                    className="min-h-11 text-sm underline"
                                >
                                    画像を外す
                                </button>
                            </div>
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <label className="min-h-11 cursor-pointer rounded-full border px-4 py-3 text-sm">
                                画像を選ぶ
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    disabled={busy || !!body.trim()}
                                    className="sr-only"
                                    onChange={(e) => {
                                        const selected = e.target.files?.[0];
                                        if (
                                            selected &&
                                            selected.size > 10 * 1024 * 1024
                                        ) {
                                            setError(
                                                "画像は10MB以下にしてください。",
                                            );
                                            return;
                                        }
                                        setFile(selected ?? null);
                                        setSendKey(crypto.randomUUID());
                                        e.target.value = "";
                                    }}
                                />
                            </label>
                            <button
                                type="submit"
                                disabled={busy || (!body.trim() && !file)}
                                className="min-h-11 rounded-full bg-[#17202b] px-7 py-3 text-sm text-white disabled:opacity-50"
                            >
                                {busy ? "送信中…" : "送信する"}
                            </button>
                        </div>
                        <p className="text-xs text-slate-500">
                            画像は1枚10MBまで。文章と画像は別々に送信できます。
                        </p>
                    </form>
                )
            )}
            {reportMessage && (
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void report();
                    }}
                    className="rounded-2xl border bg-white p-5"
                >
                    <h2 className="font-semibold">運営へ通報</h2>
                    <label className="mt-3 block text-sm">
                        内容
                        <textarea
                            required
                            maxLength={2000}
                            value={reportDetail}
                            onChange={(e) => setReportDetail(e.target.value)}
                            className="mt-2 w-full rounded-lg border p-3"
                        />
                    </label>
                    <p className="my-2 text-xs">
                        対象の原文・画像は対応のため運営が保全します。通報だけではブロックされません。
                    </p>
                    <button
                        disabled={busy}
                        className="min-h-11 rounded-full bg-slate-900 px-5 text-white"
                    >
                        通報する
                    </button>
                    <button
                        type="button"
                        className="min-h-11 px-4"
                        onClick={() => setReportMessage(null)}
                    >
                        戻る
                    </button>
                </form>
            )}
        </section>
    );
}
