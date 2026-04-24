# API一覧・エンドポイント設計

## 1. 目的

このドキュメントは、`requirements.md`、`screen_flows.md`、`db_design.md` をもとに、MVP実装に必要なAPIを整理する。

サービス名称は「すぐタチ」、本番ドメインは `sugutachi.com` とする。

## 2. API基本方針

### 2.1 ベースURL
* 本番Web: `https://sugutachi.com`
* API: `https://sugutachi.com/api/v1`
* Stripe Webhook: `https://sugutachi.com/webhooks/stripe`（API alias: `/api/webhooks/stripe`）

### 2.2 認証方式
* React PWAとLaravelを同一ドメインで運用する前提で、MVPではLaravel SanctumのSPA Cookie認証を第一候補とする。
* 管理画面も同一認証基盤を使い、`admin` ロールで権限管理する。
* Stripe WebhookはCookie認証を使わず、Stripe署名検証で認証する。

### 2.3 共通仕様
* JSON APIとする。
* すべてのAPIは原則 `Accept: application/json` を要求する。
* 外部に返すIDはDBの `id` ではなく `public_id` を使う。
* 管理APIも原則 `public_id` を使う。MVPで審査補助テーブル等の内部IDを使う場合は、管理画面内に限定し、一般ユーザー向けAPIには露出しない。
* 日時はISO 8601形式で返す。
* 金額はすべて税込の整数円で返す。
* ステータス値は `screen_flows.md` と `db_design.md` の定義に揃える。
* 緯度経度、詳細住所、本人確認書類の保存先、通報本文、健康情報などは、必要な権限・タイミング以外では返さない。

### 2.4 共通レスポンス形式

成功:

```json
{
  "data": {},
  "meta": {}
}
```

バリデーションエラー:

```json
{
  "message": "The given data was invalid.",
  "errors": {
    "field": ["エラーメッセージ"]
  }
}
```

業務エラー:

```json
{
  "message": "予約ステータスが不正です。",
  "code": "invalid_booking_status"
}
```

### 2.5 主なHTTPステータス
* `200 OK`: 取得・更新成功。
* `201 Created`: 作成成功。
* `202 Accepted`: 非同期処理受付。
* `204 No Content`: 削除・ログアウト成功。
* `400 Bad Request`: 不正なリクエスト。
* `401 Unauthorized`: 未ログイン。
* `403 Forbidden`: 権限なし。
* `404 Not Found`: 対象なし。
* `409 Conflict`: ステータス競合、二重操作。
* `422 Unprocessable Entity`: バリデーションエラー。
* `429 Too Many Requests`: レート制限。

## 3. 認証・アカウントAPI

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/sanctum/csrf-cookie` | Guest | Sanctum CSRF Cookie取得。Laravel標準ルート想定 |
| POST | `/auth/register` | Guest | 新規登録 |
| POST | `/auth/login` | Guest | ログイン |
| POST | `/auth/logout` | Auth | ログアウト |
| GET | `/me` | Auth | ログイン中アカウント取得 |
| PATCH | `/me` | Auth | 共通表示名、メール等の更新 |
| POST | `/me/switch-role` | Auth | 利用側/提供側/管理側の切替 |
| POST | `/auth/password/forgot` | Guest | パスワード再設定メール送信 |
| POST | `/auth/password/reset` | Guest | パスワード再設定 |
| POST | `/auth/email/verification-notification` | Auth | メール確認再送 |
| POST | `/auth/phone/send-code` | Auth | SMS認証コード送信 |
| POST | `/auth/phone/verify` | Auth | SMS認証コード確認 |

### 3.1 `POST /auth/register`

リクエスト:

```json
{
  "email": "user@example.com",
  "phone_e164": "+819012345678",
  "password": "password",
  "password_confirmation": "password",
  "display_name": "表示名",
  "accepted_terms_version": "2026-04-01",
  "accepted_privacy_version": "2026-04-01",
  "is_over_18": true,
  "relaxation_purpose_agreed": true
}
```

レスポンス:

```json
{
  "token_type": "Bearer",
  "access_token": "plain_text_token",
  "account": {
    "public_id": "acc_xxx",
    "email": "user@example.com",
    "display_name": "表示名",
    "roles": [
      {
        "role": "user",
        "status": "active"
      }
    ],
    "status": "active"
  }
}
```

## 4. 法務・静的情報API

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/service-meta` | Guest | サービス名、ドメイン、MVP設定値 |
| GET | `/legal-documents` | Guest | 公開中の法務文書一覧 |
| GET | `/legal-documents/{type}` | Guest | 種別ごとの最新文書取得 |
| POST | `/legal-documents/{public_id}/accept` | Auth | ログイン後の追加同意 |
| GET | `/help/faqs` | Guest | FAQ取得 |
| POST | `/contact` | Guest/Auth | 問い合わせ送信 |

