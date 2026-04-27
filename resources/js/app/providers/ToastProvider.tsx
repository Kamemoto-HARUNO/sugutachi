import {
    createContext,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type PropsWithChildren,
} from 'react';
import { ToastViewport } from '../components/ToastViewport';

interface ToastItem {
    id: string;
    tone: 'success' | 'error';
    message: string;
}

interface ToastContextValue {
    showSuccess: (message: string) => void;
    showError: (message: string) => void;
    dismissToast: (id: string) => void;
}

const SUCCESS_TOAST_DURATION_MS = 3000;

export const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: PropsWithChildren) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const nextToastIdRef = useRef(0);
    const timeoutHandlesRef = useRef<Map<string, number>>(new Map());

    const dismissToast = useCallback((id: string) => {
        const timeoutHandle = timeoutHandlesRef.current.get(id);

        if (timeoutHandle != null) {
            window.clearTimeout(timeoutHandle);
            timeoutHandlesRef.current.delete(id);
        }

        setToasts((current) => current.filter((toast) => toast.id !== id));
    }, []);

    const pushToast = useCallback((tone: ToastItem['tone'], message: string) => {
        const id = `toast-${nextToastIdRef.current}`;

        nextToastIdRef.current += 1;

        setToasts((current) => [...current, { id, tone, message }]);

        if (tone === 'success') {
            const timeoutHandle = window.setTimeout(() => {
                dismissToast(id);
            }, SUCCESS_TOAST_DURATION_MS);

            timeoutHandlesRef.current.set(id, timeoutHandle);
        }
    }, [dismissToast]);

    const showSuccess = useCallback((message: string) => {
        pushToast('success', message);
    }, [pushToast]);

    const showError = useCallback((message: string) => {
        pushToast('error', message);
    }, [pushToast]);

    useEffect(() => {
        return () => {
            timeoutHandlesRef.current.forEach((timeoutHandle) => {
                window.clearTimeout(timeoutHandle);
            });
            timeoutHandlesRef.current.clear();
        };
    }, []);

    const value = useMemo<ToastContextValue>(() => ({
        showSuccess,
        showError,
        dismissToast,
    }), [dismissToast, showError, showSuccess]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <ToastViewport toasts={toasts} onDismiss={dismissToast} />
        </ToastContext.Provider>
    );
}
