import { SectionHomePage } from './SectionHomePage';

export function TherapistSettingsHubPage() {
    return (
        <SectionHomePage
            eyebrow="設定"
            title="各種設定へのショートカット"
            description="公開状態、受取口座、空き枠、売上、通知など、タチキャスト活動で使う設定先をまとめています。"
            actions={[
                { label: '公開・受付設定', to: '/therapist#settings-overview', description: 'プロフィール公開、オンライン受付、現在地更新をまとめて切り替えます。' },
                { label: '公開プロフィール', to: '/therapist/profile', description: '公開・非公開、写真、紹介文、対応内容を見直します。' },
                { label: '空き枠と出動拠点', to: '/therapist/availability', description: '公開枠、出動拠点、受付締切を管理します。' },
                { label: '受取設定', to: '/therapist/stripe-connect', description: '受取口座の登録と出金準備状況を確認します。' },
                { label: '売上と出金', to: '/therapist/balance', description: '売上残高、出金可能額、出金申請を確認します。' },
                { label: '準備状況', to: '/therapist/onboarding', description: '公開条件や本人確認の進み具合をまとめて確認します。' },
                { label: '通知一覧', to: '/notifications', description: '利用者、タチキャスト、運営向けの通知をまとめて確認します。' },
                { label: 'アカウント設定', to: '/profile', description: 'ログイン情報や共通プロフィールを見直します。' },
                { label: '出張リクエスト', to: '/therapist/travel-requests', description: '需要通知の確認と整理を行います。' },
            ]}
        />
    );
}