### 4.1 一時ファイルAPI

本人確認書類、セルフィー、プロフィール写真は、各提出APIの前に一時ファイルとしてアップロードする。

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| POST | `/temp-files` | Auth | 一時ファイルアップロード |
| DELETE | `/temp-files/{file_id}` | Auth | 一時ファイル削除 |

`POST /temp-files` は `multipart/form-data` とする。

| フィールド | 必須 | 説明 |
| --- | --- | --- |
| file | Yes | 画像ファイル |
| purpose | Yes | identity_document, selfie, profile_photo |

レスポンス:

```json
{
  "data": {
    "file_id": "tmp_file_xxx",
    "purpose": "profile_photo",
    "expires_at": "2026-04-23T13:00:00+09:00"
  }
}
```

一時ファイルは、提出APIで参照された後に本保存または削除する。本人確認書類は長期保管を避け、確認完了後に原則削除する。

`GET /legal-documents` は `published_at` が設定された文書のうち、種別ごとの最新公開版を返す。`GET /legal-documents/{type}` はその種別の最新公開版を1件返す。`POST /legal-documents/{public_id}/accept` は認証済みユーザーの追加同意を1文書1回で記録し、同一文書への再送は冪等に扱う。

## 5. 本人確認・プロフィールAPI

### 5.1 本人確認

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/me/identity-verification` | Auth | 本人確認状態取得 |
| POST | `/me/identity-verification` | Auth | 本人確認提出 |
| POST | `/me/identity-verification/resubmit` | Auth | 差し戻し後の再提出 |

リクエスト例:

```json
{
  "full_name": "山田 太郎",
  "birthdate": "1990-01-01",
  "self_declared_male": true,
  "document_type": "driver_license",
  "document_file_id": "tmp_file_xxx",
  "selfie_file_id": "tmp_file_yyy"
}
```

MVPでは、Stripe Connect側で本人確認できるセラピストについては、アプリ本体の本人確認書類長期保存を避ける。

### 5.2 共通プロフィール

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/me/profile` | Auth | 共通プロフィール取得 |
| PATCH | `/me/profile` | Auth | 共通プロフィール更新 |
| POST | `/me/profile/photos` | Auth | 写真アップロード |
| DELETE | `/me/profile/photos/{photo_id}` | Auth | 写真削除 |

### 5.3 ユーザープロフィール

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/me/user-profile` | User | ユーザープロフィール取得 |
| PUT | `/me/user-profile` | User | ユーザープロフィール作成/更新 |
| PATCH | `/me/user-profile/sensitive-disclosure` | User | センシティブ項目の表示同意更新 |

リクエスト例:

```json
{
  "age_range": "30s",
  "body_type": "average",
  "height_cm": 172,
  "weight_range": "70_79",
  "preferences": {
    "pressure": "normal",
    "atmosphere": "quiet"
  },
  "touch_ng": ["face"],
  "health_notes": "腰に不安あり",
  "sexual_orientation": "gay",
  "gender_identity": "cis_male",
  "disclose_sensitive_profile_to_therapist": true
}
```

## 6. 施術場所・位置検索API

### 6.1 施術場所

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/me/service-addresses` | User | 登録済み施術場所一覧 |
| POST | `/me/service-addresses` | User | 施術場所登録 |
| GET | `/me/service-addresses/{public_id}` | User | 施術場所詳細 |
| PATCH | `/me/service-addresses/{public_id}` | User | 施術場所更新 |
| DELETE | `/me/service-addresses/{public_id}` | User | 施術場所削除 |
| POST | `/me/service-addresses/{public_id}/default` | User | 既定住所設定 |

