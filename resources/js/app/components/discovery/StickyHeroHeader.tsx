import { useEffect, useRef, useState } from 'react';
import { PublicHeaderBar, type PublicHeaderAction } from '../public/PublicHeaderBar';

export type StickyHeroHeaderAction = PublicHeaderAction;

interface StickyHeroHeaderProps {
    actions: StickyHeroHeaderAction[];
}

export function StickyHeroHeader({ actions }: StickyHeroHeaderProps) {
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const lastScrollYRef = useRef(0);
    const hasPassedSentinelRef = useRef(false);
    const [showStickyHeader, setShowStickyHeader] = useState(false);

    useEffect(() => {
        const element = sentinelRef.current;

        if (!element) {
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                hasPassedSentinelRef.current = !entry.isIntersecting;

                if (entry.isIntersecting) {
                    setShowStickyHeader(false);
                }
            },
            {
                threshold: 0,
            },
        );

        observer.observe(element);

        return () => {
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        lastScrollYRef.current = window.scrollY;

        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            const isScrollingUp = currentScrollY < lastScrollYRef.current;
            const isNearTop = currentScrollY <= 8;

            if (isNearTop || !hasPassedSentinelRef.current) {
                setShowStickyHeader(false);
            } else if (isScrollingUp) {
                setShowStickyHeader(true);
            } else {
                setShowStickyHeader(false);
            }

            lastScrollYRef.current = currentScrollY;
        };

        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, []);

    return (
        <>
            <div
                className={[
                    'mode-sticky-header pointer-events-none fixed inset-x-0 top-0 z-50 px-4 pt-3 transition-all duration-300 sm:px-6',
                    showStickyHeader ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0',
                ].join(' ')}
            >
                <div className="mx-auto w-full max-w-[1280px] pointer-events-auto">
                    <PublicHeaderBar actions={actions} sticky />
                </div>
            </div>

            <div ref={sentinelRef} className="w-full">
                <PublicHeaderBar actions={actions} />
            </div>
        </>
    );
}
