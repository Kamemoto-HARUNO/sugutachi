import type { NavItem, PlaceholderRouteDefinition } from './types';

export const publicNavItems: NavItem[] = [
    { label: 'ホーム', to: '/' },
    { label: 'ヘルプ', to: '/help' },
    { label: '規約', to: '/terms' },
    { label: 'プライバシー', to: '/privacy' },
    { label: '特商法', to: '/commerce' },
];

export const userNavItems: NavItem[] = [
    { label: 'ダッシュボード', to: '/user', exact: true },
    { label: '探す', to: '/user/therapists' },
    { label: '予約', to: '/user/bookings' },
    { label: 'プロフィール', to: '/user/profile' },
    { label: '住所', to: '/user/service-addresses' },
    { label: '通報', to: '/user/reports' },
];

export const therapistNavItems: NavItem[] = [
    { label: 'ダッシュボード', to: '/therapist', exact: true },
    { label: '準備状況', to: '/therapist/onboarding' },
    { label: 'プロフィール', to: '/therapist/profile' },
    { label: '料金', to: '/therapist/pricing' },
    { label: '空き枠', to: '/therapist/availability' },
    { label: '予約依頼', to: '/therapist/requests' },
    { label: 'レビュー', to: '/therapist/reviews' },
    { label: '予約', to: '/therapist/bookings' },
    { label: '出張リクエスト', to: '/therapist/travel-requests' },
    { label: '売上', to: '/therapist/balance' },
];

export const adminNavItems: NavItem[] = [
    { label: 'ダッシュボード', to: '/admin', exact: true },
    { label: 'アカウント', to: '/admin/accounts' },
    { label: 'セラピスト', to: '/admin/therapist-profiles' },
    { label: '予約', to: '/admin/bookings' },
    { label: '通報', to: '/admin/reports' },
    { label: '問い合わせ', to: '/admin/contact-inquiries' },
    { label: '料金ルール', to: '/admin/pricing-rules' },
];

export const userPlaceholderRoutes: PlaceholderRouteDefinition[] = [
    { path: 'profile', title: '利用者プロフィール', description: '基本プロフィールと公開設定を整える画面です。', apiPath: '/api/me/profile' },
    { path: 'service-addresses', title: '施術場所', description: '来てほしい場所やデフォルト住所を管理します。', apiPath: '/api/me/service-addresses' },
    { path: 'therapists', title: 'セラピスト検索', description: '近くのセラピストや公開中の条件を探す画面です。', apiPath: '/api/therapists' },
    { path: 'therapists/:publicId', title: 'セラピスト詳細', description: 'プロフィール、メニュー、レビュー、料金根拠を確認します。', apiPath: '/api/therapists/{public_id}' },
    { path: 'therapists/:publicId/availability', title: '空き時間', description: '公開中の予定予約ウィンドウを確認してリクエストを送る画面です。', apiPath: '/api/therapists/{public_id}/availability' },
    { path: 'therapists/:publicId/travel-request', title: '出張リクエスト送信', description: '予約できないエリアから需要を届ける画面です。', apiPath: '/api/therapists/{public_id}/travel-requests' },
    { path: 'booking-request', title: '今すぐ予約入力', description: '施術場所やメニューを入力して見積もりに進みます。', apiPath: '/api/booking-quotes' },
    { path: 'booking-request/quote', title: '見積もり確認', description: '料金内訳と徒歩目安を確認する画面です。', apiPath: '/api/booking-quotes' },
    { path: 'booking-request/payment', title: '支払い確認', description: '与信取得と支払い状態の確認を行う画面です。', apiPath: '/api/bookings/{public_id}/payment-intents' },
    { path: 'booking-request/waiting', title: '予約待機', description: 'セラピストの応答待ちや与信状態を確認します。', apiPath: '/api/bookings/{public_id}' },
    { path: 'bookings', title: '予約一覧', description: '予約ステータスや未読メッセージを一覧で確認します。', apiPath: '/api/bookings' },
    { path: 'bookings/:publicId', title: '予約詳細', description: '決済、返金、同意、体調確認まで含めた詳細画面です。', apiPath: '/api/bookings/{public_id}' },
    { path: 'bookings/:publicId/messages', title: '予約メッセージ', description: '予約ごとのメッセージ履歴と未読状況を扱います。', apiPath: '/api/bookings/{public_id}/messages' },
    { path: 'bookings/:publicId/review', title: 'レビュー投稿', description: '施術後レビューを送信する画面です。', apiPath: '/api/bookings/{public_id}/reviews' },
    { path: 'bookings/:publicId/cancel', title: '予約キャンセル', description: 'キャンセル条件と決済内訳を確認して手続きを進めます。', apiPath: '/api/bookings/{public_id}/cancel-preview' },
    { path: 'bookings/:publicId/refund', title: '返金申請', description: '返金申請の理由入力と履歴確認を行います。', apiPath: '/api/bookings/{public_id}/refund-requests' },
    { path: 'bookings/:publicId/report', title: '通報送信', description: '予約に紐づく通報や安全報告を送る画面です。', apiPath: '/api/reports' },
    { path: 'reports', title: '通報履歴', description: '自分が送った通報の履歴を確認します。', apiPath: '/api/reports' },
    { path: 'blocks', title: 'ブロック一覧', description: 'ブロック中の相手や解除導線を管理します。', apiPath: '/api/accounts/blocks' },
];