### 6.2 セラピスト検索

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/therapists` | User | 稼働中セラピスト検索 |
| GET | `/therapists/{public_id}` | User | セラピスト詳細 |

`GET /therapists` クエリ:

| パラメータ | 必須 | 説明 |
| --- | --- | --- |
| service_address_id | Yes | 施術場所public_id |
| menu_duration_minutes | No | 希望時間 |
| start_type | No | now, scheduled |
| scheduled_start_at | No | 日時指定時 |
| sort | No | recommended, soonest, rating |

レスポンス例:

```json
{
  "data": [
    {
      "public_id": "thp_xxx",
      "public_name": "Ren",
      "bio_excerpt": "落ち着いたボディケアが得意です",
      "training_status": "completed",
      "rating_average": 4.8,
      "review_count": 12,
      "walking_time_range": "within_30_min",
      "estimated_total_amount": 9800,
      "photos": []
    }
  ]
}
```

緯度経度、正確な距離、詳細住所は返さない。

`GET /therapists` は、`profile_status=approved`、`is_online=true`、待機位置が `is_searchable=true`、最新の本人確認が `approved`、有効メニューあり、かつブロック関係がないセラピストのみを返す。検索は `service_address_id` に紐づく自分の施術場所を基準に行い、サーバー側で徒歩目安レンジと概算総額を算出する。`GET /therapists/{public_id}` は同じ公開条件を満たすセラピストの詳細を返し、`service_address_id` と `menu_duration_minutes` を付けた場合はメニューごとの概算総額も返す。`GET /therapists` には `30回/10分/アカウント` のレート制限を適用する。

## 7. セラピストAPI

### 7.1 セラピスト登録・状態

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/me/therapist-profile` | Therapist | 提供プロフィール取得 |
| PUT | `/me/therapist-profile` | Therapist | 提供プロフィール作成/更新 |
| POST | `/me/therapist-profile/submit-review` | Therapist | 審査提出 |
| GET | `/me/therapist-profile/review-status` | Therapist | 審査状態取得 |
| POST | `/me/therapist/online` | Therapist | オンライン化 |
| POST | `/me/therapist/offline` | Therapist | オフライン化 |
| PUT | `/me/therapist/location` | Therapist | 待機位置更新 |

`PUT /me/therapist-profile` は公開用プロフィールの下書き保存として扱い、初回作成時および承認後の編集時は `profile_status=draft` に戻す。`POST /me/therapist-profile/submit-review` は、少なくとも有効な提供メニューが1件以上あり、本人確認が `approved` の場合のみ受け付ける。`GET /me/therapist-profile/review-status` は現在の審査状態、再提出可否、未充足要件を返す。

`PUT /me/therapist/location` リクエスト:

```json
{
  "lat": 33.5902,
  "lng": 130.4017,
  "accuracy_m": 50,
  "source": "browser"
}
```

### 7.2 提供メニュー・料金

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/me/therapist/menus` | Therapist | メニュー一覧 |
| POST | `/me/therapist/menus` | Therapist | メニュー作成 |
| PATCH | `/me/therapist/menus/{menu_id}` | Therapist | メニュー更新 |
| DELETE | `/me/therapist/menus/{menu_id}` | Therapist | メニュー削除 |
| GET | `/me/therapist/pricing-rules` | Therapist | 料金ルール一覧 |
| POST | `/me/therapist/pricing-rules` | Therapist | 料金ルール作成 |
| PATCH | `/me/therapist/pricing-rules/{rule_id}` | Therapist | 料金ルール更新 |
| DELETE | `/me/therapist/pricing-rules/{rule_id}` | Therapist | 料金ルール削除 |

### 7.3 Stripe Connect

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/me/stripe-connect` | Therapist | Connected Account状態取得 |
| POST | `/me/stripe-connect/accounts` | Therapist | Connected Account作成 |
| POST | `/me/stripe-connect/account-link` | Therapist | Stripe-hosted onboarding URL発行 |
| POST | `/me/stripe-connect/refresh` | Therapist | Stripe状態の同期 |

