import { useMemo } from 'react';
import { Outlet } from 'react-router-dom';
import { PublicHeaderBar, type PublicHeaderAction } from '../components/public/PublicHeaderBar';
import { useAuth } from '../hooks/useAuth';
import { getMyPageEntryPath } from '../lib/account';

export function BookingFlowLayout() {
    const { account, activeRole, isAuthenticated } = useAuth();
    const myPagePath = getMyPageEntryPath(account, activeRole);
    const headerActions = useMemo<PublicHeaderAction[]>(() => {
        if (!isAuthenticated) {
            return [];
        }

        return [
            {
                label: 'マイページ',
                to: myPagePath,
                icon: 'mypage',
            },
        ];
    }, [isAuthenticated, myPagePath]);

    return (
        <div className="min-h-screen bg-[#f6f1e7] text-[#17202b]">
            <div className="mx-auto w-full max-w-[1280px] px-4 py-8 sm:px-6 md:px-10 md:py-12 xl:px-0">
                <div className="mode-booking-header sticky top-4 z-20 mb-6">
                    <PublicHeaderBar actions={headerActions} sticky />
                </div>
                <Outlet />
            </div>
        </div>
    );
}
