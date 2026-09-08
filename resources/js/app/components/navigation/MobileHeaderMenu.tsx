import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface MobileHeaderMenuProps {
    isOpen: boolean;
    onToggle: () => void;
    onClose: () => void;
    children: ReactNode;
}

export function MobileHeaderMenu({
    isOpen,
    onToggle,
    onClose,
    children,
}: MobileHeaderMenuProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const id = useId();

    useEffect(() => {
        const dialog = dialogRef.current;
        if (isOpen && !dialog?.open) dialog?.showModal();
        if (!isOpen && dialog?.open) dialog.close();
    }, [isOpen]);

    useEffect(() => {
        const desktop = window.matchMedia('(min-width: 768px)');
        const closeOnDesktop = () => {
            if (desktop.matches) onClose();
        };
        desktop.addEventListener('change', closeOnDesktop);
        return () => desktop.removeEventListener('change', closeOnDesktop);
    }, [onClose]);

    return (
        <>
            <button
                type="button"
                onClick={onToggle}
                aria-label="メニューを開く"
                aria-expanded={isOpen}
                aria-controls={id}
                aria-haspopup="dialog"
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e5c576] md:hidden"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                    className="h-6 w-6"
                >
                    <circle cx="5" cy="12" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="19" cy="12" r="2" />
                </svg>
            </button>
            {createPortal(
                <dialog
                    ref={dialogRef}
                    id={id}
                    aria-labelledby={`${id}-title`}
                    onCancel={onClose}
                    onClose={onClose}
                    onClick={(event) => {
                        if (event.target !== event.currentTarget) return;
                        const bounds =
                            event.currentTarget.getBoundingClientRect();
                        if (
                            event.clientX < bounds.left ||
                            event.clientX > bounds.right ||
                            event.clientY < bounds.top ||
                            event.clientY > bounds.bottom
                        )
                            onClose();
                    }}
                    className="fixed inset-x-4 bottom-auto top-4 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto overscroll-contain rounded-3xl border border-white/15 bg-[#17202b] p-4 text-white shadow-2xl backdrop:bg-black/50"
                >
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <h2 id={`${id}-title`} className="text-lg font-bold">
                            メニュー
                        </h2>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="メニューを閉じる"
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 hover:bg-white/10"
                        >
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                aria-hidden="true"
                                className="h-5 w-5"
                            >
                                <path d="m6 6 12 12M18 6 6 18" />
                            </svg>
                        </button>
                    </div>
                    <div
                        className="flex flex-col gap-3"
                        onClick={(event) => {
                            if (
                                event.target instanceof Element &&
                                event.target.closest('a')
                            )
                                onClose();
                        }}
                    >
                        {isOpen ? children : null}
                    </div>
                </dialog>,
                document.body,
            )}
        </>
    );
}
