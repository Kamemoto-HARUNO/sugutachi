import { useEffect, useRef, type HTMLAttributes } from 'react';

// Read only after the received message is visible in the foreground for 500ms.
export function ReadVisibleMessage({ unread, onRead, ...props }: HTMLAttributes<HTMLElement> & {
    unread: boolean;
    onRead: () => Promise<boolean>;
}) {
    const element = useRef<HTMLElement>(null);
    const callback = useRef(onRead);
    callback.current = onRead;
    useEffect(() => {
        if (!unread || !element.current) return;
        let visible = false;
        let busy = false;
        let stopped = false;
        let timer: number | undefined;
        const update = () => {
            window.clearTimeout(timer);
            if (!visible || document.hidden || busy || stopped) return;
            timer = window.setTimeout(async () => {
                busy = true;
                const read = await callback.current();
                busy = false;
                if (!read && !stopped) timer = window.setTimeout(update, 5000);
            }, 500);
        };
        const observer = new IntersectionObserver(([entry]) => {
            // Tall image messages need not fit entirely in the viewport.
            const required = Math.min(entry.boundingClientRect.height, entry.rootBounds?.height ?? innerHeight) * 0.6;
            visible = entry.isIntersecting && entry.intersectionRect.height >= required;
            update();
        }, { threshold: Array.from({ length: 11 }, (_, i) => i / 10) });
        observer.observe(element.current);
        document.addEventListener('visibilitychange', update);
        return () => {
            stopped = true;
            observer.disconnect();
            window.clearTimeout(timer);
            document.removeEventListener('visibilitychange', update);
        };
    }, [unread]);
    return <article ref={element} {...props} />;
}
