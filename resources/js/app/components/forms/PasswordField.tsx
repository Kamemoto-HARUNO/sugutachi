import { useState, type ChangeEventHandler } from 'react';

interface PasswordFieldProps {
    id: string;
    label: string;
    value: string;
    onChange: ChangeEventHandler<HTMLInputElement>;
    placeholder?: string;
    autoComplete?: string;
    required?: boolean;
    className?: string;
    inputClassName?: string;
}

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

export function PasswordField({
    id,
    label,
    value,
    onChange,
    placeholder,
    autoComplete,
    required = false,
    className = 'space-y-2',
    inputClassName = 'w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 pr-12 text-sm outline-none transition focus:border-[#c6a16a]',
}: PasswordFieldProps) {
    const [isVisible, setIsVisible] = useState(false);

    return (
        <div className={className}>
            <label htmlFor={id} className="block text-sm font-semibold">
                {label}
            </label>
            <div className="relative">
                <input
                    id={id}
                    type={isVisible ? 'text' : 'password'}
                    value={value}
                    onChange={onChange}
                    className={inputClassName}
                    placeholder={placeholder}
                    autoComplete={autoComplete}
                    required={required}
                />
                <button
                    type="button"
                    onClick={() => setIsVisible((current) => !current)}
                    aria-label={isVisible ? `${label}を隠す` : `${label}を表示する`}
                    aria-pressed={isVisible}
                    className="absolute inset-y-0 right-3 inline-flex items-center justify-center text-[#8f7a57] transition hover:text-[#5d4724]"
                >
                    {isVisible ? <EyeOffIcon /> : <EyeIcon />}
                </button>
            </div>
        </div>
    );
}
