import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToast } from '../hooks/useToast';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import {
    addDaysToJstDateValue,
    buildCurrentJstDateTimeLocalValue,
    buildCurrentJstDateValue,
    formatJstDateTime,
    formatJstDateTimeLocalValue,
    formatJstDateValue,
    formatJstTime,
    parseJstDateTimeLocalInput,
    weekdayIndexFromJstDateValue,
} from '../lib/datetime';
import type {
    ApiEnvelope,
    TherapistAvailabilitySlotRecord,
    TherapistBookingSettingRecord,
} from '../lib/types';

interface SlotDraft {
    public_id: string | null;
    start_at: string;
    end_at: string;
    status: 'published' | 'hidden';
    dispatch_base_type: 'default' | 'custom';
    custom_dispatch_base_label: string;
    custom_dispatch_base_lat: string;
    custom_dispatch_base_lng: string;
    custom_dispatch_base_accuracy_m: string;
}

interface CalendarDaySummary {
    date: string;
    slots: TherapistAvailabilitySlotRecord[];
    published_count: number;
    hidden_count: number;
    first_slot: TherapistAvailabilitySlotRecord | null;
}

interface TimelinePlacement {
    slot: TherapistAvailabilitySlotRecord;
    top: number;
    height: number;
}

type DraftDragState =
    | { mode: 'resize' }
    | { mode: 'move'; pointerOffsetMinutes: number };

interface LocationPreviewEditorProps {
    label: string;
    latValue: string;
    lngValue: string;
    accuracyValue: string;
    onLatChange: (value: string) => void;
    onLngChange: (value: string) => void;
    onAccuracyChange: (value: string) => void;
    fallbackLatValue?: string;
    fallbackLngValue?: string;
    searchToken?: string | null;
    disabled?: boolean;
}

interface MapSearchResult {
    display_name: string;
    lat: number;
    lng: number;
}

const CALENDAR_DAYS = 7;
const TIMELINE_START_HOUR = 0;
const TIMELINE_END_HOUR = 24;
const TIMELINE_STEP_MINUTES = 30;
const TIMELINE_ROW_HEIGHT = 28;
const MIN_SLOT_DURATION_MINUTES = 60;
const TIMELINE_END_MINUTES = TIMELINE_END_HOUR * 60;
const LATEST_TIMELINE_START_MINUTES = TIMELINE_END_MINUTES - TIMELINE_STEP_MINUTES;
const LOCATION_DEFAULT_ACCURACY_METERS = 150;
const MAP_TILE_SIZE = 256;
const MAP_DEFAULT_ZOOM = 15;
const MAP_MIN_ZOOM = 10;
const MAP_MAX_ZOOM = 18;
const MAP_DEFAULT_CENTER = {
    lat: 35.681236,
    lng: 139.767125,
} as const;
const MAP_MAX_LATITUDE = 85.05112878;

function todayDateValue(): string {
    return buildCurrentJstDateValue();
}

function dateKeyFromLocalValue(value: string | null | undefined): string | null {
    if (!value || value.length < 10) {
        return null;
    }

    return value.slice(0, 10);
}

function addDaysToDateKey(dateKey: string, days: number): string {
    return addDaysToJstDateValue(dateKey, days);
}

function buildCalendarDateKeys(anchorDate: string, days: number): string[] {
    return Array.from({ length: days }, (_, index) => addDaysToDateKey(anchorDate, index));
}

function timeStringFromMinutes(minutes: number): string {
    const safeMinutes = Math.max(0, Math.min(minutes, TIMELINE_END_MINUTES));
    const hours = Math.floor(safeMinutes / 60);
    const remainder = safeMinutes % 60;

    return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function buildLocalDateTime(dateKey: string, minutes: number): string {
    const dayOffset = Math.floor(minutes / TIMELINE_END_MINUTES);
    const normalizedMinutes = ((minutes % TIMELINE_END_MINUTES) + TIMELINE_END_MINUTES) % TIMELINE_END_MINUTES;
    const resolvedDateKey = addDaysToDateKey(dateKey, dayOffset);

    return `${resolvedDateKey}T${timeStringFromMinutes(normalizedMinutes)}`;
}

function addMinutesToLocalValue(value: string, minutes: number): string {
    const date = parseJstDateTimeLocalInput(value);

    if (!date) {
        return value;
    }

    date.setUTCMinutes(date.getUTCMinutes() + minutes);

    return formatJstDateTimeLocalValue(date.toISOString());
}

function durationMinutesBetweenLocalValues(startValue: string | null | undefined, endValue: string | null | undefined): number {
    if (!startValue || !endValue) {
        return 0;
    }

    const start = parseJstDateTimeLocalInput(startValue);
    const end = parseJstDateTimeLocalInput(endValue);

    if (!start || !end) {
        return 0;
    }

    return Math.max(0, Math.round((end.getTime() - start.getTime()) / (60 * 1000)));
}

function durationLabel(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;

    if (hours > 0 && remainder > 0) {
        return `${hours}時間${remainder}分`;
    }

    if (hours > 0) {
        return `${hours}時間`;
    }

    return `${minutes}分`;
}

function localMinutesFromValue(value: string | null | undefined): number {
    if (!value || value.length < 16) {
        return TIMELINE_START_HOUR * 60;
    }

    const time = value.slice(11, 16);
    const [hours, minutes] = time.split(':').map((part) => Number(part));

    return (Number.isNaN(hours) ? 0 : hours) * 60 + (Number.isNaN(minutes) ? 0 : minutes);
}

function minutesOffsetFromDateKey(dateKey: string, value: string | null | undefined): number {
    if (!value) {
        return TIMELINE_START_HOUR * 60;
    }

    const anchor = parseJstDateTimeLocalInput(`${dateKey}T00:00`);
    const target = parseJstDateTimeLocalInput(value);

    if (!anchor || !target) {
        return TIMELINE_START_HOUR * 60;
    }

    return Math.round((target.getTime() - anchor.getTime()) / (60 * 1000));
}

function timeRangeOverlaps(startMinutes: number, endMinutes: number, compareStartMinutes: number, compareEndMinutes: number): boolean {
    return startMinutes < compareEndMinutes && endMinutes > compareStartMinutes;
}

function formatDateTime(value: string | null): string {
    return formatJstDateTime(value, {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }) ?? '未設定';
}

function formatCalendarLabel(value: string): string {
    return formatJstDateValue(value, {
        month: 'numeric',
        day: 'numeric',
        weekday: 'short',
    }) ?? '日付未設定';
}

function formatCalendarDayNumber(value: string): string {
    const dayValue = Number(value.slice(8, 10));

    if (Number.isNaN(dayValue)) {
        return '--';
    }

    return String(dayValue);
}

function formatCalendarWeekday(value: string): string {
    return formatJstDateValue(value, {
        weekday: 'short',
    }) ?? '--';
}

function calendarWeekdayTone(value: string): string {
    const dayOfWeek = weekdayIndexFromJstDateValue(value);

    if (dayOfWeek == null) {
        return 'text-slate-400';
    }

    if (dayOfWeek === 0) {
        return 'text-rose-300';
    }

    if (dayOfWeek === 6) {
        return 'text-sky-300';
    }

    return 'text-slate-400';
}

function formatTime(value: string | null | undefined): string {
    return formatJstTime(value, {
        hour: '2-digit',
        minute: '2-digit',
    }) ?? '--:--';
}

function toDateTimeLocalValue(value: string | null | undefined): string {
    return formatJstDateTimeLocalValue(value);
}

function fromDateTimeLocalValue(value: string): string {
    return parseJstDateTimeLocalInput(value)?.toISOString() ?? new Date(value).toISOString();
}

function leadTimeLabel(minutes: number): string {
    if (minutes % 60 === 0) {
        return `${minutes / 60}時間前まで`;
    }

    return `${minutes}分前まで`;
}

function slotStatusLabel(status: TherapistAvailabilitySlotRecord['status'] | SlotDraft['status']): string {
    switch (status) {
        case 'published':
            return '公開中';
        case 'hidden':
            return '非公開';
        case 'expired':
            return '期限切れ';
        default:
            return status;
    }
}

function slotStatusTone(status: TherapistAvailabilitySlotRecord['status'] | SlotDraft['status']): string {
    switch (status) {
        case 'published':
            return 'border-emerald-400/30 bg-emerald-400/12 text-emerald-100';
        case 'hidden':
            return 'border-white/10 bg-white/5 text-slate-300';
        case 'expired':
            return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
        default:
            return 'border-white/10 bg-white/5 text-slate-300';
    }
}

function normalizeAreaLabel(baseLabel: string | null | undefined, fallback: string): string {
    if (!baseLabel) {
        return fallback;
    }

    const normalized = baseLabel.replace(/\s+/gu, ' ').trim();

    if (!normalized) {
        return fallback;
    }

    if (/(周辺|付近)$/u.test(normalized)) {
        return normalized;
    }

    const stripped = normalized.replace(/(?:\s|-)?(ベース|拠点|サテライト|Base|BASE|base|Visit|VISIT|visit|Satellite|SATELLITE|satellite|Hub|HUB|hub)$/u, '').trim();

    return stripped ? `${stripped}周辺` : fallback;
}

function slotBaseLabel(
    slot: TherapistAvailabilitySlotRecord,
    bookingSetting: TherapistBookingSettingRecord | null,
): string {
    if (slot.dispatch_base_type === 'custom') {
        return slot.custom_dispatch_base?.label?.trim() || '枠専用拠点';
    }

    return bookingSetting?.scheduled_base_location?.label?.trim() || '基本拠点';
}

function slotBaseSummary(
    slot: TherapistAvailabilitySlotRecord,
    bookingSetting: TherapistBookingSettingRecord | null,
): string {
    const baseLabel = slotBaseLabel(slot, bookingSetting);
    const typeLabel = slot.dispatch_base_type === 'custom' ? '枠専用拠点' : '基本拠点';

    return `${baseLabel}（${typeLabel}）`;
}

function draftBaseSummary(
    draft: SlotDraft,
    bookingSetting: TherapistBookingSettingRecord | null,
): string {
    const baseLabel = draft.dispatch_base_type === 'custom'
        ? draft.custom_dispatch_base_label.trim() || '枠専用拠点'
        : bookingSetting?.scheduled_base_location?.label?.trim() || '基本拠点';
    const typeLabel = draft.dispatch_base_type === 'custom' ? '枠専用拠点' : '基本拠点';

    return `${baseLabel}（${typeLabel}）`;
}

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

function LocationPreviewEditor({
    label,
    latValue,
    lngValue,
    accuracyValue,
    onLatChange,
    onLngChange,
    onAccuracyChange,
    fallbackLatValue,
    fallbackLngValue,
    searchToken,
    disabled = false,
}: LocationPreviewEditorProps) {
    const { showError } = useToast();
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

        if (accuracyValue.trim() === '') {
            onAccuracyChange(String(LOCATION_DEFAULT_ACCURACY_METERS));
        }

        setViewCenter({
            lat: result.lat,
            lng: result.lng,
        });
        setMapZoom((current) => Math.max(current, 16));
        setSearchResults([]);
        setSearchMessage(null);
    }, [accuracyValue, onAccuracyChange, onLatChange, onLngChange]);

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
                            aria-label="現在のピン位置へ移動"
                        >
                            現在のピン位置に移動
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
                        <div
                            className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-white/70 bg-slate-950/20"
                        >
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

