import type { ChangeEvent, RefObject } from 'react';
import { formatFileSize } from '../../lib/bookingMessageImages';

interface MessageComposerProps {
    draft: string;
    onDraftChange: (value: string) => void;
    placeholder: string;
    fileInputRef: RefObject<HTMLInputElement | null>;
    handleImageChange: (event: ChangeEvent<HTMLInputElement>) => void;
    selectedImage: File | null;
    selectedImagePreviewUrl: string | null;
    selectedImageOriginalSizeBytes?: number | null;
    selectedImageWasOptimized?: boolean;
    clearSelectedImage: () => void;
    isSending: boolean;
    isPreparingImage: boolean;
}

function PhotoIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
        >
            <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h2.2l1.1 1.4c.28.36.71.56 1.16.56h6.6A2.5 2.5 0 0 1 20 9.5v8A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-10Z" />
            <path d="M9.5 13a2.5 2.5 0 1 0 5 0a2.5 2.5 0 0 0-5 0Z" />
        </svg>
    );
}

function SendIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
        >
            <path d="m4 20 16-8L4 4l3.4 8L20 12" />
            <path d="M7.4 12H20" />
        </svg>
    );
}

export function MessageComposer({
    draft,
    onDraftChange,
    placeholder,
    fileInputRef,
    handleImageChange,
    selectedImage,
    selectedImagePreviewUrl,
    selectedImageOriginalSizeBytes,
    selectedImageWasOptimized,
    clearSelectedImage,
    isSending,
    isPreparingImage,
}: MessageComposerProps) {
    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                className="hidden"
                onChange={handleImageChange}
            />

            {isPreparingImage ? (
                <div className="flex items-center gap-3 rounded-[20px] bg-[#fff7ea] px-3 py-3 text-sm text-[#48505a]">
                    <span className="h-10 w-10 animate-spin rounded-full border-2 border-[#d2b179]/35 border-t-[#b5894d]" />
                    <div>
                        <p className="font-semibold text-[#17202b]">
                            画像を送信向けに調整しています
                        </p>
                        <p className="text-xs text-[#7a7066]">
                            サイズが大きい画像は自動で縮小・圧縮します。
                        </p>
                    </div>
                </div>
            ) : null}

            {selectedImage && selectedImagePreviewUrl ? (
                <div className="flex items-center gap-3 rounded-[20px] bg-[#fff7ea] px-3 py-3 text-sm text-[#48505a]">
                    <img
                        src={selectedImagePreviewUrl}
                        alt={selectedImage.name}
                        className="h-14 w-14 shrink-0 rounded-[14px] object-cover"
                    />
                    <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-[#17202b]">
                            {selectedImage.name}
                        </p>
                        <p className="text-xs text-[#7a7066]">
                            {selectedImageWasOptimized &&
                            selectedImageOriginalSizeBytes
                                ? `${formatFileSize(selectedImageOriginalSizeBytes)} → ${formatFileSize(selectedImage.size)} に自動圧縮`
                                : `${formatFileSize(selectedImage.size)} / 画像は1枚ずつ送信`}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={clearSelectedImage}
                        disabled={isSending}
                        className="shrink-0 rounded-full border border-[#d9c9ae] px-3 py-1 text-xs font-semibold text-[#17202b] transition hover:bg-[#fff1df]"
                    >
                        取り消す
                    </button>
                </div>
            ) : null}

            <div className="flex items-end gap-3 rounded-[24px] border border-[#e4d7c2] bg-[#fffaf3] px-3 py-3">
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSending || isPreparingImage}
                    className={[
                        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition',
                        selectedImage
                            ? 'bg-[#d2b179] text-[#17202b]'
                            : 'bg-[#f1e7d8] text-[#6f5a43] hover:bg-[#e8dcc9]',
                    ].join(' ')}
                    aria-label="画像を選択"
                >
                    <PhotoIcon />
                </button>

                <div className="min-w-0 flex-1">
                    <textarea
                        value={draft}
                        onChange={(event) => onDraftChange(event.target.value)}
                        rows={1}
                        maxLength={1000}
                        className="min-h-11 w-full resize-none bg-transparent px-1 py-2 text-sm leading-6 text-[#17202b] outline-none placeholder:text-[#9b8c78]"
                        placeholder={placeholder}
                        aria-label="メッセージ"
                        disabled={isSending || isPreparingImage}
                    />
                </div>

                <button
                    type="submit"
                    disabled={
                        isSending ||
                        isPreparingImage ||
                        (!draft.trim() && !selectedImage)
                    }
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#17202b] text-white transition hover:bg-[#243447] disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="送信"
                >
                    {isSending ? (
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                        <SendIcon />
                    )}
                </button>
            </div>

            <div className="px-1 text-right text-xs text-[#7a7066]">
                {draft.length}/1000
            </div>
        </>
    );
}
