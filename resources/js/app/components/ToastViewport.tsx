interface ToastItem {
    id: string;
    tone: 'success' | 'error';
    message: string;
}

interface ToastViewportProps {
    toasts: ToastItem[];
    onDismiss: (id: string) => void;
}

function toastToneClassName(tone: ToastItem['tone']): string {
    if (tone === 'success') {
        return 'border-emerald-400/30 bg-[#10231c] text-emerald-100';
    }

    return 'border-amber-300/35 bg-[#2b1f14] text-amber-100';
}

function toastLabel(tone: ToastItem['tone']): string {
    return tone === 'success' ? '完了' : 'エラー';
}

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
    return (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-[min(calc(100vw-2rem),24rem)] flex-col gap-3">
            {toasts.map((toast) => (
                <section
                    key={toast.id}
                    className={[
                        'pointer-events-auto rounded-[22px] border px-4 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur',
                        toastToneClassName(toast.tone),
                    ].join(' ')}
                    aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
                >
                    <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-xs font-semibold tracking-wide opacity-80">{toastLabel(toast.tone)}</p>
                            <p className="text-sm leading-6">{toast.message}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => onDismiss(toast.id)}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/10 text-sm font-semibold text-current transition hover:bg-black/20"
                            aria-label="通知を閉じる"
                        >
                            ×
                        </button>
                    </div>
                </section>
            ))}
        </div>
    );
}