レスポンス例:

```json
{
  "data": {
    "has_account": true,
    "stripe_account_id": "acct_xxx",
    "status": "active",
    "charges_enabled": true,
    "payouts_enabled": true,
    "details_submitted": true,
    "requirements_currently_due": [],
    "requirements_past_due": []
  }
}
```

## 8. 予約・決済API

### 8.1 見積もり・予約作成

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| POST | `/booking-quotes` | User | 自動見積もり作成 |
| POST | `/bookings` | User | 見積もりから予約作成 |
| GET | `/bookings` | User/Therapist | 自分の予約一覧 |
| GET | `/bookings/{public_id}` | User/Therapist/Admin | 予約詳細 |

`POST /booking-quotes` リクエスト:

```json
{
  "therapist_profile_id": "thp_xxx",
  "therapist_menu_id": "menu_xxx",
  "service_address_id": "addr_xxx",
  "duration_minutes": 90,
  "is_on_demand": true,
  "requested_start_at": null
}
```

レスポンス例:

```json
{
  "data": {
    "quote_id": "quote_xxx",
    "expires_at": "2026-04-23T12:00:00+09:00",
    "amounts": {
      "base_amount": 9000,
      "travel_fee_amount": 500,
      "night_fee_amount": 0,
      "matching_fee_amount": 300,
      "total_amount": 9800,
      "therapist_net_amount": 8550
    },
    "walking_time_range": "within_30_min"
  }
}
```

### 8.2 カード与信・Stripe

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| POST | `/bookings/{public_id}/payment-intents` | User | PaymentIntent作成、client_secret取得 |
| POST | `/bookings/{public_id}/payment-sync` | User | Webhook後の状態同期 |
| POST | `/webhooks/stripe` | Stripe | Stripe Webhook受信 |
| POST | `/api/webhooks/stripe` | Stripe | Stripe Webhook受信のAPI alias |

PaymentIntentは原則manual captureとし、与信成功はStripe Webhookを正とする。クライアントからの `payment-sync` は画面更新用であり、決済確定の唯一の根拠にはしない。

`payment-sync` はStripeへ再照会せず、Webhookで反映済みのローカル状態を返す。レスポンスには現在の予約状態と `is_current = true` のPaymentIntentを含める。

### 8.3 セラピスト承諾・進行

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/me/therapist/booking-requests` | Therapist | 未対応リクエスト一覧 |
| POST | `/bookings/{public_id}/accept` | Therapist | リクエスト承諾 |
| POST | `/bookings/{public_id}/reject` | Therapist | リクエスト拒否 |
| POST | `/bookings/{public_id}/moving` | Therapist | 移動開始 |
| POST | `/bookings/{public_id}/arrived` | Therapist | 到着 |
| POST | `/bookings/{public_id}/start` | Therapist | 施術開始 |
| POST | `/bookings/{public_id}/complete` | Therapist | 施術終了 |
| POST | `/bookings/{public_id}/user-complete-confirmation` | User | ユーザー側終了確認 |

各ステータス変更APIは、現在ステータスが許可された遷移元でない場合 `409 Conflict` を返す。

MVPの基本ステータス遷移:

```text
payment_authorizing
  ├─ requested
  │   ├─ accepted
  │   │   └─ moving
  │   │       └─ arrived
  │   │           └─ in_progress
  │   │               └─ therapist_completed
  │   │                   └─ completed
  │   └─ rejected
  └─ payment_canceled
