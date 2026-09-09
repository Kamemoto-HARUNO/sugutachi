import {
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react';
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
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLElement>(null);
    const id = useId();
    const [position, setPosition] = useState<{
        left: number;
        top: number;
        width: number;
        maxHeight: number;
    } | null>(null);

    useLayoutEffect(() => {
        if (!isOpen) return;
        const positionBelowTrigger = () => {
            const trigger = triggerRef.current;
            if (!trigger) return;
            const rect = trigger.getBoundingClientRect();
            const width = Math.min(288, window.innerWidth - 32);
            const top = rect.bottom + 8;
            const maxHeight = window.innerHeight - top - 16;
            if (
                window.innerWidth >= 768 ||
                rect.bottom <= 0 ||
                maxHeight < 44
            ) {
                onClose();
                return;
            }
            const next = {
                left: Math.max(
                    16,
                    Math.min(
                        rect.right - width,
                        window.innerWidth - width - 16,
                    ),
                ),
                top,
                width,
                maxHeight,
            };
            setPosition((current) =>
                current &&
                Object.keys(next).every(
                    (key) =>
                        current[key as keyof typeof next] ===
                        next[key as keyof typeof next],
                )
                    ? current
                    : next,
            );
        };
        positionBelowTrigger();
        window.addEventListener('resize', positionBelowTrigger);
        window.addEventListener('scroll', positionBelowTrigger, true);
        return () => {
            window.removeEventListener('resize', positionBelowTrigger);
            window.removeEventListener('scroll', positionBelowTrigger, true);
        };
    }, [isOpen, onClose]);

    useEffect(() => {
        if (!isOpen) return;
        const focusFrame = window.requestAnimationFrame(() => {
            panelRef.current
                ?.querySelector<HTMLElement>('a, button')
                ?.focus({ preventScroll: true });
        });
        const isInside = (target: EventTarget | null) =>
            target instanceof Node &&
            (triggerRef.current?.contains(target) ||
                panelRef.current?.contains(target));
        const dismissOutside = (event: PointerEvent | FocusEvent) => {
            if (!isInside(event.target)) onClose();
        };
        const dismissOnEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            onClose();
            triggerRef.current?.focus({ preventScroll: true });
        };
        document.addEventListener('pointerdown', dismissOutside);
        document.addEventListener('focusin', dismissOutside);
        document.addEventListener('keydown', dismissOnEscape);
        return () => {
            window.cancelAnimationFrame(focusFrame);
            document.removeEventListener('pointerdown', dismissOutside);
            document.removeEventListener('focusin', dismissOutside);
            document.removeEventListener('keydown', dismissOnEscape);
        };
    }, [isOpen, onClose]);

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={onToggle}
                aria-label={isOpen ? 'メニューを閉じる' : 'メニューを開く'}
                aria-expanded={isOpen}
                aria-controls={id}
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e5c576] md:hidden"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                    className="h-6 w-6"
                >
                    <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
            </button>
            {isOpen &&
                createPortal(
                    <nav
                        ref={panelRef}
                        id={id}
                        aria-label="ヘッダーメニュー"
                        style={{
                            ...position,
                            visibility: position ? 'visible' : 'hidden',
                        }}
                        className="fixed z-[100] flex flex-col gap-3 overflow-y-auto overscroll-contain rounded-2xl border border-white/15 bg-[#17202b] p-3 text-white shadow-[0_12px_32px_rgba(0,0,0,0.3)]"
                        onClick={(event) => {
                            if (
                                event.target instanceof Element &&
                                event.target.closest('a')
                            )
                                onClose();
                        }}
                    >
                        {children}
                    </nav>,
                    document.body,
                )}
        </>
    );
}