function slotDraftMatchesSlot(draft: SlotDraft, slot: TherapistAvailabilitySlotRecord): boolean {
    return draft.public_id === slot.public_id
        && draft.start_at === toDateTimeLocalValue(slot.start_at)
        && draft.end_at === toDateTimeLocalValue(slot.end_at)
        && draft.status === (slot.status === 'hidden' ? 'hidden' : 'published')
        && draft.dispatch_base_type === slot.dispatch_base_type
        && draft.custom_dispatch_base_label === (slot.custom_dispatch_base?.label ?? '')
        && draft.custom_dispatch_base_lat === (slot.custom_dispatch_base?.lat != null ? String(slot.custom_dispatch_base.lat) : '')
        && draft.custom_dispatch_base_lng === (slot.custom_dispatch_base?.lng != null ? String(slot.custom_dispatch_base.lng) : '')
        && draft.custom_dispatch_base_accuracy_m === (slot.custom_dispatch_base?.accuracy_m != null ? String(slot.custom_dispatch_base.accuracy_m) : '');
}

function createEmptySlotDraft(dateKey = todayDateValue()): SlotDraft {
    const defaultStart = dateKey === todayDateValue()
        ? buildCurrentJstDateTimeLocalValue(new Date(Date.now() + 60 * 60 * 1000))
        : `${dateKey}T18:00`;
    const defaultEnd = addMinutesToLocalValue(defaultStart, MIN_SLOT_DURATION_MINUTES);

    return {
        public_id: null,
        start_at: defaultStart,
        end_at: defaultEnd,
        status: 'published',
        dispatch_base_type: 'default',
        custom_dispatch_base_label: '',
        custom_dispatch_base_lat: '',
        custom_dispatch_base_lng: '',
        custom_dispatch_base_accuracy_m: '',
    };
}

function createSlotDraft(slot?: TherapistAvailabilitySlotRecord | null): SlotDraft {
    if (!slot) {
        return createEmptySlotDraft();
    }

    return {
        public_id: slot.public_id,
        start_at: toDateTimeLocalValue(slot.start_at),
        end_at: toDateTimeLocalValue(slot.end_at),
        status: slot.status === 'hidden' ? 'hidden' : 'published',
        dispatch_base_type: slot.dispatch_base_type,
        custom_dispatch_base_label: slot.custom_dispatch_base?.label ?? '',
        custom_dispatch_base_lat: slot.custom_dispatch_base?.lat != null ? String(slot.custom_dispatch_base.lat) : '',
        custom_dispatch_base_lng: slot.custom_dispatch_base?.lng != null ? String(slot.custom_dispatch_base.lng) : '',
        custom_dispatch_base_accuracy_m: slot.custom_dispatch_base?.accuracy_m != null ? String(slot.custom_dispatch_base.accuracy_m) : '',
    };
}

function createTimelineDraft(dateKey: string, startMinutes: number, currentDraft?: SlotDraft | null): SlotDraft {
    const template = currentDraft && !currentDraft.public_id ? currentDraft : createEmptySlotDraft(dateKey);

    return {
        ...template,
        public_id: null,
        start_at: buildLocalDateTime(dateKey, startMinutes),
        end_at: buildLocalDateTime(dateKey, startMinutes + MIN_SLOT_DURATION_MINUTES),
    };
}

function resizeTimelineDraft(currentDraft: SlotDraft, dateKey: string, rowStartMinutes: number): SlotDraft {
    const draftDateKey = dateKeyFromLocalValue(currentDraft.start_at) ?? dateKey;
    const startMinutes = minutesOffsetFromDateKey(draftDateKey, currentDraft.start_at);
    const requestedEndMinutes = Math.min(rowStartMinutes + TIMELINE_STEP_MINUTES, TIMELINE_END_MINUTES);
    const nextEndMinutes = Math.min(
        Math.max(requestedEndMinutes, startMinutes + MIN_SLOT_DURATION_MINUTES),
        TIMELINE_END_MINUTES + MIN_SLOT_DURATION_MINUTES,
    );

    return {
        ...currentDraft,
        end_at: buildLocalDateTime(dateKey, nextEndMinutes),
    };
}

function buildTimelineMetrics(startValue: string, endValue: string, anchorDateKey?: string): { top: number; height: number } | null {
    const resolvedAnchorDateKey = anchorDateKey ?? dateKeyFromLocalValue(startValue) ?? todayDateValue();
    const slotStart = minutesOffsetFromDateKey(resolvedAnchorDateKey, startValue);
    const slotEnd = minutesOffsetFromDateKey(resolvedAnchorDateKey, endValue);
    const clippedStart = Math.max(slotStart, TIMELINE_START_HOUR * 60);
    const clippedEnd = Math.min(slotEnd, TIMELINE_END_MINUTES);

    if (clippedEnd <= clippedStart) {
        return null;
    }

    return {
        top: ((clippedStart - TIMELINE_START_HOUR * 60) / TIMELINE_STEP_MINUTES) * TIMELINE_ROW_HEIGHT,
        height: Math.max(
            ((clippedEnd - clippedStart) / TIMELINE_STEP_MINUTES) * TIMELINE_ROW_HEIGHT - 4,
            TIMELINE_ROW_HEIGHT - 6,
        ),
    };
}

function buildTimelinePlacements(slots: TherapistAvailabilitySlotRecord[], anchorDateKey: string): TimelinePlacement[] {
    return slots
        .map((slot) => {
            const metrics = buildTimelineMetrics(
                toDateTimeLocalValue(slot.start_at),
                toDateTimeLocalValue(slot.end_at),
                anchorDateKey,
            );

            if (!metrics) {
                return null;
            }

            return {
                slot,
                top: metrics.top,
                height: metrics.height,
            };
        })
        .filter((placement): placement is TimelinePlacement => placement !== null);
}

