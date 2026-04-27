import { Outlet } from 'react-router-dom';

export function BookingFlowLayout() {
    return (
        <div className="min-h-screen bg-[#f6f1e7] text-[#17202b]">
            <div className="mx-auto w-full max-w-[1280px] px-4 py-8 sm:px-6 md:px-10 md:py-12 xl:px-0">
                <Outlet />
            </div>
        </div>
    );
}