```

`complete` はセラピスト側の施術終了報告、`user-complete-confirmation` はユーザー側の終了確認とする。決済captureはStripe Webhook/運営ルールと接続するため、MVP初期のステータスAPI単体では実行しない。

### 8.4 キャンセル・中断

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| POST | `/bookings/{public_id}/cancel-preview` | User/Therapist | キャンセル料の事前計算 |
| POST | `/bookings/{public_id}/cancel` | User/Therapist | キャンセル確定 |
| POST | `/bookings/{public_id}/interrupt` | User/Therapist | 施術中断 |

`POST /bookings/{public_id}/cancel-preview` レスポンス例:

```json
{
  "data": {
    "cancel_fee_amount": 4900,
    "refund_amount": 4900,
    "policy_code": "within_3_hours_full",
    "policy_label": "3時間前以降キャンセル",
    "payment_action": "capture_full_amount"
  }
}
```

キャンセル確定時は予約ステータスを `canceled` に変更し、`booking_status_logs.metadata_json` にキャンセル料、返金予定額、ポリシー、必要な決済アクションを保存する。Stripeの与信取消・キャンセル料capture・差額返金は、後続の決済処理で `payment_action` に従って実行する。

### 8.5 同意・体調確認

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| POST | `/bookings/{public_id}/consents` | User/Therapist | 予約ごとの同意記録 |
| POST | `/bookings/{public_id}/health-checks` | User/Therapist | 施術前体調確認 |

## 9. メッセージ・通知API

### 9.1 メッセージ

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/bookings/{public_id}/messages` | User/Therapist/Admin | 予約メッセージ一覧 |
| POST | `/bookings/{public_id}/messages` | User/Therapist | メッセージ送信 |
| POST | `/bookings/{public_id}/messages/{message_id}/read` | User/Therapist | 既読化 |

メッセージ送信時は、電話番号、SNS ID、メールアドレス、外部決済情報らしき文字列を検知する。MVPでは検知時に `422` を返し、送信・保存しない。

### 9.2 通知

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/notifications` | Auth | アプリ内通知一覧 |
| POST | `/notifications/{id}/read` | Auth | 既読化 |
| POST | `/push-subscriptions` | Auth | Web Push購読登録 |
| DELETE | `/push-subscriptions/{id}` | Auth | Web Push購読解除 |

Push購読情報はエンドポイントをハッシュ化して重複管理し、エンドポイント・鍵情報は暗号化して保存する。MVPではアプリ内通知の保存・既読管理とPush購読管理までを実装し、実配信は後続のキュー処理で接続する。

## 10. レビュー・通報・返金API

### 10.1 レビュー

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/therapists/{public_id}/reviews` | User | 公開レビュー一覧 |
| POST | `/bookings/{public_id}/reviews` | User/Therapist | レビュー投稿 |
| GET | `/me/reviews` | User/Therapist | 自分に関するレビュー一覧 |

レビューは `therapist_completed` または `completed` の予約に対して、予約参加者のみ投稿できる。同一予約に対する同一アカウントのレビューは1件までとし、ユーザーからセラピストへの `visible` レビューのみセラピスト公開レビュー一覧に表示する。非公開フィードバックは運営確認用として暗号化保存する。

### 10.2 通報・ブロック

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| POST | `/reports` | Auth | 通報・事故報告作成 |
| GET | `/reports/{public_id}` | Auth/Admin | 自分の通報詳細、管理者は全件 |
| POST | `/accounts/{public_id}/block` | Auth | ブロック |
| DELETE | `/accounts/{public_id}/block` | Auth | ブロック解除 |

予約に紐づく通報は予約参加者のみ作成でき、対象アカウントを指定する場合は当該予約の参加者に限定する。通報詳細は暗号化保存し、作成時に `report_actions` へ `report_created` を記録する。MVPの一般ユーザー向け詳細表示は通報者本人のみ許可する。

`POST /reports` リクエスト:

```json
{
  "booking_id": "book_xxx",
  "target_account_id": "acc_xxx",
  "category": "prohibited_request",
  "severity": "medium",
  "detail": "詳細"
}
```

### 10.3 返金・紛争

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| POST | `/bookings/{public_id}/refund-requests` | User | 返金申請 |
| GET | `/bookings/{public_id}/refund-requests` | User/Therapist/Admin | 返金申請一覧 |
| GET | `/refund-requests/{public_id}` | User/Therapist/Admin | 返金申請詳細 |

返金申請はMVPでは `requested` として保存し、運営審査後に管理APIから承認・却下する。ユーザーは `therapist_completed`、`completed`、`canceled` の予約に対して申請でき、同一予約に未処理申請がある場合は `409 Conflict` を返す。