export const therapistPlaceholderRoutes: PlaceholderRouteDefinition[] = [
    { path: 'onboarding', title: 'オンボーディング', description: '本人確認、規約同意、公開準備の入口です。', apiPath: '/api/me/therapist-profile/review-status' },
    { path: 'identity-verification', title: '本人確認', description: '本人確認と年齢確認の提出・再提出を行います。', apiPath: '/api/me/identity-verification' },
    { path: 'stripe-connect', title: 'Stripe Connect', description: '受取口座の連携と審査状態を管理します。', apiPath: '/api/me/stripe-connect' },
    { path: 'profile', title: 'セラピストプロフィール', description: '公開プロフィールの編集と審査提出を行います。', apiPath: '/api/me/therapist-profile' },
    { path: 'photos', title: 'プロフィール写真', description: '写真アップロードと審査状態を管理します。', apiPath: '/api/me/profile/photos' },
    { path: 'pricing', title: '料金ルール', description: '動的料金やメニューごとの調整ルールを設定します。', apiPath: '/api/me/therapist/pricing-rules' },
    { path: 'availability', title: '空き枠管理', description: '予定予約用の設定と公開空き枠を管理します。', apiPath: '/api/me/therapist/availability-slots' },
    { path: 'requests', title: '予約依頼一覧', description: '今すぐ予約と予定予約の依頼を確認します。', apiPath: '/api/me/therapist/booking-requests' },
    { path: 'requests/:publicId', title: '予約依頼詳細', description: '承認時バッファや拒否理由を扱う画面です。', apiPath: '/api/bookings/{public_id}' },
    { path: 'bookings', title: '予約一覧', description: '進行中・完了済みの予約を管理します。', apiPath: '/api/bookings' },
    { path: 'bookings/:publicId', title: '予約詳細', description: '予約進行、同意記録、返金まで確認します。', apiPath: '/api/bookings/{public_id}' },
    { path: 'bookings/:publicId/messages', title: '予約メッセージ', description: '利用者との連絡やメッセージ状態を確認します。', apiPath: '/api/bookings/{public_id}/messages' },
    { path: 'travel-requests', title: '出張リクエスト一覧', description: '都道府県別の需要通知を一覧で確認します。', apiPath: '/api/me/therapist/travel-requests' },
    { path: 'travel-requests/:publicId', title: '出張リクエスト詳細', description: '受信した需要通知の本文や既読状態を確認します。', apiPath: '/api/me/therapist/travel-requests/{public_id}' },
    { path: 'balance', title: '残高', description: '売上残高、出金可能額、次回処理日を確認します。', apiPath: '/api/me/therapist/balance' },
    { path: 'payouts', title: '出金申請', description: '出金申請履歴と現在の申請状況を管理します。', apiPath: '/api/me/therapist/payout-requests' },
    { path: 'reviews', title: 'レビュー', description: '自分に届いたレビューと平均評価を確認します。', apiPath: '/api/me/reviews' },
    { path: 'settings', title: '稼働設定', description: 'オンライン状態や通知設定をまとめる画面です。', apiPath: '/api/me/therapist-profile' },
];

