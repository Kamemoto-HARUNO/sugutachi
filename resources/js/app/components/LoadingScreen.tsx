interface LoadingScreenProps {
    title?: string;
    message?: string;
}

export function LoadingScreen({
    title = '読み込み中',
    message = '画面の準備をしています。',
}: LoadingScreenProps) {
    return (
        <div className="flex min-h-screen items-center justify-center px-6 py-16">
            <div className="w-full max-w-md space-y-5 text-center">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-rose-300" />
                <div className="space-y-2">
                    <h1 className="text-2xl font-semibold text-white">{title}</h1>
                    <p className="text-sm leading-6 text-slate-300">{message}</p>
                </div>
            </div>
        </div>
    );
}
