import { Link, useNavigate, useParams } from 'react-router-dom';
import { BrandMark } from '../components/brand/BrandMark';
import { SupportCenterDrawer } from '../components/support/SupportCenterDrawer';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { getMyPageEntryPath } from '../lib/account';

export function SupportTicketPage() {
    const { publicId } = useParams();
    const navigate = useNavigate();
    const { account, activeRole } = useAuth();
    const myPagePath = getMyPageEntryPath(account, activeRole);

    usePageTitle('サポートチケット | サポートセンター');

    return (
        <div className="min-h-screen bg-[#f5efe4] px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
                <BrandMark />
                <div className="flex items-center gap-3">
                    <Link to="/help" className="text-sm font-semibold text-[#516072]">
                        FAQ
                    </Link>
                    <Link to={myPagePath} className="rounded-full bg-[#17202b] px-4 py-2 text-sm font-semibold text-white">
                        マイページ
                    </Link>
                </div>
            </div>

            <main className="mx-auto mt-16 w-full max-w-2xl text-center">
                <p className="text-xs font-semibold tracking-wide text-[#8f5c22]">サポートセンター</p>
                <h1 className="mt-3 text-3xl font-semibold text-[#17202b]">チケット詳細を表示しています</h1>
                <p className="mt-4 text-sm leading-7 text-[#5b6470]">
                    このURLは通知から直接開けるサポートチケットのリンクです。詳細とチャットは右側のサポートドロワー内で確認できます。
                </p>
            </main>

            <SupportCenterDrawer
                isOpen
                initialTicketPublicId={publicId ?? null}
                onClose={() => {
                    if (window.history.length > 1) {
                        navigate(-1);
                        return;
                    }

                    navigate(myPagePath, { replace: true });
                }}
            />
        </div>
    );
}
