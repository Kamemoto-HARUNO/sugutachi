import type { ApiEnvelope } from './types';

export interface ApiErrorPayload {
    message?: string;
    errors?: Record<string, string[]>;
}

export class ApiError extends Error {
    status: number;
    errors?: Record<string, string[]>;
    payload?: unknown;

    constructor(status: number, message: string, options?: { errors?: Record<string, string[]>; payload?: unknown }) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.errors = options?.errors;
        this.payload = options?.payload;
    }
}

interface ApiRequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: BodyInit | object | null;
    token?: string | null;
    signal?: AbortSignal;
}

function normalizeApiPath(path: string): string {
    return path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`;
}

function isBodyInit(body: unknown): body is BodyInit {
    return body instanceof Blob || body instanceof FormData || typeof body === 'string' || body instanceof URLSearchParams;
}

function firstErrorMessage(errors?: Record<string, string[]>): string | null {
    if (!errors) {
        return null;
    }

    for (const messages of Object.values(errors)) {
        if (messages.length > 0) {
            return messages[0];
        }
    }

    return null;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const headers = new Headers({
        Accept: 'application/json',
    });

    if (options.token) {
        headers.set('Authorization', `Bearer ${options.token}`);
    }

    let body: BodyInit | undefined;

    if (options.body != null) {
        if (isBodyInit(options.body)) {
            body = options.body;
        } else {
            headers.set('Content-Type', 'application/json');
            body = JSON.stringify(options.body);
        }
    }

    const response = await fetch(normalizeApiPath(path), {
        method: options.method ?? 'GET',
        body,
        headers,
        signal: options.signal,
        credentials: 'same-origin',
    });

    if (response.status === 204) {
        return null as T;
    }

    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok) {
        const apiPayload = typeof payload === 'object' && payload !== null ? (payload as ApiErrorPayload) : undefined;
        const message =
            apiPayload?.message ?? firstErrorMessage(apiPayload?.errors) ?? 'リクエストの処理に失敗しました。';

        throw new ApiError(response.status, message, {
            errors: apiPayload?.errors,
            payload,
        });
    }

    return payload as T;
}

export function unwrapData<T>(payload: ApiEnvelope<T>): T {
    return payload.data;
}

export function getFieldError(error: unknown, field: string): string | null {
    if (error instanceof ApiError && error.errors?.[field]?.length) {
        return error.errors[field][0];
    }

    return null;
}
