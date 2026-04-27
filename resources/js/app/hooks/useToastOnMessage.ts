import { useEffect, useRef } from 'react';
import { useToast } from './useToast';

export function useToastOnMessage(
    message: string | null | undefined,
    tone: 'success' | 'error',
) {
    const { showError, showSuccess } = useToast();
    const lastMessageRef = useRef<string | null>(null);

    useEffect(() => {
        if (!message) {
            lastMessageRef.current = null;
            return;
        }

        if (lastMessageRef.current === message) {
            return;
        }

        lastMessageRef.current = message;

        if (tone === 'success') {
            showSuccess(message);
            return;
        }

        showError(message);
    }, [message, showError, showSuccess, tone]);
}
