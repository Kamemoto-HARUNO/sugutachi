function EyeIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-[18px] w-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}

function EyeOffIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-[18px] w-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M3 3l18 18" />
            <path d="M10.6 10.6a3 3 0 0 0 4.24 4.24" />
            <path d="M9.88 5.09A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a19 19 0 0 1-3.06 4.19" />
            <path d="M6.61 6.61A18.7 18.7 0 0 0 2 12s3.5 7 10 7a10.78 10.78 0 0 0 5.39-1.61" />
        </svg>
    );
}

interface PasswordVisibilityToggleButtonProps {
    isVisible: boolean;
    label: string;
    onClick: () => void;
}

export function PasswordVisibilityToggleButton({
    isVisible,
    label,
    onClick,
}: PasswordVisibilityToggleButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={isVisible ? `${label}を隠す` : `${label}を表示する`}
            aria-pressed={isVisible}
            className="absolute inset-y-0 right-3 inline-flex items-center justify-center text-[#8f7a57] transition hover:text-[#5d4724]"
        >
            {isVisible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
    );
}