## 11. 売上・出金API

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/me/therapist/ledger` | Therapist | 売上台帳 |
| GET | `/me/therapist/balance` | Therapist | 確定済み/保留中/申請中/支払済みの集計 |
| GET | `/me/therapist/payout-requests` | Therapist | 出金申請一覧 |
| POST | `/me/therapist/payout-requests` | Therapist | 出金申請 |
| GET | `/me/therapist/payout-requests/{public_id}` | Therapist | 出金申請詳細 |

ユーザーが施術完了確認を行った時点で、セラピスト売上を `therapist_ledger_entries` に `pending` として記録する。出金申請は `available` かつ未申請の台帳合計に対して行い、MVPでは利用可能残高全額の申請のみ受け付ける。出金処理予定日は、1〜10日申請分は15日、11〜20日申請分は25日、21日〜月末申請分は翌月5日とする。

`POST /me/therapist/payout-requests` リクエスト:

```json
{
  "requested_amount": 30000
}
```

レスポンス:

```json
{
  "data": {
    "public_id": "po_req_xxx",
    "status": "payout_requested",
    "requested_amount": 30000,
    "fee_amount": 0,
    "net_amount": 30000,
    "scheduled_process_date": "2026-05-15"
  }
}
```

## 12. 管理API

管理APIは `/api/v1/admin` 配下に置く。すべて `admin` ロール必須。

### 12.1 ダッシュボード・アカウント

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/admin/dashboard` | 管理ダッシュボード集計 |
| GET | `/admin/accounts` | アカウント一覧 |
| GET | `/admin/accounts/{public_id}` | アカウント詳細 |
| POST | `/admin/accounts/{public_id}/suspend` | アカウント停止 |
| POST | `/admin/accounts/{public_id}/restore` | アカウント復旧 |
| GET | `/admin/audit-logs` | 監査ログ一覧 |

アカウント停止は `admin` ロールのみ実行でき、自分自身は停止できない。停止時は `status=suspended`、停止理由、停止日時を保存し、対象アカウントの既存APIトークンを失効させる。復旧時は `status=active` に戻し、停止理由と停止日時をクリアする。停止・復旧操作は `admin_audit_logs` に記録する。

監査ログ一覧は `actor_account_id`、`action`、`target_type`、`target_id` で絞り込める。`before_json` / `after_json` は管理者にのみ返す。

ダッシュボードは未処理件数を優先して返す。少なくとも、アカウント総数・停止中件数、本人確認待ち、セラピスト審査待ち、写真審査待ち、未解決通報、返金申請待ち、出金申請待ち、進行中の予約件数を含める。

### 12.2 審査

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/admin/identity-verifications` | 本人確認一覧 |
| POST | `/admin/identity-verifications/{id}/approve` | 本人確認承認 |
| POST | `/admin/identity-verifications/{id}/reject` | 本人確認差し戻し |
| GET | `/admin/therapist-profiles` | セラピスト一覧 |
| POST | `/admin/therapist-profiles/{public_id}/approve` | セラピスト承認 |
| POST | `/admin/therapist-profiles/{public_id}/reject` | セラピスト差し戻し |
| POST | `/admin/therapist-profiles/{public_id}/suspend` | 表示停止 |
| GET | `/admin/profile-photos` | 写真審査一覧 |
| POST | `/admin/profile-photos/{id}/approve` | 写真承認 |
| POST | `/admin/profile-photos/{id}/reject` | 写真差し戻し |

本人確認は `pending` のみ承認・差し戻しできる。承認時は `status=approved`、`is_age_verified=true`、審査者、審査日時を保存する。差し戻し時は `status=rejected`、`is_age_verified=false`、差し戻し理由を保存する。本人確認・年齢確認の審査操作は `admin_audit_logs` に記録する。

セラピストプロフィールは `pending` のみ承認・差し戻しできる。承認時は `profile_status=approved`、承認者、承認日時を保存する。差し戻し時は `profile_status=rejected`、差し戻し理由を保存し、オンライン表示を停止する。表示停止は `approved` のみ対象とし、`profile_status=suspended` にしてオンライン表示を停止する。各操作は `admin_audit_logs` に記録する。

プロフィール写真は `pending` のみ承認・差し戻しできる。承認時は写真を `approved`、差し戻し時は `rejected` にし、審査者、審査日時、差し戻し理由を保存する。セラピストプロフィールに紐づく写真の場合は `photo_review_status` も同期する。各操作は `admin_audit_logs` に記録する。

### 12.3 予約・通報・返金

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/admin/bookings` | 予約一覧 |
| GET | `/admin/bookings/{public_id}` | 予約詳細 |
| GET | `/admin/reports` | 通報一覧 |
| GET | `/admin/reports/{public_id}` | 通報詳細 |
| POST | `/admin/reports/{public_id}/actions` | 通報対応履歴追加 |
| POST | `/admin/reports/{public_id}/resolve` | 通報解決 |
| GET | `/admin/refund-requests` | 返金申請一覧 |
| POST | `/admin/refund-requests/{public_id}/approve` | 返金承認 |
| POST | `/admin/refund-requests/{public_id}/reject` | 返金却下 |
| GET | `/admin/stripe-disputes` | チャージバック一覧 |

