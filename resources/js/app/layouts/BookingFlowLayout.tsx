import { Outlet } from 'react-router-dom';
import { NotificationBellLink } from '../components/notifications/NotificationBellLink';

export function BookingFlowLayout() {
    return (
        <div className="min-h-screen bg-[#f6f1e7] text-[#17202b]">
            <div className="mx-auto w-full max-w-[1280px] px-4 py-8 sm:px-6 md:px-10 md:py-12 xl:px-0">
                <div className="sticky top-4 z-20 mb-5 flex justify-end">
                    <NotificationBellLink className="border-[#b5894d] bg-[#17202b] px-5 text-white shadow-[0_16px_28px_rgba(23,32,43,0.22)] hover:bg-[#243140]" />
                </div>
                <Outlet />
            </div>
        </div>
    );
}