function slotSummary(slot: TherapistAvailabilitySlotRecord | null): string {
    if (!slot) {
        return 'まだ枠はありません';
    }

    return `${formatTime(slot.start_at)} - ${formatTime(slot.end_at)}`;
}

export function TherapistAvailabilityPage() {
    const { token } = useAuth();
    const { showError, showSuccess } = useToast();
    const [bookingSetting, setBookingSetting] = useState<TherapistBookingSettingRecord | null>(null);
    const [availabilitySlots, setAvailabilitySlots] = useState<TherapistAvailabilitySlotRecord[]>([]);
    const [leadTimeMinutes, setLeadTimeMinutes] = useState('60');
    const [baseLabel, setBaseLabel] = useState('');
    const [baseLat, setBaseLat] = useState('');
    const [baseLng, setBaseLng] = useState('');
    const [baseAccuracy, setBaseAccuracy] = useState('');
    const [slotDraft, setSlotDraft] = useState<SlotDraft>(() => createEmptySlotDraft());
    const [hasSlotSelection, setHasSlotSelection] = useState(false);
    const [calendarAnchorDate, setCalendarAnchorDate] = useState(todayDateValue);
    const [selectedCalendarDate, setSelectedCalendarDate] = useState(todayDateValue);
    const timelineContainerRef = useRef<HTMLDivElement | null>(null);
    const [activeDraftDrag, setActiveDraftDrag] = useState<DraftDragState | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSavingSetting, setIsSavingSetting] = useState(false);
    const [isSavingSlot, setIsSavingSlot] = useState(false);
    const [isLocatingBase, setIsLocatingBase] = useState(false);
    const [isLocatingCustom, setIsLocatingCustom] = useState(false);
    const [isLeadTimeHelpOpen, setIsLeadTimeHelpOpen] = useState(false);
    const [isStatusHelpOpen, setIsStatusHelpOpen] = useState(false);
    const [pendingDeleteSlotId, setPendingDeleteSlotId] = useState<string | null>(null);

    usePageTitle('空き枠管理');

    const loadData = useCallback(async () => {
        if (!token) {
            return;
        }

        const [settingPayload, slotsPayload] = await Promise.all([
            apiRequest<ApiEnvelope<TherapistBookingSettingRecord>>('/me/therapist/scheduled-booking-settings', { token }),
            apiRequest<ApiEnvelope<TherapistAvailabilitySlotRecord[]>>('/me/therapist/availability-slots', { token }),
        ]);

        const nextSetting = unwrapData(settingPayload);
        const nextSlots = unwrapData(slotsPayload);

        setBookingSetting(nextSetting);
        setAvailabilitySlots(nextSlots);
        setLeadTimeMinutes(String(nextSetting.booking_request_lead_time_minutes));
        setBaseLabel(nextSetting.scheduled_base_location?.label ?? '');
        setBaseLat(nextSetting.scheduled_base_location?.lat != null ? String(nextSetting.scheduled_base_location.lat) : '');
        setBaseLng(nextSetting.scheduled_base_location?.lng != null ? String(nextSetting.scheduled_base_location.lng) : '');
        setBaseAccuracy(nextSetting.scheduled_base_location?.accuracy_m != null ? String(nextSetting.scheduled_base_location.accuracy_m) : '');
        setSlotDraft((currentDraft) => {
            if (!currentDraft.public_id) {
                return currentDraft;
            }

            const matched = nextSlots.find((slot) => slot.public_id === currentDraft.public_id);

            return matched
                ? createSlotDraft(matched)
                : createEmptySlotDraft(dateKeyFromLocalValue(currentDraft.start_at) ?? todayDateValue());
        });
    }, [token]);

    useEffect(() => {
        let isMounted = true;

        void loadData()
            .catch((requestError: unknown) => {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError
                        ? requestError.message
                        : '空き枠設定の取得に失敗しました。';

                showError(message);
            })
            .finally(() => {
                if (isMounted) {
                    setIsLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [loadData, showError]);

    const publishedSlots = useMemo(
        () => availabilitySlots.filter((slot) => slot.status === 'published'),
        [availabilitySlots],
    );
    const hiddenSlots = useMemo(
        () => availabilitySlots.filter((slot) => slot.status === 'hidden'),
        [availabilitySlots],
    );
    const nextPublishedSlot = useMemo(
        () => publishedSlots.find((slot) => new Date(slot.end_at).getTime() > Date.now()) ?? null,
        [publishedSlots],
    );
    const selectedSlot = useMemo(
        () => availabilitySlots.find((slot) => slot.public_id === slotDraft.public_id) ?? null,
        [availabilitySlots, slotDraft.public_id],
    );
    const calendarDateKeys = useMemo(
        () => buildCalendarDateKeys(calendarAnchorDate, CALENDAR_DAYS),
        [calendarAnchorDate],
    );
    const calendarDays = useMemo<CalendarDaySummary[]>(
        () => calendarDateKeys.map((date) => {
            const slots = availabilitySlots
                .filter((slot) => dateKeyFromLocalValue(toDateTimeLocalValue(slot.start_at)) === date)
                .sort((left, right) => left.start_at.localeCompare(right.start_at));

            return {
                date,
                slots,
                published_count: slots.filter((slot) => slot.status === 'published').length,
                hidden_count: slots.filter((slot) => slot.status === 'hidden').length,
                first_slot: slots[0] ?? null,
            };
        }),
        [availabilitySlots, calendarDateKeys],
    );
    const selectedCalendarDay = useMemo(
        () => calendarDays.find((day) => day.date === selectedCalendarDate) ?? {
            date: selectedCalendarDate,
            slots: [],
            published_count: 0,
            hidden_count: 0,
            first_slot: null,
        },
        [calendarDays, selectedCalendarDate],
    );
    const timelinePlacements = useMemo(
        () => buildTimelinePlacements(selectedCalendarDay.slots, selectedCalendarDate),
        [selectedCalendarDate, selectedCalendarDay.slots],
    );
    const isSelectedSlotDirty = useMemo(
        () => (selectedSlot ? !slotDraftMatchesSlot(slotDraft, selectedSlot) : false),
        [selectedSlot, slotDraft],
    );
    const draftAreaLabelPreview = useMemo(() => {
        if (!hasSlotSelection) {
            return '枠を選ぶとここに表示されます。';
        }

        if (
            selectedSlot?.dispatch_area_label
            && slotDraft.public_id === selectedSlot.public_id
            && slotDraft.dispatch_base_type === selectedSlot.dispatch_base_type
        ) {
            return selectedSlot.dispatch_area_label;
        }

        return slotDraft.dispatch_base_type === 'custom'
            ? normalizeAreaLabel(slotDraft.custom_dispatch_base_label, '枠専用拠点周辺')
            : normalizeAreaLabel(bookingSetting?.scheduled_base_location?.label, '基本拠点周辺');
    }, [bookingSetting?.scheduled_base_location?.label, hasSlotSelection, selectedSlot, slotDraft]);
    const draftDateKey = hasSlotSelection ? dateKeyFromLocalValue(slotDraft.start_at) : null;
    const draftDurationMinutes = useMemo(
        () => (hasSlotSelection ? durationMinutesBetweenLocalValues(slotDraft.start_at, slotDraft.end_at) : 0),
        [hasSlotSelection, slotDraft.end_at, slotDraft.start_at],
    );
    const draftTimelinePlacement = useMemo(() => {
        if (!hasSlotSelection || !draftDateKey || draftDateKey !== selectedCalendarDate) {
            return null;
        }

        if (slotDraft.public_id && !isSelectedSlotDirty) {
            return null;
        }

        return buildTimelineMetrics(slotDraft.start_at, slotDraft.end_at, selectedCalendarDate);
    }, [draftDateKey, hasSlotSelection, isSelectedSlotDirty, selectedCalendarDate, slotDraft.end_at, slotDraft.public_id, slotDraft.start_at]);
    const timelineRows = useMemo(
        () => Array.from(
            { length: ((TIMELINE_END_HOUR - TIMELINE_START_HOUR) * 60) / TIMELINE_STEP_MINUTES },
            (_, index) => {
                const startMinutes = TIMELINE_START_HOUR * 60 + index * TIMELINE_STEP_MINUTES;

                return {
                    startMinutes,
                    top: index * TIMELINE_ROW_HEIGHT,
                    label: startMinutes % 60 === 0 ? timeStringFromMinutes(startMinutes) : '',
                };
            },
        ),
        [],
    );
    const slotCreationDisabledStartMinutes = useMemo(() => {
        const occupiedRanges = selectedCalendarDay.slots.map((slot) => ({
            startMinutes: minutesOffsetFromDateKey(selectedCalendarDate, toDateTimeLocalValue(slot.start_at)),
            endMinutes: minutesOffsetFromDateKey(selectedCalendarDate, toDateTimeLocalValue(slot.end_at)),
        }));

        return new Set(
            timelineRows
                .filter((row) => {
                    const rowEndMinutes = row.startMinutes + MIN_SLOT_DURATION_MINUTES;

                    return occupiedRanges.some((range) => timeRangeOverlaps(
                        row.startMinutes,
                        rowEndMinutes,
                        range.startMinutes,
                        range.endMinutes,
                    ));
                })
                .map((row) => row.startMinutes),
        );
    }, [selectedCalendarDay.slots, timelineRows]);
    const occupiedRangesExcludingDraft = useMemo(
        () => selectedCalendarDay.slots
            .filter((slot) => slot.public_id !== slotDraft.public_id)
            .map((slot) => ({
                startMinutes: minutesOffsetFromDateKey(selectedCalendarDate, toDateTimeLocalValue(slot.start_at)),
                endMinutes: minutesOffsetFromDateKey(selectedCalendarDate, toDateTimeLocalValue(slot.end_at)),
            }))
            .sort((left, right) => left.startMinutes - right.startMinutes),
        [selectedCalendarDate, selectedCalendarDay.slots, slotDraft.public_id],
    );
    const saveDisabled = isSavingSlot
        || !hasSlotSelection
        || (slotDraft.dispatch_base_type === 'default' && !bookingSetting?.has_scheduled_base_location)
        || draftDurationMinutes < MIN_SLOT_DURATION_MINUTES
        || Boolean(selectedSlot?.has_blocking_booking);
    const slotEditorDisabled = !hasSlotSelection;
    const timelineRowStartMinutesFromPointerPosition = useCallback((clientY: number) => {
        const container = timelineContainerRef.current;

        if (!container) {
            return null;
        }

        const rect = container.getBoundingClientRect();
        const relativeY = Math.max(0, Math.min(clientY - rect.top, rect.height - 1));
        const rowIndex = Math.max(0, Math.min(timelineRows.length - 1, Math.floor(relativeY / TIMELINE_ROW_HEIGHT)));

        return TIMELINE_START_HOUR * 60 + rowIndex * TIMELINE_STEP_MINUTES;
    }, [timelineRows.length]);
    const clampDraftStartMinutes = useCallback((candidateStartMinutes: number, durationMinutes: number) => {
        const maximumStartMinutes = LATEST_TIMELINE_START_MINUTES;
        const boundedCandidate = Math.max(
            TIMELINE_START_HOUR * 60,
            Math.min(candidateStartMinutes, maximumStartMinutes),
        );
        const availableRanges: Array<{ startMinutes: number; endMinutes: number }> = [];
        let cursor = TIMELINE_START_HOUR * 60;

        occupiedRangesExcludingDraft.forEach((range) => {
            const availableEnd = Math.min(range.startMinutes - durationMinutes, maximumStartMinutes);

            if (availableEnd >= cursor) {
                availableRanges.push({
                    startMinutes: cursor,
                    endMinutes: availableEnd,
                });
            }

            cursor = Math.max(cursor, range.endMinutes);
        });

        if (maximumStartMinutes >= cursor) {
            availableRanges.push({
                startMinutes: cursor,
                endMinutes: maximumStartMinutes,
            });
        }

        const containingRange = availableRanges.find((range) => (
            boundedCandidate >= range.startMinutes && boundedCandidate <= range.endMinutes
        ));

        if (containingRange) {
            return boundedCandidate;
        }

        if (availableRanges.length === 0) {
            return boundedCandidate;
        }

        return availableRanges.reduce((nearestMinutes, range) => {
            const candidates = [range.startMinutes, range.endMinutes];

            return candidates.reduce((bestMinutes, currentMinutes) => (
                Math.abs(currentMinutes - boundedCandidate) < Math.abs(bestMinutes - boundedCandidate)
                    ? currentMinutes
                    : bestMinutes
            ), nearestMinutes);
        }, availableRanges[0].startMinutes);
    }, [occupiedRangesExcludingDraft]);
    const resizeDraftFromPointerPosition = useCallback((clientY: number) => {
        const rowStartMinutes = timelineRowStartMinutesFromPointerPosition(clientY);

        if (rowStartMinutes === null) {
            return;
        }

        setSlotDraft((current) => {
            const resized = resizeTimelineDraft(current, selectedCalendarDate, rowStartMinutes);
            const currentStartMinutes = minutesOffsetFromDateKey(selectedCalendarDate, resized.start_at);
            const resizedEndMinutes = minutesOffsetFromDateKey(selectedCalendarDate, resized.end_at);
            const nextOccupiedStartMinutes = occupiedRangesExcludingDraft
                .map((range) => range.startMinutes)
                .filter((startMinutes) => startMinutes > currentStartMinutes)
                .sort((left, right) => left - right)[0] ?? null;

            if (nextOccupiedStartMinutes === null || resizedEndMinutes <= nextOccupiedStartMinutes) {
                return resized;
            }

            return {
                ...resized,
                end_at: buildLocalDateTime(selectedCalendarDate, nextOccupiedStartMinutes),
            };
        });
    }, [occupiedRangesExcludingDraft, selectedCalendarDate, timelineRowStartMinutesFromPointerPosition]);
    const moveDraftFromPointerPosition = useCallback((clientY: number, pointerOffsetMinutes: number) => {
        const rowStartMinutes = timelineRowStartMinutesFromPointerPosition(clientY);

        if (rowStartMinutes === null) {
            return;
        }

        setSlotDraft((current) => {
            const durationMinutes = durationMinutesBetweenLocalValues(current.start_at, current.end_at);
            const nextStartMinutes = clampDraftStartMinutes(rowStartMinutes - pointerOffsetMinutes, durationMinutes);

            return {
                ...current,
                start_at: buildLocalDateTime(selectedCalendarDate, nextStartMinutes),
                end_at: buildLocalDateTime(selectedCalendarDate, nextStartMinutes + durationMinutes),
            };
        });
    }, [clampDraftStartMinutes, selectedCalendarDate, timelineRowStartMinutesFromPointerPosition]);

    useEffect(() => {
        if (!activeDraftDrag) {
            return;
        }

        const handlePointerMove = (event: PointerEvent) => {
            if (activeDraftDrag.mode === 'resize') {
                resizeDraftFromPointerPosition(event.clientY);
                return;
            }

            moveDraftFromPointerPosition(event.clientY, activeDraftDrag.pointerOffsetMinutes);
        };
        const handlePointerUp = () => {
            setActiveDraftDrag(null);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
        document.body.style.cursor = activeDraftDrag.mode === 'resize' ? 'ns-resize' : 'grab';
        document.body.style.userSelect = 'none';

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [activeDraftDrag, moveDraftFromPointerPosition, resizeDraftFromPointerPosition]);

    async function handleSettingsSave(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token) {
            return;
        }

        setIsSavingSetting(true);

        try {
            await apiRequest<ApiEnvelope<TherapistBookingSettingRecord>>('/me/therapist/scheduled-booking-settings', {
                method: 'PUT',
                token,
                body: {
                    booking_request_lead_time_minutes: Number(leadTimeMinutes),
                    scheduled_base_location: {
                        label: baseLabel || null,
                        lat: baseLat.trim() === '' ? null : Number(baseLat),
                        lng: baseLng.trim() === '' ? null : Number(baseLng),
                        accuracy_m: baseAccuracy ? Number(baseAccuracy) : null,
                    },
                },
            });

            await loadData();
            showSuccess('予定予約の基本設定を更新しました。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '基本設定の保存に失敗しました。';

            showError(message);
        } finally {
            setIsSavingSetting(false);
        }
    }

    async function handleSlotSave(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!token || !hasSlotSelection) {
            return;
        }

        setIsSavingSlot(true);

        try {
            const body = {
                start_at: fromDateTimeLocalValue(slotDraft.start_at),
                end_at: fromDateTimeLocalValue(slotDraft.end_at),
                status: slotDraft.status,
                dispatch_base_type: slotDraft.dispatch_base_type,
                ...(slotDraft.dispatch_base_type === 'custom'
                    ? {
                        custom_dispatch_base: {
                            label: slotDraft.custom_dispatch_base_label || null,
                            lat: slotDraft.custom_dispatch_base_lat.trim() === '' ? null : Number(slotDraft.custom_dispatch_base_lat),
                            lng: slotDraft.custom_dispatch_base_lng.trim() === '' ? null : Number(slotDraft.custom_dispatch_base_lng),
                            accuracy_m: slotDraft.custom_dispatch_base_accuracy_m
                                ? Number(slotDraft.custom_dispatch_base_accuracy_m)
                                : null,
                        },
                    }
                    : {}),
            };

            if (slotDraft.public_id) {
                await apiRequest<ApiEnvelope<TherapistAvailabilitySlotRecord>>(`/me/therapist/availability-slots/${slotDraft.public_id}`, {
                    method: 'PATCH',
                    token,
                    body,
                });

                await loadData();
                showSuccess('空き枠を更新しました。');
                return;
            }

            await apiRequest<ApiEnvelope<TherapistAvailabilitySlotRecord>>('/me/therapist/availability-slots', {
                method: 'POST',
                token,
                body,
            });

            await loadData();
            setSlotDraft(createEmptySlotDraft(selectedCalendarDate));
            setHasSlotSelection(false);
            setActiveDraftDrag(null);
            showSuccess('空き枠を追加しました。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '空き枠の保存に失敗しました。';

            showError(message);
        } finally {
            setIsSavingSlot(false);
        }
    }

    async function handleDeleteSlot(slot: TherapistAvailabilitySlotRecord) {
        if (!token) {
            return;
        }

        if (!window.confirm(`「${formatDateTime(slot.start_at)} - ${formatDateTime(slot.end_at)}」の枠を削除しますか？`)) {
            return;
        }

        setPendingDeleteSlotId(slot.public_id);

        try {
            await apiRequest<null>(`/me/therapist/availability-slots/${slot.public_id}`, {
                method: 'DELETE',
                token,
            });

            await loadData();

            if (slotDraft.public_id === slot.public_id) {
                setSlotDraft(createEmptySlotDraft(selectedCalendarDate));
                setHasSlotSelection(false);
                setActiveDraftDrag(null);
            }

            showSuccess('空き枠を削除しました。');
        } catch (requestError) {
            const message =
                requestError instanceof ApiError
                    ? requestError.message
                    : '空き枠の削除に失敗しました。';

            showError(message);
        } finally {
            setPendingDeleteSlotId(null);
        }
    }

    function handleUseCurrentLocation(target: 'base' | 'custom') {
        if (!navigator.geolocation) {
            showError('このブラウザでは現在地取得を利用できません。');
            return;
        }

        if (target === 'base') {
            setIsLocatingBase(true);
        } else {
            setIsLocatingCustom(true);
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const latitude = position.coords.latitude.toFixed(6);
                const longitude = position.coords.longitude.toFixed(6);

                if (target === 'base') {
                    setBaseLat(latitude);
                    setBaseLng(longitude);
                    setBaseAccuracy(String(Math.round(position.coords.accuracy)));
                    setIsLocatingBase(false);
                    showSuccess('予定予約の基本拠点に現在地のピン位置を反映しました。');
                    return;
                }

                setSlotDraft((current) => ({
                    ...current,
                    custom_dispatch_base_lat: latitude,
                    custom_dispatch_base_lng: longitude,
                    custom_dispatch_base_accuracy_m: String(Math.round(position.coords.accuracy)),
                }));
                setIsLocatingCustom(false);
                showSuccess('枠専用拠点に現在地のピン位置を反映しました。');
            },
            () => {
                showError('現在地の取得に失敗しました。地図の位置を手動で調整してください。');

                if (target === 'base') {
                    setIsLocatingBase(false);
                } else {
                    setIsLocatingCustom(false);
                }
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
            },
        );
    }

    function handleShiftCalendar(days: number) {
        const nextAnchor = addDaysToDateKey(calendarAnchorDate, days);
        const nextCalendarDateKeys = buildCalendarDateKeys(nextAnchor, CALENDAR_DAYS);

        setCalendarAnchorDate(nextAnchor);

        if (!nextCalendarDateKeys.includes(selectedCalendarDate)) {
            setSelectedCalendarDate(nextAnchor);
        }
    }

    function handleSelectCalendarDate(date: string) {
        setSelectedCalendarDate(date);
    }

    function handleSelectExistingSlot(slot: TherapistAvailabilitySlotRecord) {
        const slotDate = dateKeyFromLocalValue(toDateTimeLocalValue(slot.start_at)) ?? todayDateValue();

        setSelectedCalendarDate(slotDate);

        if (!calendarDateKeys.includes(slotDate)) {
            setCalendarAnchorDate(slotDate);
        }

        setSlotDraft(createSlotDraft(slot));
        setHasSlotSelection(true);
        setActiveDraftDrag(null);
    }

    function handleCreateFromTimeline(startMinutes: number) {
        setSlotDraft((current) => createTimelineDraft(selectedCalendarDate, startMinutes, current));
        setHasSlotSelection(true);
        setActiveDraftDrag(null);
    }

    function handleStartDateTimeChange(nextValue: string) {
        setSlotDraft((current) => {
            const nextStart = nextValue;
            const currentEnd = parseJstDateTimeLocalInput(current.end_at);
            const nextStartDate = parseJstDateTimeLocalInput(nextStart);
            const minimumEndDate = nextStartDate ? new Date(nextStartDate.getTime()) : null;

            if (minimumEndDate) {
                minimumEndDate.setUTCMinutes(minimumEndDate.getUTCMinutes() + MIN_SLOT_DURATION_MINUTES);
            }

            if (
                !currentEnd
                || !nextStartDate
                || !minimumEndDate
                || currentEnd.getTime() < minimumEndDate.getTime()
            ) {
                return {
                    ...current,
                    start_at: nextStart,
                    end_at: addMinutesToLocalValue(nextStart, MIN_SLOT_DURATION_MINUTES),
                };
            }

            return {
                ...current,
                start_at: nextStart,
            };
        });

        const nextDate = dateKeyFromLocalValue(nextValue);

        if (nextDate) {
            setSelectedCalendarDate(nextDate);

            if (!calendarDateKeys.includes(nextDate)) {
                setCalendarAnchorDate(nextDate);
            }
        }
    }

    function handleEndDateTimeChange(nextValue: string) {
        setSlotDraft((current) => {
            const currentStart = parseJstDateTimeLocalInput(current.start_at);
            const nextEnd = parseJstDateTimeLocalInput(nextValue);

            if (!currentStart || !nextEnd) {
                return {
                    ...current,
                    end_at: nextValue,
                };
            }

            const minimumEnd = new Date(currentStart.getTime());
            minimumEnd.setUTCMinutes(minimumEnd.getUTCMinutes() + MIN_SLOT_DURATION_MINUTES);

            if (nextEnd.getTime() < minimumEnd.getTime()) {
                return {
                    ...current,
                    end_at: formatJstDateTimeLocalValue(minimumEnd.toISOString()),
                };
            }

            return {
                ...current,
                end_at: nextValue,
            };
        });
    }

    function handleDraftResizeHandlePointerDown(event: ReactPointerEvent<HTMLElement>) {
        event.preventDefault();
        event.stopPropagation();

        if (!hasSlotSelection || selectedSlot?.has_blocking_booking) {
            return;
        }

        resizeDraftFromPointerPosition(event.clientY);
        setActiveDraftDrag({ mode: 'resize' });
    }

    function handleDraftMovePointerDown(event: ReactPointerEvent<HTMLElement>) {
        event.preventDefault();
        event.stopPropagation();

        if (!hasSlotSelection || selectedSlot?.has_blocking_booking) {
            return;
        }

        const pointerStartMinutes = timelineRowStartMinutesFromPointerPosition(event.clientY);

        if (pointerStartMinutes === null) {
            return;
        }

        const draftStartMinutes = minutesOffsetFromDateKey(selectedCalendarDate, slotDraft.start_at);
        const pointerOffsetMinutes = Math.max(
            0,
            Math.min(pointerStartMinutes - draftStartMinutes, Math.max(draftDurationMinutes - TIMELINE_STEP_MINUTES, 0)),
        );

        setActiveDraftDrag({
            mode: 'move',
            pointerOffsetMinutes,
        });
    }

    if (isLoading) {
        return <LoadingScreen title="空き枠設定を読み込み中" message="予定予約の基本設定と公開中の枠をまとめています。" />;
    }

    return (
        <div className="min-w-0 space-y-8 overflow-x-hidden">
            <section className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-6 md:p-8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">空き枠管理</p>
                        <h1 className="text-3xl font-semibold text-white">カレンダーで空き枠を作る</h1>
                        <p className="max-w-3xl text-sm leading-7 text-slate-300">
                            日付を選んで、タイムラインを押すと開始時刻が入ります。出てきた枠の下中央ハンドルをドラッグして長さを決め、右側で公開状態と拠点を整えます。
                        </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-[#111923] px-5 py-4 text-sm text-slate-200">
                            <p className="text-xs font-semibold tracking-wide text-rose-200">公開中</p>
                            <p className="mt-2 text-3xl font-semibold text-white">{publishedSlots.length}</p>
                            <p className="mt-2 text-xs text-slate-400">予定予約で見える枠</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-[#111923] px-5 py-4 text-sm text-slate-200">
                            <p className="text-xs font-semibold tracking-wide text-rose-200">非公開</p>
                            <p className="mt-2 text-3xl font-semibold text-white">{hiddenSlots.length}</p>
                            <p className="mt-2 text-xs text-slate-400">あとで出せる下書き</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-[#111923] px-5 py-4 text-sm text-slate-200">
                            <p className="text-xs font-semibold tracking-wide text-rose-200">次の公開枠</p>
                            <p className="mt-2 text-lg font-semibold text-white">{slotSummary(nextPublishedSlot)}</p>
                            <p className="mt-2 text-xs text-slate-400">{nextPublishedSlot ? formatCalendarLabel(dateKeyFromLocalValue(toDateTimeLocalValue(nextPublishedSlot.start_at)) ?? todayDateValue()) : 'まだ未設定'}</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-slate-200">
                        受付締切: {leadTimeLabel(Number(leadTimeMinutes))}
                    </span>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-slate-200">
                        基本拠点: {bookingSetting?.has_scheduled_base_location ? '設定済み' : '未設定'}
                    </span>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-slate-200">
                        予約付きで編集不可: {availabilitySlots.filter((slot) => slot.has_blocking_booking).length}件
                    </span>
                </div>

                <div className="flex flex-wrap gap-3">
                    <Link
                        to="/therapist/onboarding"
                        className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                    >
                        準備状況へ戻る
                    </Link>
                    <Link
                        to="/therapist/profile"
                        className="inline-flex items-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                    >
                        プロフィールへ
                    </Link>
                </div>
            </section>

            <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <form onSubmit={handleSettingsSave} className="min-w-0 space-y-5 rounded-[24px] border border-white/10 bg-white/5 p-6">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">予定予約設定</p>
                        <h2 className="text-xl font-semibold text-white">予定予約の基本設定</h2>
                        <p className="text-sm leading-7 text-slate-300">
                            基本の出動拠点と受付締切を先に整えると、デフォルト拠点の枠をすぐ増やせます。
                        </p>
                    </div>

                    <div className="max-w-[240px] space-y-2">
                        <label className="space-y-2">
                            <span className="flex items-center gap-2 text-sm font-semibold text-white">
                                <span>受付締切（分）</span>
                                <span className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setIsLeadTimeHelpOpen((current) => !current)}
                                        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-[#111923] text-xs font-semibold text-slate-200 transition hover:bg-[#16212d]"
                                        aria-expanded={isLeadTimeHelpOpen}
                                        aria-label="受付締切の補足を表示"
                                    >
                                        ?
                                    </button>
                                    {isLeadTimeHelpOpen ? (
                                        <div className="absolute left-0 top-full z-20 mt-2 w-[260px] rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm leading-7 text-slate-300 shadow-[0_16px_40px_rgba(0,0,0,0.32)]">
                                            開始時刻の <span className="font-semibold text-white">{leadTimeLabel(Number(leadTimeMinutes))}</span> 前まで予約リクエストを受け付けます。
                                        </div>
                                    ) : null}
                                </span>
                            </span>
                            <input
                                type="number"
                                min={15}
                                max={10080}
                                step={15}
                                value={leadTimeMinutes}
                                onChange={(event) => setLeadTimeMinutes(event.target.value)}
                                className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                            />
                        </label>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-white">拠点ラベル</span>
                            <input
                                value={baseLabel}
                                onChange={(event) => setBaseLabel(event.target.value)}
                                className="w-full rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm text-white outline-none transition focus:border-rose-300/50"
                                placeholder="例: 新宿ベース / 平日拠点"
                            />
                        </label>

                        <div className="flex items-end">
                            <button
                                type="button"
                                onClick={() => handleUseCurrentLocation('base')}
                                disabled={isLocatingBase}
                                className="inline-flex items-center rounded-full border border-white/10 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isLocatingBase ? '取得中...' : '現在地を使う'}
                            </button>
                        </div>
                    </div>

                    <LocationPreviewEditor
                        label="基本拠点"
                        latValue={baseLat}
                        lngValue={baseLng}
                        accuracyValue={baseAccuracy}
                        onLatChange={setBaseLat}
                        onLngChange={setBaseLng}
                        onAccuracyChange={setBaseAccuracy}
                        searchToken={token}
                    />

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-4 text-sm text-slate-300">
                        <p className="font-semibold text-white">自動で表示される公開エリア</p>
                        <p className="mt-2 leading-7">
                            基本拠点を使う枠は <span className="font-semibold text-white">{normalizeAreaLabel(baseLabel, '基本拠点周辺')}</span> のように表示されます。
                        </p>
                    </div>

                    <button
                        type="submit"
                        disabled={isSavingSetting}
                        className="inline-flex items-center rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isSavingSetting ? '保存中...' : '基本設定を保存する'}
                    </button>
                </form>

                <article className="min-w-0 space-y-4 rounded-[24px] border border-white/10 bg-white/5 p-6">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">要点</p>
                        <h2 className="text-xl font-semibold text-white">公開状況</h2>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                        <p className="text-sm font-semibold text-white">基本拠点</p>
                        <p className="mt-2 text-sm text-slate-300">
                            {bookingSetting?.has_scheduled_base_location
                                ? (bookingSetting.scheduled_base_location?.label ?? 'ラベル未設定')
                                : '未設定'}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                        <p className="text-sm font-semibold text-white">今週の公開数</p>
                        <p className="mt-2 text-sm text-slate-300">
                            {calendarDays.reduce((total, day) => total + day.published_count, 0)}件
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                        <p className="text-sm font-semibold text-white">次の公開枠</p>
                        <p className="mt-2 text-sm text-slate-300">
                            {nextPublishedSlot
                                ? `${formatDateTime(nextPublishedSlot.start_at)} - ${formatDateTime(nextPublishedSlot.end_at)}`
                                : '未公開'}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-3">
                        <p className="text-sm font-semibold text-white">編集できない枠</p>
                        <p className="mt-2 text-sm text-slate-300">
                            {availabilitySlots.filter((slot) => slot.has_blocking_booking).length}件
                        </p>
                        <p className="mt-2 text-xs text-slate-400">
                            予約が紐づいた枠は時間変更と削除ができません。
                        </p>
                    </div>
                </article>
            </section>

            <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
                <section className="min-w-0 space-y-5 rounded-[24px] border border-white/10 bg-white/5 p-6">
                    <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold tracking-wide text-rose-200">公開カレンダー</p>
                            <h2 className="text-xl font-semibold text-white">今週の空き枠をカレンダーで確認</h2>
                            <p className="text-sm leading-7 text-slate-300">
                                まず開始したい時間を押すと1時間枠が入ります。既存枠はそのままドラッグで移動でき、下中央のハンドルでは長さを調整できます。
                            </p>
                        </div>

                        <div className="flex flex-nowrap items-center gap-2 self-start md:self-auto">
                            <button
                                type="button"
                                onClick={() => handleShiftCalendar(-CALENDAR_DAYS)}
                                className="inline-flex items-center whitespace-nowrap rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                            >
                                前の週
                            </button>
                            <button
                                type="button"
                                onClick={() => handleShiftCalendar(CALENDAR_DAYS)}
                                className="inline-flex items-center whitespace-nowrap rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
                            >
                                次の週
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-7 gap-1.5 sm:gap-3">
                        {calendarDays.map((day) => {
                            const isSelected = day.date === selectedCalendarDate;
                            const hasAnySlots = day.slots.length > 0;

                            return (
                                <button
                                    key={day.date}
                                    type="button"
                                    onClick={() => handleSelectCalendarDate(day.date)}
                                    className={[
                                        'relative min-w-0 rounded-[18px] border px-1 py-3 text-center transition sm:rounded-[22px] sm:px-4 sm:py-4',
                                        isSelected
                                            ? 'border-rose-300/40 bg-[#131d28]'
                                            : 'border-white/10 bg-[#111923] hover:bg-[#16212d]',
                                    ].join(' ')}
                                >
                                    {hasAnySlots ? (
                                        <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgba(16,185,129,0.12)] sm:right-3 sm:top-3 sm:h-3 sm:w-3 sm:shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" />
                                    ) : null}
                                    <div className="flex min-h-[72px] flex-col items-center justify-center gap-1.5 sm:min-h-[88px] sm:gap-3">
                                        <div className="min-w-0 text-center">
                                            <p className={`text-[10px] font-semibold ${calendarWeekdayTone(day.date)} sm:text-xs`}>
                                                {formatCalendarWeekday(day.date)}
                                            </p>
                                            <p className="mt-1 whitespace-nowrap text-[1.55rem] font-semibold leading-none text-white sm:mt-2 sm:text-4xl">
                                                {formatCalendarDayNumber(day.date)}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <div className="min-w-0 space-y-3 rounded-[24px] border border-white/10 bg-[#111923] p-5">
                        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                            <div>
                                <p className="text-xs font-semibold tracking-wide text-rose-200">選択中の日</p>
                                <h3 className="mt-1 text-base font-semibold text-white sm:text-lg">{formatCalendarLabel(selectedCalendarDate)}</h3>
                            </div>
                            <div className="text-sm text-slate-400">
                                クリックで新規作成、枠ドラッグで移動、ハンドルで長さ調整
                            </div>
                        </div>

                        <div className="grid min-w-0 grid-cols-[48px_minmax(0,1fr)] gap-2 sm:grid-cols-[88px_minmax(0,1fr)] sm:gap-4">
                            <div className="min-w-0 pt-2">
                                {timelineRows.map((row) => (
                                    <div
                                        key={row.startMinutes}
                                        style={{ height: `${TIMELINE_ROW_HEIGHT}px` }}
                                        className="flex items-start pr-2 text-[11px] text-slate-500 sm:pr-3 sm:text-xs"
                                    >
                                        {row.label ? row.label : ''}
                                    </div>
                                ))}
                            </div>

                            <div
                                ref={timelineContainerRef}
                                className="relative min-w-0 overflow-hidden rounded-[22px] border border-white/10 bg-[#0f1720]"
                                style={{ height: `${timelineRows.length * TIMELINE_ROW_HEIGHT}px` }}
                            >
                                {timelineRows.map((row) => {
                                    const disabled = row.startMinutes > LATEST_TIMELINE_START_MINUTES
                                        || slotCreationDisabledStartMinutes.has(row.startMinutes);

                                    return (
                                        <button
                                            key={`cell-${row.startMinutes}`}
                                            type="button"
                                            onClick={() => handleCreateFromTimeline(row.startMinutes)}
                                            disabled={disabled}
                                            style={{ top: `${row.top}px`, height: `${TIMELINE_ROW_HEIGHT}px` }}
                                            className={[
                                                'absolute inset-x-0 border-t border-white/5 transition',
                                                disabled ? 'cursor-not-allowed opacity-30' : 'hover:bg-white/5',
                                            ].join(' ')}
                                            aria-label={`${formatCalendarLabel(selectedCalendarDate)} ${timeStringFromMinutes(row.startMinutes)} から枠を作成`}
                                        />
                                    );
                                })}

                                {timelinePlacements.map((placement) => {
                                    const isSelected = placement.slot.public_id === slotDraft.public_id;
                                    const isDeleting = pendingDeleteSlotId === placement.slot.public_id;
                                    const showInlineResizeHandle = isSelected && !placement.slot.has_blocking_booking && !draftTimelinePlacement;

                                    return (
                                        <button
                                            key={placement.slot.public_id}
                                            type="button"
                                            onClick={isSelected ? undefined : () => handleSelectExistingSlot(placement.slot)}
                                            onPointerDown={isSelected ? handleDraftMovePointerDown : undefined}
                                            style={{ top: `${placement.top}px`, height: `${placement.height}px` }}
                                            className={[
                                                'absolute left-3 right-3 overflow-hidden rounded-[18px] border px-4 py-3 text-left shadow-[0_10px_24px_rgba(0,0,0,0.18)] transition',
                                                placement.slot.status === 'published'
                                                    ? 'border-emerald-400/30 bg-emerald-400/12 hover:bg-emerald-400/18'
                                                    : 'border-white/10 bg-[#172330] hover:bg-[#1b2a38]',
                                                isSelected ? 'ring-2 ring-rose-300/60' : '',
                                                isDeleting ? 'opacity-50' : '',
                                            ].join(' ')}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-semibold text-white">
                                                        {formatTime(placement.slot.start_at)} - {formatTime(placement.slot.end_at)}
                                                    </p>
                                                    <p className="mt-1 truncate whitespace-nowrap text-xs text-slate-200">
                                                        {slotBaseSummary(placement.slot, bookingSetting)}
                                                    </p>
                                                </div>
                                                <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${slotStatusTone(placement.slot.status)}`}>
                                                    {slotStatusLabel(placement.slot.status)}
                                                </span>
                                            </div>
                                            {placement.slot.has_blocking_booking ? (
                                                <p className="mt-2 truncate text-[11px] text-slate-300">予約あり</p>
                                            ) : null}
                                            {showInlineResizeHandle ? (
                                                <div
                                                    onPointerDown={handleDraftResizeHandlePointerDown}
                                                    className="absolute left-1/2 bottom-1 z-10 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-rose-100/80 bg-rose-200 text-sm font-semibold text-slate-950 shadow-[0_10px_24px_rgba(0,0,0,0.24)] transition hover:bg-white active:scale-95"
                                                    aria-hidden="true"
                                                >
                                                    ↓
                                                </div>
                                            ) : null}
                                        </button>
                                    );
                                })}

                                {draftTimelinePlacement ? (
                                    <div
                                        style={{ top: `${draftTimelinePlacement.top}px`, height: `${draftTimelinePlacement.height}px` }}
                                        onPointerDown={slotDraft.public_id ? handleDraftMovePointerDown : undefined}
                                        className={[
                                            'absolute left-2 right-2 rounded-[20px] border border-dashed border-rose-300/60 bg-rose-300/10',
                                            slotDraft.public_id ? 'pointer-events-auto cursor-grab active:cursor-grabbing' : 'pointer-events-none',
                                        ].join(' ')}
                                    >
                                        <div className="absolute inset-x-3 top-3 flex items-center justify-between text-xs text-rose-100">
                                            <span>{slotDraft.start_at ? slotDraft.start_at.slice(11, 16) : '--:--'} - {slotDraft.end_at ? slotDraft.end_at.slice(11, 16) : '--:--'}</span>
                                            <span>{slotDraft.public_id ? '変更案' : durationLabel(draftDurationMinutes)}</span>
                                        </div>
                                        {slotDraft.public_id ? (
                                            <div className="absolute inset-x-3 bottom-4 text-xs text-rose-100">
                                                <p className="truncate whitespace-nowrap">{draftBaseSummary(slotDraft, bookingSetting)}</p>
                                            </div>
                                        ) : null}
                                        {!selectedSlot?.has_blocking_booking ? (
                                            <button
                                                type="button"
                                                onPointerDown={handleDraftResizeHandlePointerDown}
                                                className="pointer-events-auto absolute left-1/2 bottom-0 flex h-9 w-9 -translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full border border-rose-100/80 bg-rose-200 text-lg font-semibold text-slate-950 shadow-[0_10px_24px_rgba(0,0,0,0.24)] transition hover:bg-white active:scale-95"
                                                aria-label="枠の長さをドラッグして変更"
                                            >
                                                ↓
                                            </button>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-[#0f1720] px-4 py-3 text-sm leading-7 text-slate-300">
                            公開エリア名は拠点ラベルから自動で作成します。細かい文言を毎回入れなくても、公開側では「{draftAreaLabelPreview}」のように表示されます。
                        </div>
                    </div>
                </section>

                <form onSubmit={handleSlotSave} className="min-w-0 space-y-5 rounded-[24px] border border-white/10 bg-white/5 p-6">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">
                            {!hasSlotSelection ? '未選択' : slotDraft.public_id ? '枠を編集' : '新しい枠'}
                        </p>
                        <h2 className="text-xl font-semibold text-white">
                            {!hasSlotSelection ? '時間を選んで枠を作成' : slotDraft.public_id ? '選択中の枠を編集' : '選んだ時間で枠を作成'}
                        </h2>
                        <p className="text-sm leading-7 text-slate-300">
                            {!hasSlotSelection
                                ? '左のカレンダーで時間帯を押すと新しい枠を作れます。既存枠を選ぶと、移動や長さ変更もここから確定できます。'
                                : 'タイムラインで新規枠を作るか、既存枠をドラッグして変更案を作成できます。右側では公開状態と使う拠点を整えます。'}
                        </p>
                    </div>

                    <div className="rounded-[22px] border border-white/10 bg-[#111923] px-4 py-4">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">開始時刻</p>
                        <p className="mt-2 text-base font-semibold text-white sm:text-lg">
                            {hasSlotSelection
                                ? `${formatCalendarLabel(draftDateKey ?? selectedCalendarDate)} ${slotDraft.start_at ? slotDraft.start_at.slice(11, 16) : '--:--'}`
                                : 'まだ選択していません'}
                        </p>
                        <p className="mt-2 text-xs text-slate-400">
                            {hasSlotSelection
                                ? '左のカレンダーで移動と長さ変更ができます。更新ボタンで確定します。'
                                : '左のカレンダーで開始時間を押すか、既存枠を選ぶと編集できます。'}
                        </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-white">開始日時</span>
                            <input
                                type="datetime-local"
                                step={900}
                                value={hasSlotSelection ? slotDraft.start_at : ''}
                                onChange={(event) => handleStartDateTimeChange(event.target.value)}
                                className="min-w-0 w-full rounded-[18px] border border-white/10 bg-[#111923] px-3 py-3 text-xs text-white outline-none transition focus:border-rose-300/50 sm:px-4 sm:text-sm"
                                required={hasSlotSelection}
                                disabled={slotEditorDisabled}
                            />
                        </label>

                        <label className="space-y-2">
                            <span className="text-sm font-semibold text-white">終了日時</span>
                            <input
                                type="datetime-local"
                                step={900}
                                value={hasSlotSelection ? slotDraft.end_at : ''}
                                onChange={(event) => handleEndDateTimeChange(event.target.value)}
                                className="min-w-0 w-full rounded-[18px] border border-white/10 bg-[#111923] px-3 py-3 text-xs text-white outline-none transition focus:border-rose-300/50 sm:px-4 sm:text-sm"
                                required={hasSlotSelection}
                                disabled={slotEditorDisabled}
                            />
                        </label>
                    </div>

                    <div className="space-y-2">
                        <label className="space-y-2">
                            <span className="flex items-center gap-2 text-sm font-semibold text-white">
                                <span>公開状態</span>
                                <span className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setIsStatusHelpOpen((current) => !current)}
                                        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-[#111923] text-xs font-semibold text-slate-200 transition hover:bg-[#16212d]"
                                        aria-expanded={isStatusHelpOpen}
                                        aria-label="公開状態の補足を表示"
                                    >
                                        ?
                                    </button>
                                    {isStatusHelpOpen ? (
                                        <div className="absolute left-0 top-full z-20 mt-2 w-[260px] rounded-[18px] border border-white/10 bg-[#111923] px-4 py-3 text-sm leading-7 text-slate-300 shadow-[0_16px_40px_rgba(0,0,0,0.32)]">
                                            公開すると利用者の空き時間画面に表示されます。非公開は下書き保存です。空き枠の長さは最低 {durationLabel(MIN_SLOT_DURATION_MINUTES)} です。
                                        </div>
                                    ) : null}
                                </span>
                            </span>
                            <select
                                value={slotDraft.status}
                                onChange={(event) => setSlotDraft((current) => ({ ...current, status: event.target.value as SlotDraft['status'] }))}
                                className="min-w-0 w-full rounded-[18px] border border-white/10 bg-[#111923] px-3 py-3 text-xs text-white outline-none transition focus:border-rose-300/50 sm:px-4 sm:text-sm"
                                disabled={slotEditorDisabled}
                            >
                                <option value="published">公開する</option>
                                <option value="hidden">非公開で保存</option>
                            </select>
                        </label>
                    </div>

                    <div className="space-y-3">
                        <p className="text-sm font-semibold text-white">使う拠点</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {[
                                { value: 'default', label: '基本拠点', description: '上で設定した標準の出動拠点を使います。' },
                                { value: 'custom', label: '枠専用拠点', description: 'この枠だけ別の拠点を使います。' },
                            ].map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setSlotDraft((current) => ({ ...current, dispatch_base_type: option.value as SlotDraft['dispatch_base_type'] }))}
                                    disabled={slotEditorDisabled}
                                    className={[
                                        'rounded-[20px] border px-4 py-4 text-left transition',
                                        slotDraft.dispatch_base_type === option.value
                                            ? 'border-rose-300/40 bg-[#131d28]'
                                            : 'border-white/10 bg-[#111923] hover:bg-[#16212d]',
                                        slotEditorDisabled ? 'cursor-not-allowed opacity-50' : '',
                                    ].join(' ')}
                                >
                                    <p className="text-sm font-semibold text-white">{option.label}</p>
                                    <p className="mt-2 text-sm leading-6 text-slate-400">{option.description}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {slotDraft.dispatch_base_type === 'default' || slotEditorDisabled ? (
                        <div className="rounded-2xl border border-white/10 bg-[#111923] px-4 py-4 text-sm leading-7 text-slate-300">
                            {!hasSlotSelection
                                ? 'まずは左のカレンダーで時間帯を選んでください。'
                                : bookingSetting?.has_scheduled_base_location
                                ? `現在の基本拠点: ${bookingSetting.scheduled_base_location?.label ?? 'ラベル未設定'}`
                                : 'まだ基本拠点がありません。上の予定予約設定を先に保存してください。'}
                        </div>
                    ) : (
                        <div className="space-y-4 rounded-[22px] border border-white/10 bg-[#111923] p-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-white">枠専用の出動拠点</p>
                                <button
                                    type="button"
                                    onClick={() => handleUseCurrentLocation('custom')}
                                    disabled={isLocatingCustom || slotEditorDisabled}
                                    className="inline-flex items-center rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isLocatingCustom ? '取得中...' : '現在地を使う'}
                                </button>
                            </div>

                            <label className="space-y-2">
                                <span className="text-sm font-semibold text-white">拠点ラベル</span>
                                <input
                                    value={slotDraft.custom_dispatch_base_label}
                                    onChange={(event) => setSlotDraft((current) => ({ ...current, custom_dispatch_base_label: event.target.value }))}
                                    className="min-w-0 w-full rounded-[18px] border border-white/10 bg-transparent px-3 py-3 text-xs text-white outline-none transition focus:border-rose-300/50 sm:px-4 sm:text-sm"
                                    placeholder="例: 渋谷サテライト / 週末拠点"
                                    disabled={slotEditorDisabled}
                                />
                            </label>

                            <LocationPreviewEditor
                                label="枠専用拠点"
                                latValue={slotDraft.custom_dispatch_base_lat}
                                lngValue={slotDraft.custom_dispatch_base_lng}
                                accuracyValue={slotDraft.custom_dispatch_base_accuracy_m}
                                onLatChange={(value) => setSlotDraft((current) => ({ ...current, custom_dispatch_base_lat: value }))}
                                onLngChange={(value) => setSlotDraft((current) => ({ ...current, custom_dispatch_base_lng: value }))}
                                onAccuracyChange={(value) => setSlotDraft((current) => ({ ...current, custom_dispatch_base_accuracy_m: value }))}
                                fallbackLatValue={baseLat}
                                fallbackLngValue={baseLng}
                                searchToken={token}
                                disabled={slotEditorDisabled}
                            />
                        </div>
                    )}

                    <div className="rounded-[22px] border border-white/10 bg-[#111923] px-4 py-4">
                        <p className="text-xs font-semibold tracking-wide text-rose-200">公開エリア表示</p>
                        <p className="mt-2 text-lg font-semibold text-white">{draftAreaLabelPreview}</p>
                        <p className="mt-2 text-xs leading-6 text-slate-400">
                            公開側ではこの名前で表示されます。手入力ではなく、選んだ拠点ラベルから自動で作成します。
                        </p>
                    </div>

                    {selectedSlot?.has_blocking_booking ? (
                        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-7 text-amber-100">
                            この枠には予約が紐づいているため、時間変更と削除はできません。
                        </div>
                    ) : null}

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="submit"
                            disabled={saveDisabled}
                            className="inline-flex items-center rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSavingSlot ? '保存中...' : slotDraft.public_id ? 'この枠を更新する' : 'この時間で枠を追加する'}
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setSlotDraft(createEmptySlotDraft(selectedCalendarDate));
                                setHasSlotSelection(false);
                                setActiveDraftDrag(null);
                            }}
                            disabled={!hasSlotSelection}
                            className="inline-flex items-center rounded-full border border-white/10 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/5"
                        >
                            選択を解除する
                        </button>

                        {selectedSlot ? (
                            <button
                                type="button"
                                onClick={() => {
                                    void handleDeleteSlot(selectedSlot);
                                }}
                                disabled={pendingDeleteSlotId === selectedSlot.public_id || selectedSlot.has_blocking_booking}
                                className="inline-flex items-center rounded-full border border-white/10 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {pendingDeleteSlotId === selectedSlot.public_id ? '削除中...' : 'この枠を削除'}
                            </button>
                        ) : null}
                    </div>
                </form>
            </section>
        </div>
    );
}
