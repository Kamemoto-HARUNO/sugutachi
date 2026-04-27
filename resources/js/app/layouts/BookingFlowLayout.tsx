import { Outlet } from 'react-router-dom';
import { NotificationBellLink } from '../components/notifications/NotificationBellLink';

export function BookingFlowLayout() {
    return (
        <div className="min-h-screen bg-[#f6f1e7] text-[#17202b]">
            <div className="mx-auto w-full max-w-[1280px] px-4 py-8 sm:px-6 md:px-10 md:py-12 xl:px-0">
                <div className="mb-5 flex justify-end">
                    <NotificationBellLink className="border-[#d9c9b3] bg-white text-[#17202b] hover:bg-[#f3eadb]" />
                </div>
                <Outlet />
            </div>
        </div>
    );
}
