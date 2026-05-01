import { Link } from 'react-router-dom';
import { BrandMark } from '../components/brand/BrandMark';
import { usePageTitle } from '../hooks/usePageTitle';

export function AccountWithdrawalCompletePage() {
    usePageTitle('退会完了');

    return (
        <div className="mx-auto flex min-h-[70vh] w-full max-w-[720px] items-center px-4 py-10 sm:px-6 lg:px-8">
            <section className="w-full rounded-[32px] border border-white/10 bg-[#0f1722] p-8 text-center shadow-[0_24px_60px_rgba(2,6,23,0.24)] sm:p-10">
                <div className="flex justify-center">
                    <BrandMark inverse compact />
                </div>

                <div className="mt-8 space-y-4">
                    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold tracking-wide text-slate-200">
                        手続き完了
                    </span>
                    <h1 className="text-[2.2rem] font-semibold leading-[1.3] text-white sm:text-[2.8rem]">
                        退会が完了しました
                    </h1>
                    <p className="text-sm leading-7 text-slate-300">
                        ご利用ありがとうございました。必要になった場合は、あらためて新規登録からご利用ください。
                    </p>
                </div>

                <div className="mt-8">
                    <Link
                        to="/"
                        className="inline-flex min-h-11 items-center rounded-full bg-[#f3dec0] px-5 py-3 text-sm font-semibold text-[#17202b] transition hover:bg-[#f7e7cd]"
                    >
                        トップに戻る
                    </Link>
                </div>
            </section>
        </div>
    );
}
