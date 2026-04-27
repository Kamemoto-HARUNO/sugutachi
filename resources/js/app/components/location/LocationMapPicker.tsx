import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useToast } from '../../hooks/useToast';
import { ApiError, apiRequest } from '../../lib/api';

interface MapSearchResult {
    display_name: string;
    lat: number;
    lng: number;
}

interface LocationMapPickerProps {
    label: string;
    latValue: string;
    lngValue: string;
    onLatChange: (value: string) => void;
    onLngChange: (value: string) => void;
    fallbackLatValue?: string;
    fallbackLngValue?: string;
    searchToken?: string | null;
    disabled?: boolean;
}

const MAP_TILE_SIZE = 256;
const MAP_DEFAULT_ZOOM = 15;
const MAP_MIN_ZOOM = 10;
const MAP_MAX_ZOOM = 18;
const MAP_DEFAULT_CENTER = {
    lat: 35.681236,
    lng: 139.767125,
} as const;
const MAP_MAX_LATITUDE = 85.05112878;

function parseCoordinateValue(value: string): number | null {
    const trimmed = value.trim();

    if (trimmed === '') {
        return null;
    }

    const parsed = Number(trimmed);

    return Number.isFinite(parsed) ? parsed : null;
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function clampMapLatitude(value: number): number {
    return clampNumber(value, -MAP_MAX_LATITUDE, MAP_MAX_LATITUDE);
}

function normalizeLongitude(value: number): number {
    let nextValue = value;

    while (nextValue < -180) {
        nextValue += 360;
    }

    while (nextValue > 180) {
        nextValue -= 360;
    }

    return nextValue;
}

function latLngToWorldPixel(lat: number, lng: number, zoom: number): { x: number; y: number } {
    const worldSize = MAP_TILE_SIZE * (2 ** zoom);
    const normalizedLat = clampMapLatitude(lat);
    const normalizedLng = normalizeLongitude(lng);
    const latitudeRadians = (normalizedLat * Math.PI) / 180;
    const sine = Math.sin(latitudeRadians);

    return {
        x: ((normalizedLng + 180) / 360) * worldSize,
        y: (0.5 - (Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI))) * worldSize,
    };
}

function worldPixelToLatLng(x: number, y: number, zoom: number): { lat: number; lng: number } {
    const worldSize = MAP_TILE_SIZE * (2 ** zoom);
    const wrappedX = ((x % worldSize) + worldSize) % worldSize;
    const clampedY = clampNumber(y, 0, worldSize);
    const mercatorY = Math.PI * (1 - (2 * clampedY) / worldSize);

    return {
        lat: clampMapLatitude((Math.atan(Math.sinh(mercatorY)) * 180) / Math.PI),
        lng: normalizeLongitude((wrappedX / worldSize) * 360 - 180),
    };
}

function buildMapTiles(centerLat: number, centerLng: number, width: number, height: number, zoom: number): Array<{
    key: string;
    left: number;
    top: number;
    src: string;
}> {
    const tilesPerAxis = 2 ** zoom;
    const centerPixel = latLngToWorldPixel(centerLat, centerLng, zoom);
    const topLeftX = centerPixel.x - width / 2;
    const topLeftY = centerPixel.y - height / 2;
    const startTileX = Math.floor(topLeftX / MAP_TILE_SIZE);
    const endTileX = Math.floor((topLeftX + width) / MAP_TILE_SIZE);
    const startTileY = Math.floor(topLeftY / MAP_TILE_SIZE);
    const endTileY = Math.floor((topLeftY + height) / MAP_TILE_SIZE);
    const tiles: Array<{
        key: string;
        left: number;
        top: number;
        src: string;
    }> = [];

    for (let tileY = startTileY; tileY <= endTileY; tileY += 1) {
        if (tileY < 0 || tileY >= tilesPerAxis) {
            continue;
        }

        for (let tileX = startTileX; tileX <= endTileX; tileX += 1) {
            const wrappedTileX = ((tileX % tilesPerAxis) + tilesPerAxis) % tilesPerAxis;

            tiles.push({
                key: `${zoom}-${wrappedTileX}-${tileY}-${tileX}`,
                left: tileX * MAP_TILE_SIZE - topLeftX,
                top: tileY * MAP_TILE_SIZE - topLeftY,
                src: `https://tile.openstreetmap.org/${zoom}/${wrappedTileX}/${tileY}.png`,
            });
        }
    }

    return tiles;
}

