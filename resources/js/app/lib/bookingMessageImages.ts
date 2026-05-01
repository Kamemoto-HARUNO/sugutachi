export const BOOKING_MESSAGE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const BOOKING_MESSAGE_IMAGE_COMPRESSION_THRESHOLD_BYTES = 2 * 1024 * 1024;
const BOOKING_MESSAGE_IMAGE_MAX_DIMENSION = 1600;
const BOOKING_MESSAGE_IMAGE_WEBP_QUALITIES = [0.82, 0.72, 0.62];

export const BOOKING_MESSAGE_IMAGE_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
];

export function validateBookingMessageImage(file: File): string | null {
    if (!BOOKING_MESSAGE_IMAGE_MIME_TYPES.includes(file.type)) {
        return 'jpg / png / webp の画像を選択してください。';
    }

    return null;
}

export interface PreparedBookingMessageImage {
    file: File;
    originalSizeBytes: number;
    wasOptimized: boolean;
}

function replaceFileExtension(fileName: string, extension: string): string {
    return fileName.replace(/\.[^.]+$/u, '') + extension;
}

function mimeTypeToExtension(mimeType: string): string {
    switch (mimeType) {
        case 'image/jpeg':
            return '.jpg';
        case 'image/png':
            return '.png';
        case 'image/webp':
        default:
            return '.webp';
    }
}

function loadImage(file: File): Promise<HTMLImageElement> {
    const objectUrl = URL.createObjectURL(file);

    return new Promise((resolve, reject) => {
        const image = new Image();

        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };

        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('画像の読み込みに失敗しました。'));
        };

        image.src = objectUrl;
    });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('画像の変換に失敗しました。'));
                return;
            }

            resolve(blob);
        }, mimeType, quality);
    });
}

export async function prepareBookingMessageImage(file: File): Promise<PreparedBookingMessageImage> {
    const validationError = validateBookingMessageImage(file);

    if (validationError) {
        throw new Error(validationError);
    }

    const image = await loadImage(file);
    const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = longestEdge > BOOKING_MESSAGE_IMAGE_MAX_DIMENSION
        ? BOOKING_MESSAGE_IMAGE_MAX_DIMENSION / longestEdge
        : 1;
    const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale));
    const needsResize = scale < 1;
    const shouldOptimize = needsResize || file.size > BOOKING_MESSAGE_IMAGE_COMPRESSION_THRESHOLD_BYTES;

    if (!shouldOptimize) {
        if (file.size > BOOKING_MESSAGE_IMAGE_MAX_BYTES) {
            throw new Error('画像を圧縮しても10MB以下にできませんでした。');
        }

        return {
            file,
            originalSizeBytes: file.size,
            wasOptimized: false,
        };
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext('2d');

    if (!context) {
        throw new Error('画像の圧縮処理を開始できませんでした。');
    }

    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    let bestBlob: Blob | null = null;

    for (const quality of BOOKING_MESSAGE_IMAGE_WEBP_QUALITIES) {
        const nextBlob = await canvasToBlob(canvas, 'image/webp', quality);

        if (!bestBlob || nextBlob.size < bestBlob.size) {
            bestBlob = nextBlob;
        }

        if (nextBlob.size <= BOOKING_MESSAGE_IMAGE_MAX_BYTES) {
            bestBlob = nextBlob;
            break;
        }
    }

    if (!bestBlob) {
        throw new Error('画像の圧縮に失敗しました。');
    }

    const optimizedFile = new File(
        [bestBlob],
        replaceFileExtension(file.name, mimeTypeToExtension(bestBlob.type || 'image/webp')),
        {
            type: bestBlob.type || 'image/webp',
            lastModified: Date.now(),
        },
    );

    if (!needsResize && optimizedFile.size >= file.size && file.size <= BOOKING_MESSAGE_IMAGE_MAX_BYTES) {
        return {
            file,
            originalSizeBytes: file.size,
            wasOptimized: false,
        };
    }

    if (optimizedFile.size > BOOKING_MESSAGE_IMAGE_MAX_BYTES) {
        throw new Error('画像を圧縮しても10MB以下にできませんでした。');
    }

    return {
        file: optimizedFile,
        originalSizeBytes: file.size,
        wasOptimized: optimizedFile.size !== file.size || optimizedFile.type !== file.type || needsResize,
    };
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
