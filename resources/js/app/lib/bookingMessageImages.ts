export const BOOKING_MESSAGE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export const BOOKING_MESSAGE_IMAGE_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
];

export function validateBookingMessageImage(file: File): string | null {
    if (!BOOKING_MESSAGE_IMAGE_MIME_TYPES.includes(file.type)) {
        return 'jpg / png / webp の画像を選択してください。';
    }

    if (file.size > BOOKING_MESSAGE_IMAGE_MAX_BYTES) {
        return '画像は10MB以下で送信してください。';
    }

    return null;
}

export function formatFileSize(sizeBytes: number): string {
    if (sizeBytes < 1024) {
        return `${sizeBytes} B`;
    }

    if (sizeBytes < 1024 * 1024) {
        return `${(sizeBytes / 1024).toFixed(1)} KB`;
    }

    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
