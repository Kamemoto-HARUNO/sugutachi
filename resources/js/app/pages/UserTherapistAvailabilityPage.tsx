import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { DiscoveryFooter } from '../components/discovery/DiscoveryFooter';
import { StickyHeroHeader } from '../components/discovery/StickyHeroHeader';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import {
    formatCurrency,
    formatMenuHourlyRateLabel,
    formatMenuMinimumDurationLabel,
    formatWalkingTimeRange,
    getDefaultServiceAddress,
    getMenuMinimumDurationMinutes,
    getServiceAddressLabel,
} from '../lib/discovery';
import { ApiError, apiRequest, unwrapData } from '../lib/api';
import type {
    ApiEnvelope,
    PublicTherapistAvailability,
    PublicTherapistAvailabilityCalendarDate,
    PublicTherapistAvailabilityWindow,
    ServiceAddress,
    ServiceMeta,
    TherapistDetail,
    TherapistMenu,
} from '../lib/types';

const CALENDAR_DAYS = 7;
const DEFAULT_MENU_DURATION = 60;
const MINUTES_PER_DAY = 24 * 60;
const TIMELINE_HOUR_HEIGHT = 32;
const TIMELINE_HEIGHT = 24 * TIMELINE_HOUR_HEIGHT;
const QUARTER_HOUR_MS = 15 * 60 * 1000;
const HOURS = Array.from({ length: 24 }, (_, index) => index);

interface TimeOption {
    value: string;
    label: string;
}

interface DurationOption {
    value: number;
    label: string;
}

interface AvailabilityResizeDragState {
    columnElement: HTMLDivElement;
    handleElement: HTMLButtonElement;
    pointerId: number;
    startAt: string;
    windowEndAt: string;
    minimumDurationMinutes: number;
    stepMinutes: number;
}

function todayDateValue(): string {
    const today = new Date();

    return [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
    ].join('-');
}

function normalizeDateValue(value: string | null): string {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    return todayDateValue();
}

function addDaysToDateValue(value: string, days: number): string {
    const [year, month, day] = value.split('-').map((part) => Number(part));
    const date = new Date(year, (month || 1) - 1, day || 1);
    date.setDate(date.getDate() + days);

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
}

function formatDateLabel(value: string): string {
    const [year, month, day] = value.split('-').map((part) => Number(part));
    const date = new Date(year, (month || 1) - 1, day || 1);

    if (Number.isNaN(date.getTime())) {
        return '日付未定';
    }

    return new Intl.DateTimeFormat('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        weekday: 'short',
    }).format(date);
}

function formatWeekRangeLabel(startDate: string): string {
    const endDate = addDaysToDateValue(startDate, CALENDAR_DAYS - 1);
    const [startYear, startMonth, startDay] = startDate.split('-').map((part) => Number(part));
    const [endYear, endMonth, endDay] = endDate.split('-').map((part) => Number(part));
    const start = new Date(startYear, (startMonth || 1) - 1, startDay || 1);
    const end = new Date(endYear, (endMonth || 1) - 1, endDay || 1);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return '1週間';
    }

    return `${new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(start)} - ${new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(end)}`;
}

function formatCalendarDayLabel(value: string): string {
    const [year, month, day] = value.split('-').map((part) => Number(part));
    const date = new Date(year, (month || 1) - 1, day || 1);

    if (Number.isNaN(date.getTime())) {
        return '--';
    }

    return String(date.getDate());
}

function formatCalendarWeekdayLabel(value: string): string {
    const [year, month, day] = value.split('-').map((part) => Number(part));
    const date = new Date(year, (month || 1) - 1, day || 1);

    if (Number.isNaN(date.getTime())) {
        return '--';
    }

    return new Intl.DateTimeFormat('ja-JP', {
        weekday: 'short',
    }).format(date);
}

function getCalendarWeekdayTone(value: string): string {
    const [year, month, day] = value.split('-').map((part) => Number(part));
    const date = new Date(year, (month || 1) - 1, day || 1);

    if (Number.isNaN(date.getTime())) {
        return 'text-[#8b7451]';
    }

    const dayOfWeek = date.getDay();

    if (dayOfWeek === 0) {
        return 'text-[#cc6f7f]';
    }

    if (dayOfWeek === 6) {
        return 'text-[#5f84c8]';
    }

    return 'text-[#8b7451]';
}

function formatTimeLabel(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '--:--';
    }

    return new Intl.DateTimeFormat('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function formatDateTimeLabel(value: string | null): string {
    if (!value) {
        return '未設定';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '未設定';
    }

    return new Intl.DateTimeFormat('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function formatAvailabilityUnavailableReason(reason: string | null | undefined): string {
    switch (reason) {
        case 'outside_service_area':
            return '距離が遠いため、この住所からは予約できません。';
        default:
            return 'この条件では予約できません。';
    }
}

function buildAmountRangeLabel(
    amountRange: PublicTherapistAvailability['estimated_total_amount_range'] | PublicTherapistAvailabilityCalendarDate['estimated_total_amount_range'],
    durationMinutes: number,
): string {
    if (!amountRange) {
        return '概算料金は確認中';
    }

    const prefix = `${durationMinutes}分 `;

    if (amountRange.min === amountRange.max) {
        return `${prefix}${formatCurrency(amountRange.min)}`;
    }

    return `${prefix}${formatCurrency(amountRange.min)}〜${formatCurrency(amountRange.max)}`;
}

function buildWindowKey(window: PublicTherapistAvailabilityWindow): string {
    return `${window.availability_slot_id}:${window.start_at}:${window.end_at}`;
}

function getMinutesSinceStartOfDay(value: string): number {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return 0;
    }

    return date.getHours() * 60 + date.getMinutes();
}

function getRangeMinutes(startAt: string, endAt: string): number {
    const diffMs = new Date(endAt).getTime() - new Date(startAt).getTime();

    return Math.max(0, Math.round(diffMs / 60000));
}

function getRangeEndLabel(startAt: string, durationMinutes: number): string {
    const start = new Date(startAt);

    if (Number.isNaN(start.getTime())) {
        return '--:--';
    }

    return formatTimeLabel(new Date(start.getTime() + durationMinutes * 60000).toISOString());
}

function getDurationStepMinutes(menu: TherapistMenu | null): number {
    return Math.max(15, menu?.duration_step_minutes ?? 15);
}

