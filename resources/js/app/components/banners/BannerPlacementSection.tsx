import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { fetchVisibleBanners, trackBannerClick, trackBannerImpression } from '../../lib/banners';
import type { BannerPlacement, PublicBannerRecord } from '../../lib/types';

interface BannerPlacementSectionProps {
    placement: BannerPlacement;
    className?: string;
}

interface DragState {
    pointerId: number;
    startX: number;
}

function BannerCarousel({ banners }: { banners: PublicBannerRecord[] }) {
    const trackRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const dragStateRef = useRef<DragState | null>(null);
    const trackedBannerIdsRef = useRef<Set<string>>(new Set());
    const suppressClickRef = useRef(false);
    const [isHovered, setIsHovered] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffsetX, setDragOffsetX] = useState(0);
    const [isInView, setIsInView] = useState(false);
    const [isTransitionEnabled, setIsTransitionEnabled] = useState(banners.length > 1);
    const [activeIndex, setActiveIndex] = useState(banners.length > 1 ? 1 : 0);
    const count = banners.length;
    const loopedBanners = useMemo(
        () => (count > 1 ? [banners[count - 1], ...banners, banners[0]] : banners),
        [banners, count],
    );
    const resolvedIndex = count <= 1 ? 0 : ((activeIndex - 1 + count) % count + count) % count;
    const activeBanner = banners[resolvedIndex] ?? null;

    useEffect(() => {
        setIsTransitionEnabled(count > 1);
        setActiveIndex(count > 1 ? 1 : 0);
        setDragOffsetX(0);
        trackedBannerIdsRef.current.clear();
    }, [count, banners]);

    useEffect(() => {
        const element = containerRef.current;

        if (!element) {
            return;
        }

        if (typeof IntersectionObserver === 'undefined') {
            setIsInView(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsInView(entry.isIntersecting);
            },
            {
                threshold: 0.45,
            },
        );

        observer.observe(element);

        return () => {
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        if (!activeBanner || !isInView || trackedBannerIdsRef.current.has(activeBanner.public_id)) {
            return;
        }

        trackedBannerIdsRef.current.add(activeBanner.public_id);
        trackBannerImpression(activeBanner.public_id);
    }, [activeBanner, isInView]);

    useEffect(() => {
        if (count <= 1 || isHovered || isDragging) {
            return;
        }

        const timer = window.setInterval(() => {
            setIsTransitionEnabled(true);
            setActiveIndex((current) => current + 1);
        }, 3000);

        return () => {
            window.clearInterval(timer);
        };
    }, [count, isDragging, isHovered]);

    const navigate = (direction: -1 | 1) => {
        if (count <= 1) {
            return;
        }

        setIsTransitionEnabled(true);
        setActiveIndex((current) => current + direction);
        setDragOffsetX(0);
    };

    const finishDrag = (pointerId: number, pointerTarget: HTMLDivElement | null) => {
        if (dragStateRef.current?.pointerId !== pointerId) {
            return;
        }

        pointerTarget?.releasePointerCapture(pointerId);

        const threshold = Math.min(90, Math.max(48, (containerRef.current?.clientWidth ?? 320) * 0.14));
        const shouldMove = Math.abs(dragOffsetX) >= threshold;
        const shouldSuppressClick = Math.abs(dragOffsetX) > 8;

        setIsDragging(false);
        setIsTransitionEnabled(true);

        if (shouldSuppressClick) {
            suppressClickRef.current = true;
            window.setTimeout(() => {
                suppressClickRef.current = false;
            }, 420);
        }

        if (shouldMove) {
            setActiveIndex((current) => current + (dragOffsetX < 0 ? 1 : -1));
        }

        setDragOffsetX(0);
        dragStateRef.current = null;
    };

    const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (count <= 1) {
            return;
        }

        suppressClickRef.current = false;
        dragStateRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        setIsDragging(true);
        setIsTransitionEnabled(false);
        setDragOffsetX(0);
    };

    const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (dragStateRef.current?.pointerId !== event.pointerId) {
            return;
        }

        const nextOffset = event.clientX - dragStateRef.current.startX;
        setDragOffsetX(nextOffset);
    };

    const handleTransitionEnd = () => {
        if (count <= 1) {
            return;
        }

        if (activeIndex === 0) {
            setIsTransitionEnabled(false);
            setActiveIndex(count);
            return;
        }

        if (activeIndex === count + 1) {
            setIsTransitionEnabled(false);
            setActiveIndex(1);
        }
    };

    return (
        <div
            ref={containerRef}
            className="mx-auto w-full max-w-[960px]"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="relative overflow-hidden rounded-[30px]">
                <div
                    ref={trackRef}
                    className="flex touch-pan-y"
                    style={{
                        transform: `translateX(calc(-${activeIndex * 100}% + ${dragOffsetX}px))`,
                        transition: isDragging || !isTransitionEnabled ? 'none' : 'transform 360ms ease',
                    }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={(event) => finishDrag(event.pointerId, event.currentTarget)}
                    onPointerCancel={(event) => finishDrag(event.pointerId, event.currentTarget)}
                    onTransitionEnd={handleTransitionEnd}
                >
                    {loopedBanners.map((banner, index) => (
                        <div key={`${banner.public_id}-${index}`} className="min-w-full px-1">
                            <a
                                href={banner.link_url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => {
                                    if (suppressClickRef.current) {
                                        suppressClickRef.current = false;
                                        event.preventDefault();
                                        event.stopPropagation();
                                        return;
                                    }

                                    trackBannerClick(banner.public_id);
                                }}
                                className="group flex justify-center overflow-hidden rounded-[30px] border border-[#ddd4c5] bg-white shadow-[0_16px_36px_rgba(15,23,42,0.14)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(15,23,42,0.18)]"
                            >
                                <img
                                    src={banner.image_url}
                                    alt={banner.title}
                                    className="mx-auto block h-auto w-full max-w-[900px] object-contain"
                                    draggable={false}
                                />
                            </a>
                        </div>
                    ))}
                </div>

                {count > 1 ? (
                    <>
                        <button
                            type="button"
                            onClick={() => navigate(-1)}
                            className="absolute left-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(23,32,43,0.76)] text-2xl font-semibold text-white transition hover:bg-[rgba(23,32,43,0.92)]"
                            aria-label="前のバナーへ"
                        >
                            ‹
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate(1)}
                            className="absolute right-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(23,32,43,0.76)] text-2xl font-semibold text-white transition hover:bg-[rgba(23,32,43,0.92)]"
                            aria-label="次のバナーへ"
                        >
                            ›
                        </button>
                    </>
                ) : null}
            </div>
        </div>
    );
}

export function BannerPlacementSection({ placement, className = '' }: BannerPlacementSectionProps) {
    const { isAuthenticated, isBootstrapping, token } = useAuth();
    const [banners, setBanners] = useState<PublicBannerRecord[]>([]);

    useEffect(() => {
        if (isBootstrapping) {
            return;
        }

        let isMounted = true;

        void fetchVisibleBanners(placement, isAuthenticated ? token : null)
            .then((nextBanners) => {
                if (isMounted) {
                    setBanners(nextBanners);
                }
            })
            .catch(() => {
                if (isMounted) {
                    setBanners([]);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [isAuthenticated, isBootstrapping, placement, token]);

    if (banners.length === 0) {
        return null;
    }

    return (
        <section className={className}>
            <BannerCarousel banners={banners} />
        </section>
    );
}