export const adminPlaceholderRoutes: PlaceholderRouteDefinition[] = [
    { path: 'accounts', title: 'アカウント一覧', description: '利用者・セラピスト・運営アカウントを管理します。', apiPath: '/api/admin/accounts' },
    { path: 'accounts/:publicId', title: 'アカウント詳細', description: '停止や復旧判断のための詳細確認画面です。', apiPath: '/api/admin/accounts/{public_id}' },
    { path: 'identity-verifications', title: '本人確認審査', description: '本人確認・年齢確認の審査一覧です。', apiPath: '/api/admin/identity-verifications' },
    { path: 'therapist-profiles', title: 'セラピストプロフィール審査', description: 'プロフィール審査や停止中プロフィールを扱います。', apiPath: '/api/admin/therapist-profiles' },
    { path: 'therapist-profiles/:publicId', title: 'セラピストプロフィール詳細', description: '写真、位置、Stripe 状態まで確認できる詳細画面です。', apiPath: '/api/admin/therapist-profiles/{public_id}' },
    { path: 'profile-photos', title: '写真審査', description: 'プロフィール写真の審査一覧です。', apiPath: '/api/admin/profile-photos' },
    { path: 'bookings', title: '予約管理', description: '予約一覧、決済、返金、メッセージ監視を扱います。', apiPath: '/api/admin/bookings' },
    { path: 'bookings/:publicId', title: '予約詳細監視', description: '予約進行、安全記録、返金状況を確認します。', apiPath: '/api/admin/bookings/{public_id}' },
    { path: 'bookings/:publicId/messages', title: '予約メッセージ監視', description: '危険メッセージの確認と運営対応を行います。', apiPath: '/api/admin/bookings/{public_id}/messages' },
    { path: 'reports', title: '通報一覧', description: '通報の受付、調査、解決を行います。', apiPath: '/api/admin/reports' },
    { path: 'reports/:publicId', title: '通報詳細', description: '通報内容、監査ログ、対応履歴を確認します。', apiPath: '/api/admin/reports/{public_id}' },
    { path: 'refund-requests', title: '返金申請', description: '返金申請の承認・却下を行う画面です。', apiPath: '/api/admin/refund-requests' },
    { path: 'payout-requests', title: '出金申請', description: '出金申請の保留・処理・解除を行います。', apiPath: '/api/admin/payout-requests' },
    { path: 'stripe-disputes', title: 'Stripe Disputes', description: 'チャージバックや異議申し立て状況を管理します。', apiPath: '/api/admin/stripe-disputes' },
    { path: 'contact-inquiries', title: '問い合わせ管理', description: '問い合わせの確認、メモ、解決を行います。', apiPath: '/api/admin/contact-inquiries' },
    { path: 'travel-requests', title: '出張リクエスト監視', description: '需要通知の監視、警告、送信制限を扱います。', apiPath: '/api/admin/travel-requests' },
    { path: 'travel-requests/:publicId', title: '出張リクエスト詳細', description: '出張リクエスト本文と運営メモを確認します。', apiPath: '/api/admin/travel-requests/{public_id}' },
    { path: 'pricing-rules', title: '料金ルール監視', description: '危険な料金ルールや監視フラグを確認します。', apiPath: '/api/admin/pricing-rules' },
    { path: 'pricing-rules/:id', title: '料金ルール詳細', description: '条件や内部メモを確認する詳細画面です。', apiPath: '/api/admin/pricing-rules/{id}' },
    { path: 'legal-documents', title: '法務文書管理', description: '利用規約や特商法文書の編集・公開を行います。', apiPath: '/api/admin/legal-documents' },
    { path: 'platform-fee-settings', title: 'プラットフォーム料設定', description: '料金率や履歴を管理します。', apiPath: '/api/admin/platform-fee-settings' },
    { path: 'audit-logs', title: '監査ログ', description: '管理操作の監査ログを確認します。', apiPath: '/api/admin/audit-logs' },
];
