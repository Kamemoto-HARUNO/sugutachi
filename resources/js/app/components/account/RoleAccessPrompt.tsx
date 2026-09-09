import { useNavigate } from 'react-router-dom';
import { formatRoleLabel, type RoleName } from '../../lib/account';

export function RoleAccessPrompt({ role, onContinue }: { role: RoleName; onContinue: () => void }) {
    const navigate = useNavigate();
    return <main className="mx-auto max-w-lg px-5 py-12 text-slate-100">
        <div className="rounded-3xl border border-white/15 bg-slate-800 p-6">
            <h1 className="text-xl font-bold">{formatRoleLabel(role)}モードで開きます</h1>
            <p className="my-4 text-sm leading-7 text-slate-300">このページは{formatRoleLabel(role)}として利用する画面です。切り替えると、表示・操作に使うプロフィールが変わります。</p>
            <button type="button" onClick={onContinue} className="min-h-11 w-full rounded-full bg-white px-5 py-3 font-semibold text-slate-900">{formatRoleLabel(role)}モードに切り替えて開く</button>
            <button type="button" onClick={() => navigate(-1)} className="mt-3 min-h-11 w-full rounded-full border border-white/20 px-5 py-3">戻る</button>
        </div>
    </main>;
}
