import { useState } from 'react';
import { MobileHeaderMenu } from '../navigation/MobileHeaderMenu';
import { Link } from 'react-router-dom';
import { BrandMark } from '../brand/BrandMark';
import { BookingMessagesLink } from '../messages/BookingMessagesLink';
import { NotificationBellLink } from '../notifications/NotificationBellLink';
import { SupportCenterButton } from '../support/SupportCenterButton';
import { SupportCenterDrawer } from '../support/SupportCenterDrawer';
import { useAuth } from '../../hooks/useAuth';

export interface PublicHeaderAction {
    label: string;
    to: string;
    variant?: 'primary' | 'secondary';
    icon?: 'login' | 'register' | 'mypage';
    disabled?: boolean;
    onClick?: () => void;
}

function actionClass(variant: 'primary' | 'secondary', fullWidth = false, disabled = false): string {
    const widthClass = fullWidth ? 'w-full' : '';

    if (variant === 'secondary') {
        return [
            'inline-flex items-center justify-center gap-2.5 rounded-full border border-white/18 px-6 py-3 text-sm font-bold transition',
            disabled
                ? 'cursor-not-allowed bg-white/6 text-[#f7f1e6] opacity-60'
                : 'bg-white/6 text-[#f7f1e6] hover:bg-white/10',
            widthClass,
        ].join(' ');
    }

    return [
        'inline-flex items-center justify-center gap-2.5 rounded-full px-6 py-3 text-sm font-bold transition',
        disabled
            ? 'cursor-not-allowed bg-[#f1dfbd] text-[#17202b] opacity-60 shadow-[0_16px_30px_rgba(232,213,178,0.18)]'
            : 'bg-[#f1dfbd] text-[#17202b] shadow-[0_16px_30px_rgba(232,213,178,0.18)] hover:bg-[#f6e8cb]',
        widthClass,
    ].join(' ');
}

function ActionIcon({ icon }: { icon: NonNullable<PublicHeaderAction['icon']> }) {
    switch (icon) {
        case 'login':
            return (
                <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-[18px] w-[18px] shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
                    <path d="M10 16l4-4-4-4" />
                    <path d="M4 12h10" />
                </svg>
            );
        case 'register':
            return (
                <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-[18px] w-[18px] shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M15.5 19a5.5 5.5 0 0 0-11 0" />
                    <circle cx="10" cy="8" r="3.25" />
                    <path d="M19 8v6" />
                    <path d="M16 11h6" />
                </svg>
            );
        case 'mypage':
            return (
                <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-[18px] w-[18px] shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <circle cx="12" cy="8" r="3.25" />
                    <path d="M17.5 19a5.5 5.5 0 0 0-11 0" />
                </svg>
            );
    }
}

interface PublicHeaderBarProps {
    actions: PublicHeaderAction[];
    sticky?: boolean;
}

export function PublicHeaderBar({
    actions,
    sticky = false,
}: PublicHeaderBarProps) {
    const { activeRole, isAuthenticated } = useAuth();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isSupportCenterOpen, setIsSupportCenterOpen] = useState(false);
    const canUseSupportCenter = isAuthenticated && (activeRole === 'user' || activeRole === 'therapist');

    return (
        <div
            className={[
                'relative flex w-full items-center justify-between gap-4',
                sticky
                    ? 'rounded-[26px] border border-white/12 bg-[rgba(23,32,43,0.94)] px-4 py-3 shadow-[0_18px_45px_rgba(23,32,43,0.28)] backdrop-blur'
                    : 'border-0',
            ].join(' ')}
        >
            <BrandMark inverse />

            {actions.length > 0 || isAuthenticated ? (
                <>
                    <div className="hidden items-center gap-3 md:flex">
                        {isAuthenticated ? <NotificationBellLink className="border-white/15 bg-white/10 hover:bg-white/15" /> : null}
                        {canUseSupportCenter ? (
                            <SupportCenterButton
                                className="border-white/15 bg-white/10 hover:bg-white/15"
                                onClick={() => setIsSupportCenterOpen(true)}
                            />
                        ) : null}
                        {isAuthenticated ? <BookingMessagesLink className="border-white/15 bg-white/10 hover:bg-white/15" /> : null}
                        {actions.map((action) => action.onClick ? (
                            <button
                                key={`${action.label}-${action.to}`}
                                type="button"
                                onClick={action.onClick}
                                aria-disabled={action.disabled || undefined}
                                className={actionClass(action.variant ?? 'primary', false, action.disabled)}
                            >
                                {action.icon ? <ActionIcon icon={action.icon} /> : null}
                                {action.label}
                            </button>
                        ) : (
                            <Link key={`${action.label}-${action.to}`} to={action.to} className={actionClass(action.variant ?? 'primary')}>
                                {action.icon ? <ActionIcon icon={action.icon} /> : null}
                                {action.label}
                            </Link>
                        ))}
                    </div>

                    <MobileHeaderMenu
                        isOpen={isMenuOpen}
                        onToggle={() => setIsMenuOpen((value) => !value)}
                        onClose={() => setIsMenuOpen(false)}
                    >
                        {isAuthenticated ? <NotificationBellLink className="w-full border-white/15 bg-white/10 hover:bg-white/15" /> : null}
                        {canUseSupportCenter ? (
                            <SupportCenterButton
                                className="w-full border-white/15 bg-white/10 hover:bg-white/15"
                                onClick={() => { setIsMenuOpen(false); setIsSupportCenterOpen(true); }}
                            />
                        ) : null}
                        {isAuthenticated ? <BookingMessagesLink className="w-full border-white/15 bg-white/10 hover:bg-white/15" /> : null}
                            {actions.map((action) => action.onClick ? (
                                <button
                                    key={`${action.label}-${action.to}-mobile`}
                                    type="button"
                                    onClick={() => {
                                        setIsMenuOpen(false);
                                        action.onClick?.();
                                    }}
                                    aria-disabled={action.disabled || undefined}
                                    className={actionClass(action.variant ?? 'primary', true, action.disabled)}
                                >
                                    {action.icon ? <ActionIcon icon={action.icon} /> : null}
                                    {action.label}
                                </button>
                            ) : (
                                <Link
                                    key={`${action.label}-${action.to}-mobile`}
                                    to={action.to}
                                    onClick={() => setIsMenuOpen(false)}
                                    className={actionClass(action.variant ?? 'primary', true)}
                                >
                                    {action.icon ? <ActionIcon icon={action.icon} /> : null}
                                    {action.label}
                                </Link>
                            ))}
                    </MobileHeaderMenu>
                </>
            ) : null}
            {canUseSupportCenter ? (
                <SupportCenterDrawer
                    isOpen={isSupportCenterOpen}
                    onClose={() => setIsSupportCenterOpen(false)}
                />
            ) : null}
        </div>
    );
}
