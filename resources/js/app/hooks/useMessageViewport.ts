import { useLayoutEffect, useRef } from 'react';

/** Keep the conversation inside the visible screen, including above the iOS keyboard. */
export function useMessageViewport() {
    const ref = useRef<HTMLElement>(null);

    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;

        const root = document.documentElement;
        const viewport = window.visualViewport;
        let frame = 0;
        root.classList.add('message-viewport-active');

        const update = () => {
            // Let browser magnification pan normally; do not resize the UI during pinch zoom.
            if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
            element.style.setProperty('--message-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
            element.style.setProperty('--message-viewport-top', `${viewport?.offsetTop ?? 0}px`);
            root.style.setProperty('--mode-viewport-top', `${viewport?.offsetTop ?? 0}px`);
        };
        const scheduleUpdate = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(update);
        };

        update();
        viewport?.addEventListener('resize', scheduleUpdate);
        viewport?.addEventListener('scroll', scheduleUpdate);
        window.addEventListener('resize', scheduleUpdate);

        return () => {
            cancelAnimationFrame(frame);
            viewport?.removeEventListener('resize', scheduleUpdate);
            viewport?.removeEventListener('scroll', scheduleUpdate);
            window.removeEventListener('resize', scheduleUpdate);
            root.classList.remove('message-viewport-active');
            root.style.removeProperty('--mode-viewport-top');
            element.style.removeProperty('--message-viewport-height');
            element.style.removeProperty('--message-viewport-top');
        };
    }, []);

    return ref;
}
