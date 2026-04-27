export const SERVICE_TIME_ZONE = 'Asia/Tokyo';

const JST_OFFSET_MINUTES = 9 * 60;

type DateTimeInput = string | number | Date | null | undefined;

type DateFormatOptions = Omit<Intl.DateTimeFormatOptions, 'timeZone'>;

interface JstParts {
    year: string;
    month: string;
    day: string;
    hour: string;
    minute: string;
    second: string;
}

function toValidDate(value: DateTimeInput): Date | null {
    if (value == null) {
        return null;
    }

    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
}

function formatterOptions(options: DateFormatOptions): Intl.DateTimeFormatOptions {
    return {
        ...options,
        timeZone: SERVICE_TIME_ZONE,
    };
}

function jstPartsFromDate(date: Date): JstParts {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: SERVICE_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);

    const readPart = (type: Intl.DateTimeFormatPartTypes): string => (
        parts.find((part) => part.type === type)?.value ?? ''
    );

    return {
        year: readPart('year'),
        month: readPart('month'),
        day: readPart('day'),
        hour: readPart('hour'),
        minute: readPart('minute'),
        second: readPart('second'),
    };
}

function dateFromDateValue(value: string): Date | null {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
        return null;
    }

    const [, year, month, day] = match;

    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0));
}

export function formatJstDateTime(
    value: DateTimeInput,
    options: DateFormatOptions = {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    },
): string | null {
    const date = toValidDate(value);

    if (!date) {
        return null;
    }

    return new Intl.DateTimeFormat('ja-JP', formatterOptions(options)).format(date);
}

export function formatJstDate(
    value: DateTimeInput,
    options: DateFormatOptions = {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    },
): string | null {
    const date = toValidDate(value);

    if (!date) {
        return null;
    }

    return new Intl.DateTimeFormat('ja-JP', formatterOptions(options)).format(date);
}

export function formatJstTime(
    value: DateTimeInput,
    options: DateFormatOptions = {
        hour: '2-digit',
        minute: '2-digit',
    },
): string | null {
    const date = toValidDate(value);

    if (!date) {
        return null;
    }

    return new Intl.DateTimeFormat('ja-JP', formatterOptions(options)).format(date);
}

export function formatJstDateValue(
    value: string,
    options: DateFormatOptions = {
        month: 'numeric',
        day: 'numeric',
        weekday: 'short',
    },
): string | null {
    const date = dateFromDateValue(value);

    if (!date) {
        return null;
    }

    return new Intl.DateTimeFormat('ja-JP', formatterOptions(options)).format(date);
}

export function buildJstDateValue(value: DateTimeInput): string | null {
    const date = toValidDate(value);

    if (!date) {
        return null;
    }

    const parts = jstPartsFromDate(date);

    return `${parts.year}-${parts.month}-${parts.day}`;
}

export function buildCurrentJstDateValue(now: Date = new Date()): string {
    const parts = jstPartsFromDate(now);

    return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDaysToJstDateValue(value: string, days: number): string {
    const date = dateFromDateValue(value);

    if (!date) {
        return value;
    }

    date.setUTCDate(date.getUTCDate() + days);

    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, '0'),
        String(date.getUTCDate()).padStart(2, '0'),
    ].join('-');
}

export function buildCurrentJstDateTimeLocalValue(now: Date = new Date()): string {
    const parts = jstPartsFromDate(now);

    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function buildRoundedJstDateTimeLocalValue(now: Date = new Date(), stepMinutes = 15): string {
    const parts = jstPartsFromDate(now);
    const currentDateValue = `${parts.year}-${parts.month}-${parts.day}`;
    const currentTotalMinutes = Number(parts.hour) * 60 + Number(parts.minute);
    let roundedTotalMinutes = Math.ceil(currentTotalMinutes / stepMinutes) * stepMinutes;
    let dateValue = currentDateValue;

    if (roundedTotalMinutes >= 24 * 60) {
        roundedTotalMinutes = 0;
        dateValue = addDaysToJstDateValue(currentDateValue, 1);
    }

    const roundedHour = String(Math.floor(roundedTotalMinutes / 60)).padStart(2, '0');
    const roundedMinute = String(roundedTotalMinutes % 60).padStart(2, '0');
    const roundedValue = `${dateValue}T${roundedHour}:${roundedMinute}`;

    return roundedValue.slice(0, 10) === currentDateValue
        ? roundedValue
        : buildCurrentJstDateTimeLocalValue(now);
}

export function formatJstDateTimeLocalValue(value: string | null | undefined): string {
    const date = toValidDate(value);

    if (!date) {
        return '';
    }

    return buildCurrentJstDateTimeLocalValue(date);
}

export function getJstMinutesSinceStartOfDay(value: DateTimeInput): number | null {
    const date = toValidDate(value);

    if (!date) {
        return null;
    }

    const parts = jstPartsFromDate(date);

    return Number(parts.hour) * 60 + Number(parts.minute);
}

export function parseJstDateTimeLocalInput(value: string): Date | null {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);

    if (!match) {
        return null;
    }

    const [, year, month, day, hour, minute] = match;
    const utcTimestamp = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
    ) - JST_OFFSET_MINUTES * 60_000;

    return new Date(utcTimestamp);
}

export function weekdayIndexFromJstDateValue(value: string): number | null {
    const date = dateFromDateValue(value);

    if (!date) {
        return null;
    }

    return date.getUTCDay();
}