function buildDurationValues(
    minimumDurationMinutes: number,
    maximumDurationMinutes: number,
    stepMinutes: number,
): number[] {
    if (maximumDurationMinutes < minimumDurationMinutes) {
        return [];
    }

    const values = new Set<number>();

    for (let duration = minimumDurationMinutes; duration <= maximumDurationMinutes; duration += stepMinutes) {
        values.add(duration);
    }

    values.add(maximumDurationMinutes);

    return Array.from(values).sort((left, right) => left - right);
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function snapMinutes(value: number, stepMinutes: number): number {
    return Math.round(value / stepMinutes) * stepMinutes;
}

function buildProfileSummary(detail: TherapistDetail | null): string {
    if (!detail) {
        return '';
    }

    return [
        detail.height_cm != null ? String(detail.height_cm) : null,
        detail.weight_kg != null ? String(detail.weight_kg) : null,
        detail.age != null ? String(detail.age) : null,
        detail.p_size_cm != null ? `P${detail.p_size_cm}` : null,
    ].filter((value): value is string => value !== null).join(' / ');
}

function createEmptyCalendarDate(date: string): PublicTherapistAvailabilityCalendarDate {
    return {
        date,
        earliest_start_at: null,
        latest_end_at: null,
        walking_time_range: null,
        estimated_total_amount_range: null,
        window_count: 0,
        bookable_window_count: 0,
        is_bookable: false,
        unavailable_reason: null,
        windows: [],
    };
}

function getWindowTopPercent(startAt: string): number {
    return (getMinutesSinceStartOfDay(startAt) / MINUTES_PER_DAY) * 100;
}

function getWindowHeightPercent(startAt: string, endAt: string): number {
    return (getRangeMinutes(startAt, endAt) / MINUTES_PER_DAY) * 100;
}

export function UserTherapistAvailabilityPage() {
    const { publicId } = useParams();
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [serviceMeta, setServiceMeta] = useState<ServiceMeta | null>(null);
    const [serviceAddresses, setServiceAddresses] = useState<ServiceAddress[]>([]);
    const [therapistDetail, setTherapistDetail] = useState<TherapistDetail | null>(null);
    const [availability, setAvailability] = useState<PublicTherapistAvailability | null>(null);
    const [bootstrapError, setBootstrapError] = useState<string | null>(null);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [availabilityError, setAvailabilityError] = useState<string | null>(null);
    const [isBootstrapping, setIsBootstrapping] = useState(true);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
    const [hasLoadedAvailability, setHasLoadedAvailability] = useState(false);
    const [pendingDurationMinutes, setPendingDurationMinutes] = useState<number | null>(null);
    const pendingDurationRef = useRef<number | null>(null);
    const activeResizeDragRef = useRef<AvailabilityResizeDragState | null>(null);
    const resizeDragCleanupRef = useRef<(() => void) | null>(null);

    const weekStart = normalizeDateValue(searchParams.get('week_start') ?? searchParams.get('date') ?? null);
    const selectedDate = normalizeDateValue(searchParams.get('date') ?? weekStart);
    const selectedAddressId = searchParams.get('service_address_id');
    const selectedMenuId = searchParams.get('therapist_menu_id');
    const availabilitySlotId = searchParams.get('availability_slot_id');
    const requestedStartAt = searchParams.get('requested_start_at');
    const rawDuration = Number(searchParams.get('menu_duration_minutes') ?? String(DEFAULT_MENU_DURATION));

    const selectedAddress = useMemo(
        () => serviceAddresses.find((address) => address.public_id === selectedAddressId) ?? null,
        [selectedAddressId, serviceAddresses],
    );

    const selectedMenu = useMemo(() => {
        if (!therapistDetail) {
            return null;
        }

        return therapistDetail.menus.find((menu) => menu.public_id === selectedMenuId)
            ?? therapistDetail.menus[0]
            ?? null;
    }, [selectedMenuId, therapistDetail]);

    const selectedDuration = useMemo(() => {
        if (!selectedMenu) {
            return DEFAULT_MENU_DURATION;
        }

        return Math.max(
            Number.isFinite(rawDuration) ? rawDuration : DEFAULT_MENU_DURATION,
            getMenuMinimumDurationMinutes(selectedMenu),
        );
    }, [rawDuration, selectedMenu]);
    const displayedDuration = pendingDurationMinutes ?? selectedDuration;

    const combinedError = bootstrapError ?? detailError ?? availabilityError;
    useToastOnMessage(combinedError, 'error');
    usePageTitle(therapistDetail ? `${therapistDetail.public_name}の空き時間` : '空き時間を見る');

    useEffect(() => {
        pendingDurationRef.current = pendingDurationMinutes;
    }, [pendingDurationMinutes]);

    useEffect(() => () => {
        resizeDragCleanupRef.current?.();
    }, []);

    const updateSearchParams = (updates: Record<string, string | null>, replace = false) => {
        setSearchParams((previous) => {
            const next = new URLSearchParams(previous);

            Object.entries(updates).forEach(([key, value]) => {
                if (!value) {
                    next.delete(key);
                    return;
                }

                next.set(key, value);
            });

            return next;
        }, { replace });
    };

    useEffect(() => {
        let isMounted = true;

        async function bootstrap() {
            if (!token) {
                setIsBootstrapping(false);
                return;
            }

            try {
                const [metaPayload, addressPayload] = await Promise.all([
                    apiRequest<ApiEnvelope<ServiceMeta>>('/service-meta'),
                    apiRequest<ApiEnvelope<ServiceAddress[]>>('/me/service-addresses', { token }),
                ]);

                if (!isMounted) {
                    return;
                }

                setServiceMeta(unwrapData(metaPayload));
                setServiceAddresses(unwrapData(addressPayload));
            } catch (requestError) {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError
                        ? requestError.message
                        : '待ち合わせ場所の取得に失敗しました。';

                setBootstrapError(message);
            } finally {
                if (isMounted) {
                    setIsBootstrapping(false);
                }
            }
        }

        void bootstrap();

        return () => {
            isMounted = false;
        };
    }, [token]);

    useEffect(() => {
        let isMounted = true;

        async function loadDetail() {
            if (!publicId || !token) {
                return;
            }

            setIsLoadingDetail(true);
            setDetailError(null);

            try {
                const params = new URLSearchParams();

                if (selectedAddressId) {
                    params.set('service_address_id', selectedAddressId);
                }

                const path = params.toString()
                    ? `/therapists/${publicId}?${params.toString()}`
                    : `/therapists/${publicId}`;

                const payload = await apiRequest<ApiEnvelope<TherapistDetail>>(path, { token });

                if (!isMounted) {
                    return;
                }

                setTherapistDetail(unwrapData(payload));
            } catch (requestError) {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError
                        ? requestError.message
                        : 'プロフィールの取得に失敗しました。';

                setDetailError(message);
                setTherapistDetail(null);
            } finally {
                if (isMounted) {
                    setIsLoadingDetail(false);
                }
            }
        }

        void loadDetail();

        return () => {
            isMounted = false;
        };
    }, [publicId, selectedAddressId, token]);

    useEffect(() => {
        if (!publicId) {
            return;
        }

        const fallbackAddress = selectedAddress ?? getDefaultServiceAddress(serviceAddresses);
        const nextParams = new URLSearchParams(searchParams);
        let changed = false;

        if (nextParams.get('start_type') !== 'scheduled') {
            nextParams.set('start_type', 'scheduled');
            changed = true;
        }

        if (nextParams.get('week_start') !== weekStart) {
            nextParams.set('week_start', weekStart);
            changed = true;
        }

        if (nextParams.get('date') !== selectedDate) {
            nextParams.set('date', selectedDate);
            changed = true;
        }

        if ((!selectedAddressId || !selectedAddress) && fallbackAddress) {
            nextParams.set('service_address_id', fallbackAddress.public_id);
            changed = true;
        }

        if (selectedMenu && nextParams.get('therapist_menu_id') !== selectedMenu.public_id) {
            nextParams.set('therapist_menu_id', selectedMenu.public_id);
            changed = true;
        }

        if (selectedMenu && nextParams.get('menu_duration_minutes') !== String(selectedDuration)) {
            nextParams.set('menu_duration_minutes', String(selectedDuration));
            changed = true;
        }

        if (changed) {
            setSearchParams(nextParams, { replace: true });
        }
    }, [
        publicId,
        searchParams,
        selectedAddress,
        selectedAddressId,
        selectedDate,
        selectedDuration,
        selectedMenu,
        serviceAddresses,
        setSearchParams,
        weekStart,
    ]);

    useEffect(() => {
        let isMounted = true;

        async function loadAvailability() {
            if (!publicId || !token || !selectedAddressId || !selectedMenu) {
                setAvailability(null);
                setHasLoadedAvailability(false);
                return;
            }

            setIsLoadingAvailability(true);
            setAvailabilityError(null);
            setHasLoadedAvailability(false);

            try {
                const params = new URLSearchParams({
                    service_address_id: selectedAddressId,
                    therapist_menu_id: selectedMenu.public_id,
                    date: selectedDate,
                    available_dates_from: weekStart,
                    calendar_days: String(CALENDAR_DAYS),
                    menu_duration_minutes: String(selectedDuration),
                });
                const payload = await apiRequest<ApiEnvelope<PublicTherapistAvailability>>(
                    `/therapists/${publicId}/availability?${params.toString()}`,
                    { token },
                );

                if (!isMounted) {
                    return;
                }

                setAvailability(unwrapData(payload));
                setHasLoadedAvailability(true);
            } catch (requestError) {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError
                        ? requestError.message
                        : '空き時間の取得に失敗しました。';

                setAvailabilityError(message);
                setAvailability(null);
                setHasLoadedAvailability(true);
            } finally {
                if (isMounted) {
                    setIsLoadingAvailability(false);
                }
            }
        }

        void loadAvailability();

        return () => {
            isMounted = false;
        };
    }, [publicId, selectedAddressId, selectedDate, selectedDuration, selectedMenu, token, weekStart]);

    const calendarDates = useMemo<PublicTherapistAvailabilityCalendarDate[]>(() => {
        if (availability?.calendar_dates?.length) {
            return availability.calendar_dates;
        }

        return Array.from({ length: CALENDAR_DAYS }, (_, index) => createEmptyCalendarDate(addDaysToDateValue(weekStart, index)));
    }, [availability, weekStart]);

    const selectedWindow = useMemo(() => {
        if (!availabilitySlotId || !requestedStartAt) {
            return null;
        }

        const requestedStartTime = new Date(requestedStartAt).getTime();

        if (Number.isNaN(requestedStartTime)) {
            return null;
        }

        return calendarDates
            .flatMap((calendarDate) => calendarDate.windows)
            .find((window) => {
                const windowStartTime = new Date(window.start_at).getTime();
                const windowEndTime = new Date(window.end_at).getTime();

                return window.is_bookable
                    && window.availability_slot_id === availabilitySlotId
                    && requestedStartTime >= windowStartTime
                    && requestedStartTime < windowEndTime;
            }) ?? null;
    }, [availabilitySlotId, calendarDates, requestedStartAt]);

    const startOptions = useMemo<TimeOption[]>(() => {
        if (!selectedWindow || !selectedMenu) {
            return [];
        }

        const minimumDuration = getMenuMinimumDurationMinutes(selectedMenu);
        const latestStartTime = new Date(selectedWindow.end_at).getTime() - minimumDuration * 60000;
        const initialStartTime = new Date(selectedWindow.start_at).getTime();

        if (Number.isNaN(initialStartTime) || Number.isNaN(latestStartTime) || latestStartTime < initialStartTime) {
            return [];
        }

        const options: TimeOption[] = [];

        for (let cursor = initialStartTime; cursor <= latestStartTime; cursor += QUARTER_HOUR_MS) {
            const value = new Date(cursor).toISOString();

            options.push({
                value,
                label: formatTimeLabel(value),
            });
        }

        return options;
    }, [selectedMenu, selectedWindow]);

    const durationOptions = useMemo<DurationOption[]>(() => {
        if (!selectedWindow || !selectedMenu || !requestedStartAt) {
            return [];
        }

        const requestedStartTime = new Date(requestedStartAt).getTime();
        const windowEndTime = new Date(selectedWindow.end_at).getTime();
        const minimumDuration = getMenuMinimumDurationMinutes(selectedMenu);
        const durationStep = getDurationStepMinutes(selectedMenu);
        const maxDuration = Math.floor((windowEndTime - requestedStartTime) / 60000);

        if (Number.isNaN(requestedStartTime) || Number.isNaN(windowEndTime) || maxDuration < minimumDuration) {
            return [];
        }

        return buildDurationValues(minimumDuration, maxDuration, durationStep)
            .map((value) => ({
                value,
                label: `${value}分`,
            }));
    }, [requestedStartAt, selectedMenu, selectedWindow]);

    const selectedCalendarDate = useMemo(() => {
        const targetDate = requestedStartAt ? requestedStartAt.slice(0, 10) : selectedDate;

        return calendarDates.find((calendarDate) => calendarDate.date === targetDate) ?? null;
    }, [calendarDates, requestedStartAt, selectedDate]);

    const selectedDurationIsValid = durationOptions.some((option) => option.value === displayedDuration);
    const selectedStartIsValid = startOptions.some((option) => option.value === requestedStartAt);
    const requestPath = useMemo(() => {
        if (
            !publicId
            || !selectedMenu
            || !selectedAddress
            || !selectedWindow
            || !requestedStartAt
            || !selectedStartIsValid
            || !selectedDurationIsValid
        ) {
            return null;
        }

        const params = new URLSearchParams({
            mode: 'scheduled',
            therapist_id: publicId,
            therapist_menu_id: selectedMenu.public_id,
            menu_duration_minutes: String(displayedDuration),
            service_address_id: selectedAddress.public_id,
            availability_slot_id: selectedWindow.availability_slot_id,
            requested_start_at: requestedStartAt,
            date: requestedStartAt.slice(0, 10),
            start_type: 'scheduled',
        });
        const walkingTimeRange = selectedCalendarDate?.walking_time_range ?? availability?.walking_time_range;

        if (walkingTimeRange) {
            params.set('walking_time_range', walkingTimeRange);
        }

        return `/user/booking-request/quote?${params.toString()}`;
    }, [availability?.walking_time_range, displayedDuration, publicId, requestedStartAt, selectedAddress, selectedCalendarDate?.walking_time_range, selectedDurationIsValid, selectedMenu, selectedStartIsValid, selectedWindow]);

    const hasAnyWindowsThisWeek = calendarDates.some((calendarDate) => calendarDate.window_count > 0);
    const canGoPreviousWeek = weekStart > todayDateValue();

    function handleBookableWindowClick(
        window: PublicTherapistAvailabilityWindow,
        event: ReactMouseEvent<HTMLButtonElement>,
    ) {
        if (!selectedMenu) {
            return;
        }

        const minimumDuration = getMenuMinimumDurationMinutes(selectedMenu);
        const windowStartTime = new Date(window.start_at).getTime();
        const windowEndTime = new Date(window.end_at).getTime();

        if (Number.isNaN(windowStartTime) || Number.isNaN(windowEndTime)) {
            return;
        }

        const rect = event.currentTarget.getBoundingClientRect();
        const relativeRatio = rect.height <= 0
            ? 0
            : clampNumber((event.clientY - rect.top) / rect.height, 0, 1);
        const windowDurationMinutes = Math.max(0, Math.round((windowEndTime - windowStartTime) / 60000));
        const rawOffsetMinutes = relativeRatio * windowDurationMinutes;
        const snappedOffsetMinutes = snapMinutes(rawOffsetMinutes, 15);
        const latestStartTime = windowEndTime - minimumDuration * 60000;
        const requestedStartTime = clampNumber(
            windowStartTime + snappedOffsetMinutes * 60000,
            windowStartTime,
            latestStartTime,
        );
        const nextRequestedStartAt = new Date(requestedStartTime).toISOString();

        pendingDurationRef.current = null;
        setPendingDurationMinutes(null);
        resizeDragCleanupRef.current?.();
        activeResizeDragRef.current = null;
        updateSearchParams({
            availability_slot_id: window.availability_slot_id,
            requested_start_at: nextRequestedStartAt,
            menu_duration_minutes: String(minimumDuration),
            date: nextRequestedStartAt.slice(0, 10),
        });
    }

    function handleSelectedRangeResizePointerDown(
        event: ReactPointerEvent<HTMLButtonElement>,
        availabilityWindow: PublicTherapistAvailabilityWindow,
    ) {
        if (!selectedMenu || !requestedStartAt) {
            return;
        }

        const columnElement = event.currentTarget.closest('[data-calendar-column="true"]');

        if (!(columnElement instanceof HTMLDivElement)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);

        resizeDragCleanupRef.current?.();
        setPendingDurationMinutes(displayedDuration);
        pendingDurationRef.current = displayedDuration;
        const dragState: AvailabilityResizeDragState = {
            columnElement,
            handleElement: event.currentTarget,
            pointerId: event.pointerId,
            startAt: requestedStartAt,
            windowEndAt: availabilityWindow.end_at,
            minimumDurationMinutes: getMenuMinimumDurationMinutes(selectedMenu),
            stepMinutes: getDurationStepMinutes(selectedMenu),
        };
        activeResizeDragRef.current = dragState;

        const updateDurationFromClientY = (clientY: number) => {
            const { columnElement, startAt, windowEndAt, minimumDurationMinutes, stepMinutes } = dragState;
            const rect = columnElement.getBoundingClientRect();

            if (rect.height <= 0) {
                return;
            }

            const relativeY = clampNumber(clientY - rect.top, 0, rect.height);
            const rawEndMinutes = (relativeY / rect.height) * MINUTES_PER_DAY;
            const selectedStartMinutes = getMinutesSinceStartOfDay(startAt);
            const maximumDurationMinutes = Math.max(minimumDurationMinutes, getRangeMinutes(startAt, windowEndAt));
            const durationCandidates = buildDurationValues(
                minimumDurationMinutes,
                maximumDurationMinutes,
                stepMinutes,
            );

            if (durationCandidates.length === 0) {
                return;
            }

            const rawDurationMinutes = Math.max(minimumDurationMinutes, rawEndMinutes - selectedStartMinutes);
            const nextDuration = durationCandidates.reduce((closest, current) => (
                Math.abs(current - rawDurationMinutes) < Math.abs(closest - rawDurationMinutes)
                    ? current
                    : closest
            ));

            pendingDurationRef.current = nextDuration;
            setPendingDurationMinutes(nextDuration);
        };

        const handlePointerMove = (moveEvent: PointerEvent) => {
            if (moveEvent.pointerId !== dragState.pointerId) {
                return;
            }

            updateDurationFromClientY(moveEvent.clientY);
        };

        const handlePointerUp = (endEvent: PointerEvent) => {
            if (endEvent.pointerId !== dragState.pointerId) {
                return;
            }

            if (pendingDurationRef.current != null && pendingDurationRef.current !== selectedDuration) {
                updateSearchParams({
                    menu_duration_minutes: String(pendingDurationRef.current),
                }, true);
            }

            if (dragState.handleElement.hasPointerCapture?.(dragState.pointerId)) {
                try {
                    dragState.handleElement.releasePointerCapture(dragState.pointerId);
                } catch {
                    // Pointer capture may already be released by the browser.
                }
            }

            pendingDurationRef.current = null;
            setPendingDurationMinutes(null);
            activeResizeDragRef.current = null;
            resizeDragCleanupRef.current?.();
        };

        const cleanup = () => {
            dragState.handleElement.removeEventListener('pointermove', handlePointerMove);
            dragState.handleElement.removeEventListener('pointerup', handlePointerUp);
            dragState.handleElement.removeEventListener('pointercancel', handlePointerUp);
            globalThis.window.removeEventListener('pointermove', handlePointerMove);
            globalThis.window.removeEventListener('pointerup', handlePointerUp);
            globalThis.window.removeEventListener('pointercancel', handlePointerUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            resizeDragCleanupRef.current = null;
        };

        resizeDragCleanupRef.current = cleanup;
        dragState.handleElement.addEventListener('pointermove', handlePointerMove);
        dragState.handleElement.addEventListener('pointerup', handlePointerUp);
        dragState.handleElement.addEventListener('pointercancel', handlePointerUp);
        globalThis.window.addEventListener('pointermove', handlePointerMove);
        globalThis.window.addEventListener('pointerup', handlePointerUp);
        globalThis.window.addEventListener('pointercancel', handlePointerUp);
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        updateDurationFromClientY(event.clientY);
    }

    const detailPath = useMemo(() => {
        if (!therapistDetail) {
            return '/user/therapists';
        }

        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('availability_slot_id');
        nextParams.delete('requested_start_at');
        nextParams.delete('week_start');
        nextParams.delete('therapist_menu_id');
        nextParams.delete('menu_duration_minutes');
        nextParams.delete('date');
        const query = nextParams.toString();

        return `/therapists/${therapistDetail.public_id}${query ? `?${query}` : ''}`;
    }, [searchParams, therapistDetail]);

    const listPath = useMemo(() => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('availability_slot_id');
        nextParams.delete('requested_start_at');
        nextParams.delete('week_start');
        nextParams.delete('therapist_menu_id');
        nextParams.delete('menu_duration_minutes');
        nextParams.delete('date');
        const query = nextParams.toString();

        return `/user/therapists${query ? `?${query}` : ''}`;
    }, [searchParams]);

    const travelRequestPath = useMemo(() => {
        if (!therapistDetail) {
            return '/user/therapists';
        }

        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('availability_slot_id');
        nextParams.delete('requested_start_at');
        nextParams.delete('week_start');
        nextParams.delete('therapist_menu_id');
        nextParams.delete('menu_duration_minutes');
        nextParams.delete('date');
        const query = nextParams.toString();

        return `/user/therapists/${therapistDetail.public_id}/travel-request${query ? `?${query}` : ''}`;
    }, [searchParams, therapistDetail]);

    useEffect(() => {
        if (!hasLoadedAvailability || isLoadingAvailability || (!availabilitySlotId && !requestedStartAt)) {
            return;
        }

        if (!selectedWindow) {
            updateSearchParams({
                availability_slot_id: null,
                requested_start_at: null,
            }, true);
        }
    }, [availabilitySlotId, hasLoadedAvailability, isLoadingAvailability, requestedStartAt, selectedWindow]);

    useEffect(() => {
        if (!selectedWindow || startOptions.length === 0 || !requestedStartAt) {
            return;
        }

        if (!selectedStartIsValid) {
            updateSearchParams({
                requested_start_at: startOptions[0].value,
                date: startOptions[0].value.slice(0, 10),
            }, true);
        }
    }, [requestedStartAt, selectedStartIsValid, selectedWindow, startOptions]);

    useEffect(() => {
        if (!selectedWindow || durationOptions.length === 0) {
            return;
        }

        if (!selectedDurationIsValid) {
            updateSearchParams({
                menu_duration_minutes: String(durationOptions[0].value),
            }, true);
        }
    }, [durationOptions, selectedDurationIsValid, selectedWindow]);

    useEffect(() => {
        if (activeResizeDragRef.current) {
            return;
        }

        setPendingDurationMinutes(null);
    }, [requestedStartAt, availabilitySlotId]);

    if (isBootstrapping) {
        return <LoadingScreen title="空き時間の準備中" message="待ち合わせ場所と公開情報を確認しています。" />;
    }

    if (isLoadingDetail && !therapistDetail) {
        return <LoadingScreen title="空き時間を準備中" message="セラピスト情報と公開スケジュールを読み込んでいます。" />;
    }

    const profileSummary = buildProfileSummary(therapistDetail);

    return (
        <div className="min-h-screen overflow-x-hidden bg-[#f6f1e7] text-[#17202b]">
            <div className="mx-auto flex w-full max-w-[1280px] min-w-0 flex-col gap-12 px-4 py-8 sm:px-6 md:px-10 md:py-14 xl:px-0">
                <section className="rounded-[32px] bg-[linear-gradient(107deg,#17202b_3.49%,#1d2a39_53.96%,#27364a_93.62%)] px-6 py-5 shadow-[0_24px_60px_rgba(23,32,43,0.16)] md:px-8">
                    <StickyHeroHeader
                        actions={[
                            { label: 'プロフィールへ戻る', to: detailPath },
                            { label: '一覧へ戻る', to: listPath, variant: 'secondary' },
                        ]}
                    />
                </section>

                {therapistDetail ? (
                    <section className="rounded-[28px] bg-[#fffdf8] p-5 shadow-[0_10px_24px_rgba(23,32,43,0.08)] md:p-6">
                        <div className="grid min-w-0 gap-4 grid-cols-[88px_minmax(0,1fr)] md:grid-cols-[112px_minmax(0,1fr)]">
                            <div className="aspect-square overflow-hidden rounded-[22px] bg-[#ede2cf]">
                                {therapistDetail.photos[0] ? (
                                    <img
                                        src={therapistDetail.photos[0].url}
                                        alt=""
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(160deg,#e8d5b2_0%,#cbb08a_100%)] text-4xl font-semibold text-[#17202b] md:text-5xl">
                                        {therapistDetail.public_name.slice(0, 1).toUpperCase()}
                                    </div>
                                )}
                            </div>

                            <div className="min-w-0 space-y-2">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">SCHEDULE</p>
                                <h1 className="text-2xl font-semibold leading-tight text-[#17202b] md:text-3xl">
                                    {therapistDetail.public_name}
                                </h1>
                                {profileSummary ? (
                                    <p className="text-sm font-medium tracking-wide text-[#68707a]">
                                        {profileSummary}
                                    </p>
                                ) : null}
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <span className="rounded-full bg-[#f6f1e7] px-3 py-1 text-xs font-semibold text-[#48505a]">
                                        {availability ? formatWalkingTimeRange(availability.walking_time_range) : '徒歩目安を確認'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </section>
                ) : (
                    <section className="rounded-[32px] bg-[#fffdf8] p-6 shadow-[0_10px_24px_rgba(23,32,43,0.08)] md:p-8">
                        <h1 className="text-2xl font-semibold text-[#17202b]">空き時間を表示できませんでした</h1>
                        <p className="mt-3 text-sm leading-7 text-[#68707a]">
                            セラピスト情報の取得に失敗しています。しばらくしてからもう一度お試しください。
                        </p>
                    </section>
                )}

                {serviceAddresses.length === 0 ? (
                    <section className="rounded-[32px] bg-[#fffdf8] p-6 shadow-[0_10px_24px_rgba(23,32,43,0.08)] md:p-8">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div className="space-y-2">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">SERVICE ADDRESS</p>
                                <h2 className="text-2xl font-semibold text-[#17202b]">先に待ち合わせ場所を登録してください</h2>
                                <p className="text-sm leading-7 text-[#68707a]">
                                    距離や予約可否は、保存済みの待ち合わせ場所を基準に計算します。
                                </p>
                            </div>

                            <Link
                                to="/user/service-addresses"
                                className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-6 py-3 text-sm font-bold text-[#1a2430] transition hover:brightness-105"
                            >
                                待ち合わせ場所を追加
                            </Link>
                        </div>
                    </section>
                ) : null}

                {serviceAddresses.length > 0 ? (
                    <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
                        <section className="min-w-0 rounded-[32px] bg-[#fffdf8] p-4 shadow-[0_10px_24px_rgba(23,32,43,0.08)] sm:p-5 md:p-8">
                            <div className="flex flex-col gap-4 border-b border-[#efe5d7] pb-6 md:flex-row md:items-end md:justify-between">
                                <div className="space-y-2">
                                    <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">WEEKLY CALENDAR</p>
                                    <h2 className="text-2xl font-semibold text-[#17202b]">1週間の空きスケジュール</h2>
                                    <p className="text-sm leading-7 text-[#68707a]">
                                        予約できる帯をタップすると、その帯を起点に開始時刻と予約時間を調整できます。
                                    </p>
                                </div>

                                <div className="flex flex-col items-start gap-3 md:items-end">
                                    <p className="text-sm font-semibold text-[#48505a]">{formatWeekRangeLabel(weekStart)}</p>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            disabled={!canGoPreviousWeek}
                                            onClick={() => {
                                                if (!canGoPreviousWeek) {
                                                    return;
                                                }

                                                const nextWeekStart = addDaysToDateValue(weekStart, -CALENDAR_DAYS);

                                                updateSearchParams({
                                                    week_start: nextWeekStart,
                                                    date: nextWeekStart,
                                                    availability_slot_id: null,
                                                    requested_start_at: null,
                                                });
                                            }}
                                            className={[
                                                'rounded-full border px-4 py-2 text-sm font-semibold transition',
                                                canGoPreviousWeek
                                                    ? 'border-[#ddcfb4] text-[#17202b] hover:bg-[#fff8ee]'
                                                    : 'cursor-not-allowed border-[#ece2d4] text-[#b8aa93]',
                                            ].join(' ')}
                                        >
                                            前の週
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const nextWeekStart = addDaysToDateValue(weekStart, CALENDAR_DAYS);

                                                updateSearchParams({
                                                    week_start: nextWeekStart,
                                                    date: nextWeekStart,
                                                    availability_slot_id: null,
                                                    requested_start_at: null,
                                                });
                                            }}
                                            className="rounded-full border border-[#ddcfb4] px-4 py-2 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                                        >
                                            次の週
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {!hasLoadedAvailability || (isLoadingAvailability && !availability) ? (
                                <div className="mt-6 h-[640px] animate-pulse rounded-[28px] bg-[#f6f1e7]" />
                            ) : hasAnyWindowsThisWeek ? (
                                <div className="mt-6">
                                    <div className="grid grid-cols-[34px_repeat(7,minmax(0,1fr))] gap-x-1 sm:grid-cols-[42px_repeat(7,minmax(0,1fr))] sm:gap-x-2 md:grid-cols-[56px_repeat(7,minmax(0,1fr))] md:gap-x-3">
                                        <div />

                                        {calendarDates.map((calendarDate) => {
                                            const isSelectedDay = selectedWindow ? requestedStartAt?.slice(0, 10) === calendarDate.date : false;

                                            return (
                                                <div
                                                    key={calendarDate.date}
                                                    className={[
                                                        'rounded-[18px] border px-1 py-2 text-center sm:rounded-[20px] sm:px-2 md:rounded-[24px] md:px-3 md:py-3',
                                                        isSelectedDay
                                                            ? 'border-[#cf8b9f] bg-[#fff2f6]'
                                                            : 'border-[#efe5d7] bg-[#fbf8f2]',
                                                    ].join(' ')}
                                                >
                                                    <p className={`text-[10px] font-semibold tracking-wide sm:text-[11px] ${getCalendarWeekdayTone(calendarDate.date)}`}>
                                                        {formatCalendarWeekdayLabel(calendarDate.date)}
                                                    </p>
                                                    <p className="mt-1 text-lg font-semibold leading-none text-[#17202b] sm:text-xl md:text-2xl">
                                                        {formatCalendarDayLabel(calendarDate.date)}
                                                    </p>
                                                </div>
                                            );
                                        })}

                                        <div className="relative" style={{ height: `${TIMELINE_HEIGHT}px` }}>
                                            {HOURS.map((hour) => (
                                                <div
                                                    key={hour}
                                                    className="absolute left-0 right-0 text-[10px] font-medium text-[#8b8f96] sm:text-[11px]"
                                                    style={{ top: `${hour * TIMELINE_HOUR_HEIGHT - 8}px` }}
                                                >
                                                    {String(hour).padStart(2, '0')}:00
                                                </div>
                                            ))}
                                        </div>

                                        {calendarDates.map((calendarDate) => (
                                            <div
                                                key={`${calendarDate.date}-timeline`}
                                                data-calendar-column="true"
                                                className="relative rounded-[18px] bg-[#ddd7cc] sm:rounded-[20px] md:rounded-[28px]"
                                                style={{ height: `${TIMELINE_HEIGHT}px` }}
                                            >
                                                {HOURS.map((hour) => (
                                                    <div
                                                        key={hour}
                                                        className="absolute left-0 right-0 border-t border-dashed border-[rgba(120,112,97,0.18)]"
                                                        style={{ top: `${hour * TIMELINE_HOUR_HEIGHT}px` }}
                                                    />
                                                ))}

                                                {calendarDate.windows.map((window) => {
                                                    const isSelectedWindow = selectedWindow
                                                        ? buildWindowKey(selectedWindow) === buildWindowKey(window)
                                                        : false;

                                                    return window.is_bookable ? (
                                                        <button
                                                            key={buildWindowKey(window)}
                                                            type="button"
                                                            onClick={(event) => handleBookableWindowClick(window, event)}
                                                            aria-label={`${formatTimeLabel(window.start_at)}から${formatTimeLabel(window.end_at)}まで予約可能`}
                                                            className={[
                                                                'absolute left-1 right-1 overflow-hidden rounded-[14px] border px-1 py-2 text-left transition sm:left-1.5 sm:right-1.5 sm:rounded-[18px] sm:px-2 md:left-2 md:right-2 md:rounded-[22px] md:px-3 md:py-3',
                                                                isSelectedWindow
                                                                    ? 'border-[#d8b07f] bg-white'
                                                                    : 'border-[rgba(23,32,43,0.08)] bg-white hover:bg-[#fffdf8]',
                                                            ].join(' ')}
                                                            style={{
                                                                top: `calc(${getWindowTopPercent(window.start_at)}% + 4px)`,
                                                                height: `calc(${getWindowHeightPercent(window.start_at, window.end_at)}% - 8px)`,
                                                            }}
                                                        >
                                                            <div className="flex h-full items-center justify-center">
                                                                <p className="text-center text-[9px] font-semibold leading-4 text-[#5d5448] sm:text-[10px] md:text-[11px]">
                                                                    {window.walking_time_range ? formatWalkingTimeRange(window.walking_time_range) : '徒歩目安を確認'}
                                                                </p>
                                                            </div>
                                                        </button>
                                                    ) : (
                                                        <div
                                                            key={buildWindowKey(window)}
                                                            className="absolute left-1 right-1 overflow-hidden rounded-[14px] border border-[rgba(120,112,97,0.08)] bg-[rgba(122,117,109,0.18)] sm:left-1.5 sm:right-1.5 sm:rounded-[18px] md:left-2 md:right-2 md:rounded-[22px]"
                                                            style={{
                                                                top: `calc(${getWindowTopPercent(window.start_at)}% + 4px)`,
                                                                height: `calc(${getWindowHeightPercent(window.start_at, window.end_at)}% - 8px)`,
                                                            }}
                                                        />
                                                    );
                                                })}

                                                {selectedWindow && requestedStartAt && selectedDurationIsValid && requestedStartAt.slice(0, 10) === calendarDate.date ? (
                                                    <div
                                                        className="absolute left-1 right-1 rounded-[14px] border-2 border-dashed border-[#cf8b9f] bg-[rgba(255,239,245,0.82)] px-1 py-2 shadow-[0_10px_20px_rgba(207,139,159,0.18)] sm:left-1.5 sm:right-1.5 sm:rounded-[18px] sm:px-2 md:left-2 md:right-2 md:rounded-[22px] md:px-3 md:py-3"
                                                        onClick={(event) => event.stopPropagation()}
                                                        style={{
                                                            top: `calc(${getWindowTopPercent(requestedStartAt)}% + 4px)`,
                                                            height: `calc(${(displayedDuration / MINUTES_PER_DAY) * 100}% - 8px)`,
                                                        }}
                                                    >
                                                        <div className="pointer-events-none flex h-full items-start justify-center">
                                                            <p className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-semibold tracking-wide text-[#955a6d]">
                                                                選択中
                                                            </p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onPointerDown={(event) => handleSelectedRangeResizePointerDown(event, selectedWindow)}
                                                            className="absolute left-1/2 bottom-0 z-10 flex h-8 w-8 -translate-x-1/2 translate-y-1/2 touch-none items-center justify-center rounded-full border border-rose-100/80 bg-rose-200 text-base font-semibold text-slate-950 shadow-[0_10px_24px_rgba(0,0,0,0.24)] transition hover:bg-white active:scale-95 sm:h-9 sm:w-9 sm:text-lg"
                                                            aria-label="予約時間を調整"
                                                        >
                                                            ↓
                                                        </button>
                                                    </div>
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-6 rounded-[24px] bg-[#f8f4ed] p-6">
                                    <h3 className="text-lg font-semibold text-[#17202b]">この1週間は公開中の枠がありません</h3>
                                    <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                        住所や対応内容を変えてみるか、出張リクエストをご利用ください。
                                    </p>
                                    <Link
                                        to={travelRequestPath}
                                        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border border-[#ddcfb4] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                                    >
                                        出張リクエストを送る
                                    </Link>
                                </div>
                            )}
                        </section>

                        <aside className="space-y-5">
                            <section className="rounded-[32px] bg-[#fffcf7] p-6 shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">BOOKING CONDITIONS</p>

                                <div className="mt-5 space-y-5">
                                    <div className="space-y-2">
                                        <label htmlFor="availability-service-address" className="text-xs font-semibold text-[#7d6852]">
                                            待ち合わせ場所
                                        </label>
                                        <select
                                            id="availability-service-address"
                                            value={selectedAddressId ?? ''}
                                            onChange={(event) => updateSearchParams({
                                                service_address_id: event.target.value || null,
                                                availability_slot_id: null,
                                                requested_start_at: null,
                                            })}
                                            className="min-h-12 w-full rounded-[20px] border border-[#e8dfd2] bg-white px-4 text-sm font-semibold text-[#17202b] outline-none"
                                        >
                                            {serviceAddresses.map((address) => (
                                                <option key={address.public_id} value={address.public_id}>
                                                    {getServiceAddressLabel(address)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="space-y-3">
                                        <p className="text-xs font-semibold text-[#7d6852]">対応内容</p>
                                        <div className="space-y-2">
                                            {therapistDetail?.menus.map((menu) => (
                                                <button
                                                    key={menu.public_id}
                                                    type="button"
                                                    onClick={() => {
                                                        const minimumDuration = getMenuMinimumDurationMinutes(menu);

                                                        updateSearchParams({
                                                            therapist_menu_id: menu.public_id,
                                                            menu_duration_minutes: String(minimumDuration),
                                                            availability_slot_id: null,
                                                            requested_start_at: null,
                                                        });
                                                    }}
                                                    className={[
                                                        'w-full rounded-[22px] border px-4 py-4 text-left transition',
                                                        selectedMenu?.public_id === menu.public_id
                                                            ? 'border-[#d2b179] bg-[#fff8ee]'
                                                            : 'border-[#ebe2d3] bg-white hover:bg-[#fff9f1]',
                                                    ].join(' ')}
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="space-y-1">
                                                            <p className="text-sm font-semibold text-[#17202b]">{menu.name}</p>
                                                            <p className="text-xs text-[#68707a]">
                                                                {formatMenuMinimumDurationLabel(menu)} / {formatMenuHourlyRateLabel(menu)}
                                                            </p>
                                                        </div>
                                                        {selectedMenu?.public_id === menu.public_id ? (
                                                            <span className="rounded-full bg-[#17202b] px-3 py-1 text-[11px] font-semibold text-white">
                                                                選択中
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {selectedWindow ? (
                                        <>
                                            <div className="space-y-2">
                                                <label htmlFor="availability-start-time" className="text-xs font-semibold text-[#7d6852]">
                                                    開始時刻
                                                </label>
                                                <select
                                                    id="availability-start-time"
                                                    value={requestedStartAt ?? ''}
                                                    onChange={(event) => {
                                                        updateSearchParams({
                                                            requested_start_at: event.target.value,
                                                            date: event.target.value.slice(0, 10),
                                                        });
                                                    }}
                                                    className="min-h-12 w-full rounded-[20px] border border-[#e8dfd2] bg-white px-4 text-sm font-semibold text-[#17202b] outline-none"
                                                >
                                                    {startOptions.map((option) => (
                                                        <option key={option.value} value={option.value}>
                                                            {option.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="space-y-2">
                                                <label htmlFor="availability-duration" className="text-xs font-semibold text-[#7d6852]">
                                                    予約時間
                                                </label>
                                                <select
                                                    id="availability-duration"
                                                    value={String(displayedDuration)}
                                                    onChange={(event) => {
                                                        pendingDurationRef.current = null;
                                                        setPendingDurationMinutes(null);
                                                        updateSearchParams({
                                                            menu_duration_minutes: event.target.value,
                                                        });
                                                    }}
                                                    className="min-h-12 w-full rounded-[20px] border border-[#e8dfd2] bg-white px-4 text-sm font-semibold text-[#17202b] outline-none"
                                                >
                                                    {durationOptions.map((option) => (
                                                        <option key={option.value} value={option.value}>
                                                            {option.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="rounded-[22px] border border-dashed border-[#dbcdb8] bg-[#fbf7f0] px-4 py-4 text-sm leading-7 text-[#6c6458]">
                                            カレンダーの予約できる帯をタップすると、ここで開始時刻と予約時間を調整できます。
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section className="rounded-[32px] bg-[#17202b] p-6 text-white shadow-[0_18px_36px_rgba(23,32,43,0.12)]">
                                <p className="text-xs font-semibold tracking-wide text-[#d2b179]">REQUEST SUMMARY</p>

                                {selectedWindow && selectedAddress && selectedMenu && requestedStartAt && selectedDurationIsValid ? (
                                    <div className="mt-5 space-y-4">
                                        <div className="rounded-[22px] bg-white/8 px-4 py-4">
                                            <p className="text-xs font-semibold text-[#d2b179]">選択中の枠</p>
                                            <p className="mt-2 text-lg font-semibold text-white">
                                                {formatDateLabel(requestedStartAt.slice(0, 10))}
                                            </p>
                                            <p className="mt-1 text-sm text-[#d8d3ca]">
                                                {formatTimeLabel(requestedStartAt)} - {getRangeEndLabel(requestedStartAt, displayedDuration)}
                                            </p>
                                        </div>

                                        <div className="space-y-3 text-sm text-[#e2dbcf]">
                                            <div>
                                                <p className="text-xs font-semibold text-[#d2b179]">待ち合わせ場所</p>
                                                <p className="mt-1 font-semibold text-white">{getServiceAddressLabel(selectedAddress)}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-[#d2b179]">対応内容</p>
                                                <p className="mt-1 font-semibold text-white">{selectedMenu.name}</p>
                                                <p className="mt-1 text-xs text-[#d8d3ca]">
                                                    {formatMenuMinimumDurationLabel(selectedMenu)} / {formatMenuHourlyRateLabel(selectedMenu)}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-[#d2b179]">概算料金</p>
                                                <p className="mt-1 font-semibold text-white">
                                                    {buildAmountRangeLabel(selectedCalendarDate?.estimated_total_amount_range ?? null, displayedDuration)}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-[#d2b179]">徒歩目安</p>
                                                <p className="mt-1 font-semibold text-white">
                                                    {formatWalkingTimeRange(selectedCalendarDate?.walking_time_range ?? availability?.walking_time_range)}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-[#d2b179]">受付締切</p>
                                                <p className="mt-1 font-semibold text-white">
                                                    {formatDateTimeLabel(selectedWindow.booking_deadline_at)}
                                                </p>
                                            </div>
                                        </div>

                                        {requestPath ? (
                                            <Link
                                                to={requestPath}
                                                className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-5 py-3 text-sm font-bold text-[#1a2430] transition hover:brightness-105"
                                            >
                                                この内容で見積もりを確認
                                            </Link>
                                        ) : null}
                                    </div>
                                ) : (
                                    <div className="mt-5 space-y-4">
                                        <p className="text-sm leading-7 text-[#d8d3ca]">
                                            まずはカレンダーの予約できる帯をタップしてください。そこから最低予約時間以上で時間枠を調整できます。
                                        </p>
                                    </div>
                                )}
                            </section>

                            <section className="rounded-[32px] bg-[#fffcf7] p-6 shadow-[0_10px_24px_rgba(23,32,43,0.08)]">
                                <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">ALTERNATIVE</p>
                                <p className="mt-4 text-sm leading-7 text-[#68707a]">
                                    希望の帯が見つからないときや、この住所からは距離が遠いときは出張リクエストも使えます。
                                </p>
                                <Link
                                    to={travelRequestPath}
                                    className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#ddcfb4] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#fff8ee]"
                                >
                                    出張リクエストを送る
                                </Link>
                            </section>
                        </aside>
                    </div>
                ) : null}
            </div>

            <DiscoveryFooter
                domain={serviceMeta?.domain}
                description="公開された1週間のスケジュールから帯を選び、開始時刻と予約時間を調整して予約リクエストへ進めます。"
                primaryAction={{ label: 'プロフィールへ戻る', to: detailPath }}
                secondaryAction={{ label: '一覧へ戻る', to: listPath }}
                supportEmail={serviceMeta?.support_email}
            />
        </div>
    );
}