返金承認は `admin` ロールのみ実行できる。承認時はStripe Refundを作成し、Stripe側の返金ID、承認額、審査者、審査日時、処理日時を `refunds` に保存する。承認・却下操作は `admin_audit_logs` に記録する。

通報一覧は本文を返さず、詳細APIのみ通報本文と対応履歴を返す。詳細閲覧、対応履歴追加、解決操作は `admin_audit_logs` に記録する。対応履歴追加時に未割当の通報は操作した管理者へ自動割当し、解決時は `status=resolved` と `resolved_at` を保存する。

### 12.4 出金・設定

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/admin/payout-requests` | 出金申請一覧 |
| POST | `/admin/payout-requests/{public_id}/hold` | 出金保留 |
| POST | `/admin/payout-requests/{public_id}/release` | 出金保留解除 |
| POST | `/admin/payout-requests/{public_id}/process` | 出金処理開始 |
| GET | `/admin/platform-fee-settings` | 料金設定一覧 |
| POST | `/admin/platform-fee-settings` | 料金設定作成 |
| GET | `/admin/legal-documents` | 法務文書一覧 |
| POST | `/admin/legal-documents` | 法務文書作成 |
| PATCH | `/admin/legal-documents/{id}` | 法務文書更新 |

出金申請は `payout_requested` のみ保留・処理開始できる。保留時は紐づく台帳も `held` にし、保留解除時は `payout_requested` に戻す。処理開始は原則 `scheduled_process_date` 当日以降のみ許可し、Stripe Payout作成後はStripe側ステータスに応じて `processing` / `paid` / `failed` に更新する。運営操作は `admin_audit_logs` に記録する。

料金設定は `setting_key` ごとに履歴管理し、`value_json` に設定本体を保持する。`active_from` 未指定時は作成時刻を採用し、`active_until` は任意とする。一覧では `is_active` を返し、必要に応じて `setting_key` / `is_active` で絞り込める。

法務文書は `document_type` と `version` の組み合わせで一意管理する。一覧では `document_type` / `is_published` で絞り込める。公開済み文書は後から上書きせず、新しい `version` を作成して差し替える運用を基本とするため、更新APIは未公開または公開前のドラフト文書の調整用途として扱う。作成・更新操作は `admin_audit_logs` に記録する。

主要な管理一覧APIは、状態や対象アカウントでの絞り込みに加えて `sort` / `direction` を受け付ける。例として、本人確認一覧は `account_id` / `document_type`、セラピスト一覧は `account_id` / `training_status` / `q`、写真一覧は `account_id` / `therapist_profile_id` / `usage_type`、通報一覧は `booking_id` / `reporter_account_id` / `target_account_id` / `assigned_admin_account_id`、返金一覧は `booking_id` / `requested_by_account_id`、出金一覧は `therapist_account_id` / `scheduled_from` / `scheduled_to` を想定する。管理ダッシュボードは各保留件数に対応する一覧APIの `path` と推奨クエリを `navigation` として返す。

## 13. Webhook・バッチ

### 13.1 Stripe Webhook

| Method | Path | 認証 | 用途 |
| --- | --- | --- | --- |
| POST | `/webhooks/stripe` | Stripe署名 | Stripeイベント受信 |

主な処理対象:
* `account.updated`: Connected Account状態同期。`charges_enabled`、`payouts_enabled`、`details_submitted`、追加確認項目、無効理由、最終同期日時を更新する。
* `payment_intent.amount_capturable_updated`: 与信成功、予約を `payment_authorizing` から `requested` へ進める。
* `payment_intent.succeeded`: 決済確定。
* `payment_intent.canceled`: 与信取消。承諾前の予約は `payment_canceled` へ進める。
* `charge.refunded`: Stripe上で処理された返金を `refunds` に反映する。
* `charge.dispute.created`: チャージバックを `stripe_disputes` に作成し、運営確認・売上保留対象にする。
* `charge.dispute.closed`: チャージバック結果を `stripe_disputes` に反映する。
* `payout.paid`: 出金成功。`payout_requests` を `paid` にし、紐づく台帳を `paid` にする。
* `payout.failed`: 出金失敗。`payout_requests` を `failed` にし、失敗理由を保存する。紐づく台帳は `available` に戻し、再申請可能にする。

### 13.2 バッチ/スケジューラ

| 処理 | 頻度 | 内容 |
| --- | --- | --- |
| 予約リクエスト期限切れ | 1分ごと | `requested` かつ期限切れを `expired` へ |
| 予約前リマインド | 5分ごと | 開始前通知 |
| 安全アラート確認 | 10分ごと | 大幅遅延を検知しアプリ内記録 |
| 売上解放 | 1時間ごと | 保留期間終了後に `available_balance` へ |
| 出金処理対象抽出 | 毎日 | 5日/15日/25日の出金対象を抽出 |
| Webhook再処理 | 5分ごと | `failed` のStripeイベント再処理 |
| 一時本人確認ファイル削除 | 毎日 | `purge_after` 超過ファイル削除 |

## 14. 権限制御

### 14.1 ロール別アクセス
* Guest: 公開トップ、法務文書、FAQ、問い合わせ、登録、ログイン。
* Auth: 共通プロフィール、本人確認、通知。
* User: 施術場所、セラピスト検索、予約作成、支払い、レビュー、通報、返金申請。
* Therapist: 提供プロフィール、Stripe Connect、稼働管理、リクエスト承諾、施術進行、売上、出金。
* Admin: 審査、通報、返金、出金、チャージバック、監査ログ、法務文書管理。

### 14.2 予約アクセス制御
予約詳細にアクセスできるのは以下のみ。
* 予約のユーザー本人。
* 予約のセラピスト本人。
* 運営管理者。

予約確定前は、セラピストにユーザーの詳細住所を返さない。予約承諾・決済完了後のみ、必要最小限の住所情報を返す。

### 14.3 センシティブ情報
* 性的指向・性自認等の任意プロフィールは、ユーザーが同意した場合のみセラピストへ返す。
* 価格算定に使うプロフィール項目と、セラピストへ表示するセンシティブ自己申告項目はAPIレスポンス上も分ける。
* 管理APIで本人確認書類、詳細住所、通報本文、健康情報を返す場合は、`admin_audit_logs` に閲覧ログを残す。

## 15. レート制限

| 対象 | 制限案 |
| --- | --- |
| ログイン | 5回/分/IP |
| SMS送信 | 3回/時/アカウント |
| セラピスト検索 | 30回/10分/アカウント |
| 位置更新 | 12回/時/セラピスト |
| 予約リクエスト | 5回/10分/ユーザー |
| メッセージ送信 | 30通/10分/予約 |
| 通報送信 | 10件/日/アカウント |
| 出金申請 | 3回/日/セラピスト |

## 16. 実装順メモ

API実装は以下の順に進める。

1. Auth / Me / Legal。
2. 本人確認・プロフィール。
3. セラピストプロフィール・メニュー・料金設定。
4. 施術場所・セラピスト検索。
5. 予約見積もり・予約作成。
6. Stripe Connect・PaymentIntent・Webhook。
7. 予約ステータス進行。
8. メッセージ・通知。
9. レビュー・通報・返金。
10. 売上台帳・出金申請。
11. 管理API。
