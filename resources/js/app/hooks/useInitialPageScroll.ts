import { useLayoutEffect } from 'react';

/** Start a newly opened document at the top, without taking over history navigation. */
export function useInitialPageScroll() {
    useLayoutEffect(() => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        // Keep native history restoration and explicit section links intact.
        if (navigation?.type === 'back_forward' || window.location.hash) return;

        const initialUrl = window.location.href;
        let stopped = false;
        let frame = 0;
        let timer = 0;
        const interactionEvents = ['pointerdown', 'touchstart', 'wheel', 'keydown', 'focusin'] as const;

        const stop = () => {
            stopped = true;
            cancelAnimationFrame(frame);
            window.clearTimeout(timer);
            window.removeEventListener('load', settle);
            window.removeEventListener('pagehide', stop);
            window.removeEventListener('popstate', stop);
            interactionEvents.forEach(event => window.removeEventListener(event, stop, true));
        };
        const reset = () => {
            if (stopped) return;
            if (window.location.href !== initialUrl) {
                stop();
                return;
            }
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        };
        function settle() {
            if (stopped) return;
            reset();
            if (stopped) return;
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(reset);
            window.clearTimeout(timer);
            // Mobile browsers may restore the document position after the first render.
            // One bounded correction after load; never keep forcing a user back to the top.
            timer = window.setTimeout(() => {
                reset();
                stop();
            }, 400);
        }

        interactionEvents.forEach(event => window.addEventListener(event, stop, { capture: true, passive: true }));
        window.addEventListener('pagehide', stop);
        window.addEventListener('popstate', stop);
        reset();
        if (document.readyState === 'complete') settle();
        else window.addEventListener('load', settle, { once: true });

        return stop;
    }, []);
}