function mapPointToLatLng(
    pointX: number,
    pointY: number,
    centerLat: number,
    centerLng: number,
    width: number,
    height: number,
    zoom: number,
): { lat: number; lng: number } {
    const centerPixel = latLngToWorldPixel(centerLat, centerLng, zoom);
    const topLeftX = centerPixel.x - width / 2;
    const topLeftY = centerPixel.y - height / 2;

    return worldPixelToLatLng(topLeftX + pointX, topLeftY + pointY, zoom);
}

function latLngToMapPoint(
    lat: number,
    lng: number,
    centerLat: number,
    centerLng: number,
    width: number,
    height: number,
    zoom: number,
): { x: number; y: number } {
    const centerPixel = latLngToWorldPixel(centerLat, centerLng, zoom);
    const targetPixel = latLngToWorldPixel(lat, lng, zoom);
    const worldSize = MAP_TILE_SIZE * (2 ** zoom);
    let deltaX = targetPixel.x - centerPixel.x;

    if (deltaX > worldSize / 2) {
        deltaX -= worldSize;
    } else if (deltaX < -worldSize / 2) {
        deltaX += worldSize;
    }

    return {
        x: width / 2 + deltaX,
        y: height / 2 + (targetPixel.y - centerPixel.y),
    };
}

export function LocationMapPicker({
    label,
    latValue,
    lngValue,
    onLatChange,
    onLngChange,
    fallbackLatValue,
    fallbackLngValue,
    searchToken,
    disabled = false,
}: LocationMapPickerProps) {
    const { showError, showSuccess } = useToast();
    const latitude = parseCoordinateValue(latValue);
    const longitude = parseCoordinateValue(lngValue);
    const fallbackLatitude = parseCoordinateValue(fallbackLatValue ?? '');
    const fallbackLongitude = parseCoordinateValue(fallbackLngValue ?? '');
    const hasCoordinates = latitude !== null && longitude !== null;
    const initialCenter = useMemo(() => ({
        lat: latitude ?? fallbackLatitude ?? MAP_DEFAULT_CENTER.lat,
        lng: longitude ?? fallbackLongitude ?? MAP_DEFAULT_CENTER.lng,
    }), [fallbackLatitude, fallbackLongitude, latitude, longitude]);
    const [viewCenter, setViewCenter] = useState(initialCenter);
    const [mapZoom, setMapZoom] = useState(MAP_DEFAULT_ZOOM);
    const mapRef = useRef<HTMLDivElement | null>(null);
    const mapDragStateRef = useRef<{
        pointerId: number;
        startClientX: number;
        startClientY: number;
        originCenter: { lat: number; lng: number };
        hasMoved: boolean;
    } | null>(null);
    const [mapViewportSize, setMapViewportSize] = useState({ width: 320, height: 176 });
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<MapSearchResult[]>([]);
    const [searchMessage, setSearchMessage] = useState<string | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isLocating, setIsLocating] = useState(false);
    const mapTiles = useMemo(
        () => buildMapTiles(viewCenter.lat, viewCenter.lng, mapViewportSize.width, mapViewportSize.height, mapZoom),
        [mapViewportSize.height, mapViewportSize.width, mapZoom, viewCenter.lat, viewCenter.lng],
    );
    const selectedPinPoint = useMemo(() => (
        hasCoordinates && latitude !== null && longitude !== null
            ? latLngToMapPoint(
                latitude,
                longitude,
                viewCenter.lat,
                viewCenter.lng,
                mapViewportSize.width,
                mapViewportSize.height,
                mapZoom,
            )
            : null
    ), [hasCoordinates, latitude, longitude, mapViewportSize.height, mapViewportSize.width, mapZoom, viewCenter.lat, viewCenter.lng]);

    useEffect(() => {
        setViewCenter(initialCenter);
    }, [initialCenter]);

    useEffect(() => {
        const mapElement = mapRef.current;

        if (!mapElement || typeof ResizeObserver === 'undefined') {
            return undefined;
        }

        const observer = new ResizeObserver((entries) => {
            const nextEntry = entries[0];

            if (!nextEntry) {
                return;
            }

            setMapViewportSize({
                width: Math.max(240, Math.round(nextEntry.contentRect.width)),
                height: Math.max(140, Math.round(nextEntry.contentRect.height)),
            });
        });

        observer.observe(mapElement);

        return () => {
            observer.disconnect();
        };
    }, []);

    const updatePinFromClientPosition = useCallback((clientX: number, clientY: number) => {
        const mapElement = mapRef.current;

        if (!mapElement) {
            return;
        }

        const rect = mapElement.getBoundingClientRect();
        const pointX = clampNumber(clientX - rect.left, 0, rect.width);
        const pointY = clampNumber(clientY - rect.top, 0, rect.height);
        const nextPoint = mapPointToLatLng(
            pointX,
            pointY,
            viewCenter.lat,
            viewCenter.lng,
            mapViewportSize.width,
            mapViewportSize.height,
            mapZoom,
        );

        onLatChange(nextPoint.lat.toFixed(6));
        onLngChange(nextPoint.lng.toFixed(6));
        setViewCenter(nextPoint);
    }, [mapViewportSize.height, mapViewportSize.width, mapZoom, onLatChange, onLngChange, viewCenter.lat, viewCenter.lng]);

    const adjustMapZoom = useCallback((nextZoom: number, clientX?: number, clientY?: number) => {
        const normalizedZoom = clampNumber(nextZoom, MAP_MIN_ZOOM, MAP_MAX_ZOOM);

        if (normalizedZoom === mapZoom) {
            return;
        }

        const mapElement = mapRef.current;

        if (!mapElement) {
            setMapZoom(normalizedZoom);
            return;
        }

        const rect = mapElement.getBoundingClientRect();
        const pointX = clientX == null
            ? rect.width / 2
            : clampNumber(clientX - rect.left, 0, rect.width);
        const pointY = clientY == null
            ? rect.height / 2
            : clampNumber(clientY - rect.top, 0, rect.height);
        const focusLatLng = mapPointToLatLng(
            pointX,
            pointY,
            viewCenter.lat,
            viewCenter.lng,
            mapViewportSize.width,
            mapViewportSize.height,
            mapZoom,
        );
        const focusPixel = latLngToWorldPixel(focusLatLng.lat, focusLatLng.lng, normalizedZoom);
        const nextCenter = worldPixelToLatLng(
            focusPixel.x - pointX + (mapViewportSize.width / 2),
            focusPixel.y - pointY + (mapViewportSize.height / 2),
            normalizedZoom,
        );

        setMapZoom(normalizedZoom);
        setViewCenter(nextCenter);
    }, [mapViewportSize.height, mapViewportSize.width, mapZoom, viewCenter.lat, viewCenter.lng]);

    const handleMapPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (disabled) {
            return;
        }

        event.preventDefault();
        mapDragStateRef.current = {
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            originCenter: viewCenter,
            hasMoved: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    }, [disabled, viewCenter]);

    const handleMapPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        const dragState = mapDragStateRef.current;

        if (!dragState || dragState.pointerId !== event.pointerId) {
            return;
        }

        const deltaX = event.clientX - dragState.startClientX;
        const deltaY = event.clientY - dragState.startClientY;

        if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
            dragState.hasMoved = true;
        }

        const originPixel = latLngToWorldPixel(dragState.originCenter.lat, dragState.originCenter.lng, mapZoom);
        const nextCenter = worldPixelToLatLng(originPixel.x - deltaX, originPixel.y - deltaY, mapZoom);

        setViewCenter(nextCenter);
    }, [mapZoom]);

    const handleMapPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        const dragState = mapDragStateRef.current;

        if (!dragState || dragState.pointerId !== event.pointerId) {
            return;
        }

        if (!dragState.hasMoved) {
            updatePinFromClientPosition(event.clientX, event.clientY);
        }

        mapDragStateRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
    }, [updatePinFromClientPosition]);

    const handleMapPointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        const dragState = mapDragStateRef.current;

        if (!dragState || dragState.pointerId !== event.pointerId) {
            return;
        }

        mapDragStateRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
    }, []);

    const handleMapWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
        if (disabled) {
            return;
        }

        event.preventDefault();
        adjustMapZoom(mapZoom + (event.deltaY < 0 ? 1 : -1), event.clientX, event.clientY);
    }, [adjustMapZoom, disabled, mapZoom]);

    const moveToCurrentPin = useCallback(() => {
        if (!hasCoordinates || latitude === null || longitude === null) {
            return;
        }

        setViewCenter({
            lat: latitude,
            lng: longitude,
        });
    }, [hasCoordinates, latitude, longitude]);

    const applySearchResult = useCallback((result: MapSearchResult) => {
        onLatChange(result.lat.toFixed(6));
        onLngChange(result.lng.toFixed(6));
        setViewCenter({
            lat: result.lat,
            lng: result.lng,
        });
        setMapZoom((current) => Math.max(current, 16));
        setSearchResults([]);
        setSearchMessage(null);
    }, [onLatChange, onLngChange]);

    const handleSearchRequest = useCallback(async () => {
        const normalizedQuery = searchQuery.trim();

        if (disabled || normalizedQuery === '') {
            return;
        }

        if (!searchToken) {
            showError('ログイン状態を確認できなかったため、住所検索を実行できませんでした。');
            return;
        }

        setIsSearching(true);
        setSearchResults([]);
        setSearchMessage(null);

        try {
            const payload = await apiRequest<{ data: MapSearchResult[] }>(
                `/me/location-search?q=${encodeURIComponent(normalizedQuery)}`,
                { token: searchToken },
            );

            setSearchResults(payload.data);
            setSearchMessage(payload.data.length === 0 ? '候補が見つかりませんでした。別の地名や住所でお試しください。' : null);
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '住所検索に失敗しました。しばらくしてからもう一度お試しください。';

            showError(message);
        } finally {
            setIsSearching(false);
        }
    }, [disabled, searchQuery, searchToken, showError]);

    const handleSearchInputKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') {
            return;
        }

        event.preventDefault();
        void handleSearchRequest();
    }, [handleSearchRequest]);

    const handleUseCurrentLocation = useCallback(() => {
        if (disabled) {
            return;
        }

        if (!navigator.geolocation) {
            showError('このブラウザでは現在地取得を利用できません。');
            return;
        }

        setIsLocating(true);

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const nextLat = position.coords.latitude.toFixed(6);
                const nextLng = position.coords.longitude.toFixed(6);

                onLatChange(nextLat);
                onLngChange(nextLng);
                setViewCenter({
                    lat: Number(nextLat),
                    lng: Number(nextLng),
                });
                showSuccess('現在地からピン位置を更新しました。住所もあわせて確認してください。');
                setIsLocating(false);
            },
            () => {
                showError('現在地の取得に失敗しました。地図を押すか、検索から位置を指定してください。');
                setIsLocating(false);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
            },
        );
    }, [disabled, onLatChange, onLngChange, showError, showSuccess]);

    return (
        <div className="space-y-4">
            <div className="overflow-hidden rounded-[22px] border border-white/10 bg-[#0f1720]">
                <div
                    ref={mapRef}
                    role="application"
                    aria-label={`${label}の地図`}
                    onPointerDown={handleMapPointerDown}
                    onPointerMove={handleMapPointerMove}
                    onPointerUp={handleMapPointerUp}
                    onPointerCancel={handleMapPointerCancel}
                    onWheel={handleMapWheel}
                    className={[
                        'relative h-40 w-full overflow-hidden border-b border-white/10 bg-[#0b1220] sm:h-48',
                        disabled ? 'cursor-not-allowed opacity-70' : 'cursor-grab active:cursor-grabbing',
                    ].join(' ')}
                    style={{ touchAction: 'none' }}
                >
                    <div className="absolute inset-0">
                        {mapTiles.map((tile) => (
                            <img
                                key={tile.key}
                                src={tile.src}
                                alt=""
                                draggable={false}
                                className="pointer-events-none absolute select-none"
                                style={{
                                    left: tile.left,
                                    top: tile.top,
                                    width: `${MAP_TILE_SIZE}px`,
                                    height: `${MAP_TILE_SIZE}px`,
                                }}
                            />
                        ))}
                    </div>

                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(7,10,16,0.08),rgba(7,10,16,0.32))]" />

                    <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-black/20 bg-slate-950/75 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
                        地図を押してピンを変更
                    </div>

                    <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-black/20 bg-slate-950/75 px-3 py-1 text-[11px] font-medium text-slate-200 backdrop-blur">
                        ドラッグで地図を移動
                    </div>

                    <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-2">
                        <button
                            type="button"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                                event.stopPropagation();
                                moveToCurrentPin();
                            }}
                            disabled={disabled || !hasCoordinates}
                            className="inline-flex items-center rounded-full border border-black/20 bg-slate-950/80 px-3 py-2 text-[11px] font-semibold text-white backdrop-blur transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            現在のピン位置に移動
                        </button>
                        <button
                            type="button"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                                event.stopPropagation();
                                handleUseCurrentLocation();
                            }}
                            disabled={disabled || isLocating}
                            className="inline-flex items-center rounded-full border border-black/20 bg-slate-950/80 px-3 py-2 text-[11px] font-semibold text-white backdrop-blur transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isLocating ? '取得中...' : '現在地を使う'}
                        </button>
                        <div className="flex flex-col gap-2">
                            <button
                                type="button"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    adjustMapZoom(mapZoom + 1);
                                }}
                                disabled={disabled || mapZoom >= MAP_MAX_ZOOM}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/20 bg-slate-950/80 text-lg font-semibold text-white backdrop-blur transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label="地図を拡大"
                            >
                                +
                            </button>
                            <button
                                type="button"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    adjustMapZoom(mapZoom - 1);
                                }}
                                disabled={disabled || mapZoom <= MAP_MIN_ZOOM}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/20 bg-slate-950/80 text-lg font-semibold text-white backdrop-blur transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label="地図を縮小"
                            >
                                -
                            </button>
                        </div>
                    </div>

                    {hasCoordinates && selectedPinPoint ? (
                        <div
                            className="pointer-events-none absolute z-10"
                            style={{
                                left: `${selectedPinPoint.x}px`,
                                top: `${selectedPinPoint.y}px`,
                                transform: 'translate(-50%, -100%)',
                            }}
                        >
                            <div className="flex flex-col items-center gap-1">
                                <div className="relative h-6 w-6 rounded-full border-2 border-white/90 bg-rose-400 shadow-[0_10px_24px_rgba(0,0,0,0.28)]">
                                    <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
                                </div>
                                <div className="-mt-1 h-3 w-3 rotate-45 rounded-[3px] bg-rose-400 shadow-[0_10px_24px_rgba(0,0,0,0.28)]" />
                            </div>
                        </div>
                    ) : (
                        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-white/70 bg-slate-950/20">
                            <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />
                        </div>
                    )}
                </div>

                <div className="space-y-3 px-4 py-4">
                    <div role="search" className="flex flex-col gap-2 sm:flex-row">
                        <input
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            onKeyDown={handleSearchInputKeyDown}
                            placeholder="地名や住所で検索"
                            className="min-w-0 flex-1 rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                            disabled={disabled || isSearching}
                        />
                        <button
                            type="button"
                            onClick={() => {
                                void handleSearchRequest();
                            }}
                            disabled={disabled || isSearching || searchQuery.trim() === ''}
                            className="inline-flex items-center justify-center rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-[#16212d] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isSearching ? '検索中...' : '検索'}
                        </button>
                    </div>

                    {searchMessage ? (
                        <p className="text-sm text-slate-400">{searchMessage}</p>
                    ) : null}

                    {searchResults.length > 0 ? (
                        <div className="space-y-2">
                            {searchResults.map((result) => (
                                <button
                                    key={`${result.lat}-${result.lng}-${result.display_name}`}
                                    type="button"
                                    onClick={() => applySearchResult(result)}
                                    disabled={disabled}
                                    className="block w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-left transition hover:bg-[#16212d] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <p className="text-sm font-semibold text-white">この場所を使う</p>
                                    <p className="mt-1 text-sm leading-6 text-slate-300">{result.display_name}</p>
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
