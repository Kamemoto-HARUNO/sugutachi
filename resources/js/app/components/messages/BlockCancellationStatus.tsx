export function BlockCancellationStatus({ status }: { status?: string }) {
    if (!status || status === "resolved") return null;
    return (
        <p
            role="status"
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-900"
        >
            {status === "complete"
                ? "決済の取消・返金処理が完了しました。明細への反映には決済会社所定の日数がかかります。"
                : status === "review"
                  ? "運営がこの予約と精算を確認しています。確認が完了するまで、自動決済とチャット送信は停止します。"
                  : "予約をキャンセルしました。利用者負担は0円です。決済の取消・返金を処理しています。"}
        </p>
    );
}
