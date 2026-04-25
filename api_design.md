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
| GET | `/service-meta` | Guest | サービス名、ドメイン、MVP設定値、特商法向け公開設定 |
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

`GET /service-meta` は公開向けの基本設定に加え、特商法表示で利用する `commerce_notice` を返す。`commerce_notice` には事業者名、代表者名、連絡先、役務提供時期、キャンセル/返金方針の要約、対応する法務文書種別に加えて、公開中の `commerce` 文書サマリを含める。あわせて `legal_documents` として、公開中の `terms` / `privacy` / `commerce` の最新版サマリと取得導線を返す。

`GET /legal-documents` は `published_at` が設定された文書のうち、種別ごとの最新公開版を返す。各文書には `path` と `accept_path` を含める。`GET /legal-documents/{type}` はその種別の最新公開版を1件返す。`POST /legal-documents/{public_id}/accept` は認証済みユーザーの追加同意を1文書1回で記録し、同一文書への再送は冪等に扱う。

初期文面の整備用として `php artisan legal-documents:sync-default-drafts` を用意し、`terms` / `privacy` / `commerce` のMVP草案を現在のサービス設定値で下書き同期できるようにする。公開前に管理画面から実文面へ更新し、公開日時を設定する運用とする。

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

`POST /me/identity-verification/resubmit` は、最新の本人確認レコードが `rejected` の場合のみ受け付ける。差し戻し済みレコードは履歴として残しつつ、新しい `pending` レコードを作成する。

MVPでは、Stripe Connect側で本人確認できるセラピストについては、アプリ本体の本人確認書類長期保存を避ける。

### 5.2 共通プロフィール

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/me/profile` | Auth | 共通プロフィール取得 |
| PATCH | `/me/profile` | Auth | 共通プロフィール更新 |
| POST | `/me/profile/photos` | Auth | 写真アップロード |
| DELETE | `/me/profile/photos/{photo_id}` | Auth | 写真削除 |

`GET /me/profile` はアカウントの表示名、電話番号、ロール、本人確認状態、登録済みプロフィール写真一覧を返す。`PATCH /me/profile` では `display_name` と `phone_e164` を更新でき、電話番号が変更された場合は `phone_verified_at` を `null` に戻す。

`POST /me/profile/photos` は、事前に `POST /temp-files` でアップロードした `purpose=profile_photo` の一時ファイルを `temp_file_id` で受け取り、正式なプロフィール写真として保存する。セラピストプロフィールが存在する場合は `usage_type=therapist_profile` を優先し、アップロード時点では写真ステータスを `pending` にする。

### 5.3 ユーザープロフィール

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/me/user-profile` | User | ユーザープロフィール取得 |
| PUT | `/me/user-profile` | User | ユーザープロフィール作成/更新 |
| PATCH | `/me/user-profile/sensitive-disclosure` | User | センシティブ項目の表示同意更新 |

`GET /me/user-profile` は未作成時に `data=null` を返す。`PUT /me/user-profile` は既存値を保持しながら利用者プロフィールを作成・更新し、`age_range` / `body_type` / `height_cm` / `weight_range` がそろった場合に `profile_status=active`、不足がある場合に `profile_status=incomplete` とする。`PATCH /me/user-profile/sensitive-disclosure` はセンシティブ項目の開示同意だけを更新し、プロフィール未作成時は `incomplete` なレコードを自動作成する。

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

施術場所一覧・詳細は `postal_code` / `address_line` / `building` / `access_notes` / `lat` / `lng` を返す。初回登録時は自動で `is_default=true` とし、`POST /me/service-addresses/{public_id}/default` 実行時は自分の他の施術場所の `is_default` を解除してから対象のみ `true` にする。`PATCH /me/service-addresses/{public_id}` は部分更新で、`lat` / `lng` を変更する場合は両方同時指定を必須とする。

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
      "therapist_cancellation_count": 1,
      "walking_time_range": "within_30_min",
      "estimated_total_amount": 9800,
      "photos": []
    }
  ]
}
```

緯度経度、正確な距離、詳細住所は返さない。

`GET /therapists` で `start_type=now` を指定した場合は、`profile_status=approved`、`is_online=true`、待機位置が `is_searchable=true`、最新の本人確認が `approved`、有効メニューあり、かつブロック関係がないセラピストのみを返す。検索は `service_address_id` に紐づく自分の施術場所を基準に行い、サーバー側で徒歩目安レンジと概算総額を算出する。

`GET /therapists` で `start_type=scheduled` を指定した場合は、`profile_status=approved`、最新の本人確認が `approved`、有効メニューあり、予定予約用基本地点と受付締切設定が登録済み、公開中の空きスケジュールがある、かつブロック関係がないセラピストを返す。このモードでは `is_online` や現在地の `is_searchable` は必須にしない。`scheduled_start_at` を付けた場合は、その日時に予約可能なセラピストに絞り込む。

`GET /therapists` と `GET /therapists/{public_id}` は、ユーザー向け透明性として `therapist_cancellation_count` を含める。`GET /therapists/{public_id}` は、指定した `start_type` に対応する公開条件を満たすセラピスト詳細を返し、`service_address_id` と `menu_duration_minutes` を付けた場合はメニューごとの概算総額も返す。`GET /therapists` には `30回/10分/アカウント` のレート制限を適用する。

### 6.3 公開空きスケジュール

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/therapists/{public_id}/availability` | User | セラピストの公開空き時間取得 |

`GET /therapists/{public_id}/availability` クエリ:

| パラメータ | 必須 | 説明 |
| --- | --- | --- |
| service_address_id | Yes | 施術場所public_id |
| therapist_menu_id | Yes | 予約希望メニュー |
| date | Yes | 取得対象日（`YYYY-MM-DD`） |

レスポンス例:

```json
{
  "data": {
    "date": "2026-04-25",
    "walking_time_range": "within_30_min",
    "estimated_total_amount_range": {
      "min": 9800,
      "max": 10800
    },
    "windows": [
      {
        "availability_slot_id": "slot_xxx",
        "start_at": "2026-04-25T14:00:00+09:00",
        "end_at": "2026-04-25T18:00:00+09:00",
        "booking_deadline_at": "2026-04-25T13:00:00+09:00",
        "dispatch_area_label": "天神周辺"
      }
    ]
  }
}
```

このAPIは、生の空き枠ではなく「そのメニューが連続して入れられる予約可能時間帯」を返す。サーバー側では、公開中の単発空きスケジュールから、同時間帯の `requested` / `accepted` / `confirmed` 以降の予定予約、承諾済みバッファ、受付締切、同一時刻帯のオンデマンド稼働制約を差し引いて連続ウィンドウを算出する。距離・徒歩目安・概算金額は、ユーザーの施術場所と、空き枠に紐づく出動拠点をもとに算出する。空き枠に個別拠点がない場合のみ、セラピストの予定予約用基本地点を使う。対応エリア外の空き枠は返さない。

## 7. セラピストAPI

### 7.1 セラピスト登録・状態

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/me/therapist-profile` | Therapist | 提供プロフィール取得 |
| PUT | `/me/therapist-profile` | Therapist | 提供プロフィール作成/更新 |
| POST | `/me/therapist-profile/submit-review` | Therapist | 審査提出 |
| GET | `/me/therapist-profile/review-status` | Therapist | 審査状態取得 |
| GET | `/me/therapist/scheduled-booking-settings` | Therapist | 予定予約設定取得 |
| PUT | `/me/therapist/scheduled-booking-settings` | Therapist | 予定予約設定更新 |
| POST | `/me/therapist/online` | Therapist | オンライン化 |
| POST | `/me/therapist/offline` | Therapist | オフライン化 |
| PUT | `/me/therapist/location` | Therapist | 待機位置更新 |

`PUT /me/therapist-profile` は公開用プロフィールの下書き保存として扱い、初回作成時および承認後の編集時は `profile_status=draft` に戻す。`POST /me/therapist-profile/submit-review` は、少なくとも有効な提供メニューが1件以上あり、本人確認が `approved` の場合のみ受け付ける。`GET /me/therapist-profile/review-status` は現在の審査状態、再提出可否、未充足要件を返す。

`POST /me/therapist/online` は `profile_status=approved` かつ検索可能な待機位置が保存済みの場合のみ受け付ける。`POST /me/therapist/offline` は表示状態のみをオフへ戻す。`PUT /me/therapist/location` は待機位置更新だけを担当し、オンライン状態の切替は行わない。

`GET /me/therapist/scheduled-booking-settings` / `PUT /me/therapist/scheduled-booking-settings` では、予定予約の受付締切分数と予定予約用基本地点を扱う。受付締切のデフォルトは60分とし、基本地点は公開せず距離・徒歩目安・交通費算定にのみ利用する。

`PUT /me/therapist/scheduled-booking-settings` リクエスト例:

```json
{
  "booking_request_lead_time_minutes": 60,
  "scheduled_base_location": {
    "lat": 33.5902,
    "lng": 130.4017,
    "accuracy_m": 50,
    "label": "福岡市中央区の拠点"
  }
}
```

`PUT /me/therapist/location` リクエスト:

```json
{
  "lat": 33.5902,
  "lng": 130.4017,
  "accuracy_m": 50,
  "source": "browser"
}
```

待機位置は「今すぐ依頼」のための現在地管理に使い、予定予約の距離計算には使わない。

### 7.2 公開空きスケジュール

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/me/therapist/availability-slots` | Therapist | 自分の空き時間一覧 |
| POST | `/me/therapist/availability-slots` | Therapist | 空き時間作成 |
| PATCH | `/me/therapist/availability-slots/{public_id}` | Therapist | 空き時間更新 |
| DELETE | `/me/therapist/availability-slots/{public_id}` | Therapist | 空き時間削除 |

`GET /me/therapist/availability-slots` は `from` / `to` / `status` で絞り込める。空き時間は単発のみで、開始・終了とも15分単位、未来時刻のみ受け付ける。

`POST /me/therapist/availability-slots` リクエスト例:

```json
{
  "start_at": "2026-04-25T14:00:00+09:00",
  "end_at": "2026-04-25T20:00:00+09:00",
  "status": "published",
  "dispatch_base_type": "default",
  "dispatch_area_label": "天神周辺"
}
```

枠ごとに別拠点を使う場合のリクエスト例:

```json
{
  "start_at": "2026-04-26T11:00:00+09:00",
  "end_at": "2026-04-26T16:00:00+09:00",
  "status": "published",
  "dispatch_base_type": "custom",
  "dispatch_area_label": "博多駅周辺",
  "custom_dispatch_base": {
    "lat": 33.5898,
    "lng": 130.4207,
    "accuracy_m": 80,
    "label": "博多駅方面"
  }
}
```

空き時間同士の重複は受け付けない。`dispatch_base_type` は `default` または `custom` とし、`custom` の場合は枠専用の出動拠点とユーザー向け公開エリア名を保存する。`PATCH` / `DELETE` は、同時間帯に `requested` 以上の予定予約が存在する場合は `409 Conflict` を返す。`status=hidden` にした空き時間は新規受付対象から外す。セラピストがオンデマンドで稼働中の間は、現在時刻から6時間以内に開始する空き時間は公開設定が `published` でも新規受付対象から除外する。

### 7.3 提供メニュー・料金

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/me/therapist/menus` | Therapist | メニュー一覧 |
| POST | `/me/therapist/menus` | Therapist | メニュー作成 |
| PATCH | `/me/therapist/menus/{menu_id}` | Therapist | メニュー更新 |
| DELETE | `/me/therapist/menus/{menu_id}` | Therapist | メニュー削除 |

`POST /me/therapist/menus` は新規メニューを作成する。`PATCH /me/therapist/menus/{menu_id}` では名称、説明、施術時間、基本料金、有効状態、表示順を更新できる。`DELETE /me/therapist/menus/{menu_id}` は未使用メニューのみ削除でき、予約または見積もりで参照済みのメニューは `409 Conflict` を返す。

メニューの新規作成・削除、および `name` / `description` / `duration_minutes` / `base_price_amount` / `is_active` の変更は、停止中を除くセラピストプロフィールを `draft` に戻し、オンライン表示を停止する。`sort_order` のみの変更では審査状態を変えない。

料金ルールAPI:

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/me/therapist/pricing-rules` | Therapist | 料金ルール一覧 |
| POST | `/me/therapist/pricing-rules` | Therapist | 料金ルール作成 |
| PATCH | `/me/therapist/pricing-rules/{rule_id}` | Therapist | 料金ルール更新 |
| DELETE | `/me/therapist/pricing-rules/{rule_id}` | Therapist | 料金ルール削除 |

MVP 時点の `rule_type` は `user_profile_attribute` / `time_band` / `walking_time_range` / `demand_level` を受け付ける。

`user_profile_attribute` の条件オブジェクトは `field` / `operator` / `value` または `values` を持ち、対応フィールドは `age_range` / `body_type` / `height_cm` / `weight_range` / `sexual_orientation` / `gender_identity`。`height_cm` は `equals` / `not_equals` / `gte` / `lte` / `between`、その他の項目は `equals` / `not_equals` / `in` / `not_in` を使う。

`time_band` は `condition.start_hour` と `condition.end_hour` を受け取り、`22 -> 6` のような日跨ぎ時間帯も指定できる。オンデマンド見積もりでは現在時刻、予定予約では `requested_start_at` の時刻を使う。

`walking_time_range` は `within_15_min` / `within_30_min` / `within_60_min` / `outside_area` のいずれかを `condition.value` または `condition.values` に指定する。`demand_level` は `normal` / `busy` / `peak` を同様に指定する。需要レベルは MVP ではオンデマンド見積もり時のみ計算し、同セラピストのアクティブなオンデマンド予約数が `0=normal` / `1=busy` / `2件以上=peak` となる。

`adjustment_type` は `fixed_amount` または `percentage` とし、パーセンテージは基本料金に対して適用する。同じメニューに対して適用される複数ルールは `priority` の昇順で評価し、同一 priority ではメニュー個別ルールをプロフィール共通ルールより先に適用する。`min_price_amount` / `max_price_amount` を指定した場合は、各ルール適用後の小計をその範囲に丸める。

`POST /me/therapist/pricing-rules` リクエスト例:

```json
{
  "therapist_menu_id": "menu_xxx",
  "rule_type": "walking_time_range",
  "condition": {
    "operator": "in",
    "values": ["within_30_min", "within_60_min"]
  },
  "adjustment_type": "fixed_amount",
  "adjustment_amount": 1500,
  "min_price_amount": null,
  "max_price_amount": null,
  "priority": 20,
  "is_active": true
}
```

### 7.4 Stripe Connect

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

`GET /bookings` は `role=user|therapist|all` / `status` / `request_type=on_demand|scheduled` / `scheduled_from` / `scheduled_to` / `sort` / `direction` で絞り込める。レスポンスには `request_type`、`counterparty`、`therapist_profile`、`therapist_menu`、`service_address`、`unread_message_count`、`refund_count`、`open_report_count`、`latest_message_sent_at` を含め、予約一覧タブの描画に必要な文脈をまとめて返す。

`GET /bookings/{public_id}` は参加者本人のみ参照でき、`cancel_reason_note` / `canceled_by_role` / `canceled_by_account` に加えて、現在の `current_payment_intent`、返金集計の `refund_breakdown`、返金明細の `refunds`、予約ごとの `consents`、施術前の `health_checks` を返す。`refund_breakdown` には `refund_count` / `auto_refund_count` / `requested_amount_total` / `approved_amount_total` / `processed_amount_total` を含める。

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

予定予約時のリクエスト例:

```json
{
  "therapist_profile_id": "thp_xxx",
  "therapist_menu_id": "menu_xxx",
  "service_address_id": "addr_xxx",
  "availability_slot_id": "slot_xxx",
  "duration_minutes": 90,
  "is_on_demand": false,
  "requested_start_at": "2026-04-25T14:00:00+09:00"
}
```

見積もり対象のセラピストは、公開検索に表示可能な条件を満たしていることを前提とする。`is_on_demand=true` の場合は、アクティブなアカウント、承認済み本人確認、承認済みかつオンラインのセラピストプロフィール、有効なメニュー、検索可能な待機位置、相互ブロックなし、を満たさない場合は見積もりを作成できない。

`is_on_demand=false` の場合は、承認済み本人確認、承認済みプロフィール、有効メニュー、予定予約用基本地点または枠専用出動拠点、公開中の空き時間、相互ブロックなしに加え、`availability_slot_id` が対象セラピストの公開枠であること、`requested_start_at` と `duration_minutes` が15分単位であること、指定した開始時刻と所要時間が対象枠の連続予約可能時間帯に収まること、セラピスト設定の受付締切前であることを満たす必要がある。距離・徒歩目安・交通費算定は現在地ではなく、対象空き枠に紐づく出動拠点を使う。

予定予約の `POST /bookings` は仮押さえ付き予約を作成する。作成時点で、同一ユーザーによる同一セラピスト向けの未処理予定予約が存在しないこと、かつ全セラピスト合計で同一ユーザーの未処理予定予約が2件以下であることを検証する。`request_expires_at` は `created_at + 6時間`、`requested_start_at - booking_request_lead_time_minutes`、`requested_start_at` のうち最も早い時刻を採用し、その時刻に未承諾なら `expired` へ遷移する。セラピストがオンデマンドで稼働中の場合、現在時刻から6時間以内に開始する予定予約は作成できない。

レスポンス例:

```json
{
  "data": {
    "quote_id": "quote_xxx",
    "expires_at": "2026-04-23T12:00:00+09:00",
    "is_on_demand": false,
    "requested_start_at": "2026-04-25T14:00:00+09:00",
    "availability_slot_id": "slot_xxx",
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

予定予約では、予約リクエスト直後に `POST /bookings/{public_id}/payment-intents` を実行してカード与信を確保し、与信成功後に `requested` へ進める。拒否、失効、承諾前キャンセル時はAuthorizationを取り消し、仮押さえを解放する。

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

`GET /me/therapist/booking-requests` は未対応の `requested` を返す。予定予約については、`dispatch_area_label`、希望開始/終了時刻、メニュー名、施術場所の都道府県・市区町村、`request_expires_at`、残り承諾秒数/分数を含め、承諾優先度を判断しやすい形にする。

`POST /bookings/{public_id}/accept` リクエスト例:

```json
{
  "buffer_before_minutes": 30,
  "buffer_after_minutes": 30
}
```

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

`requested` はオンデマンド・予定予約の両方で使うが、予定予約では「カード与信済みかつ時間帯を仮押さえ中」の意味を持つ。予定予約の `accept` では `buffer_before_minutes` と `buffer_after_minutes` を必須にし、確定後の重複判定は施術時間にこの前後バッファを加えて行う。`reject` は仮押さえ解放と与信取消を伴う。セラピストのオンデマンド稼働中に、開始時刻が現在から6時間以内の予定予約を承諾することはできない。

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

`POST /bookings/{public_id}/cancel` は `reason_code` を必須とし、セラピスト都合キャンセルでは追加で `reason_note` を必須とする。レスポンスの `booking` には `cancel_reason_note` / `canceled_by_role` / `canceled_by_account` / `current_payment_intent` / `refund_breakdown` / `refunds` を含める。

キャンセル確定時は予約ステータスを `canceled` に変更し、`canceled_by_account_id` / `cancel_reason_code` / `booking_status_logs.metadata_json` にキャンセル料、返金予定額、ポリシー、必要な決済アクションを保存する。`payment_action=void_authorization` は現在の PaymentIntent 与信を即時取消し、`capture_full_amount` は即時capture、`capture_cancel_fee_and_refund_remaining` は即時capture後に差額返金まで実行する。自動返金が発生した場合は `refunds` にシステム起票の履歴を残す。

セラピスト都合キャンセルでは `reason_code` に加えてユーザー向け表示用の `reason_note` を必須とし、通知本文にも反映する。確定時にはセラピスト都合キャンセル回数を加算し、公開プロフィール詳細でユーザーが確認できるようにする。キャンセル通知は `booking_canceled` として保存し、`data.booking_public_id` / `data.reason_code` / `data.reason_note` / `data.canceled_by_role` を含める。

`POST /bookings/{public_id}/interrupt` は `moving` / `arrived` / `in_progress` の参加者のみ実行できる。`reason_code`、`responsibility=user|therapist|shared|force_majeure|unknown` を受け取り、予約を `interrupted` に遷移させる。レスポンスには更新後の `booking`、運営確認用の自動起票 `report`、適用した `payment_action` を含める。`responsibility=user` は全額請求、その他は原則全額返金として扱う。中断時は `booking_interrupted` 通知を相手方へ保存し、同時に `reports` に `category=booking_interrupted` の open レコードを作成する。

### 8.5 同意・体調確認

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| POST | `/bookings/{public_id}/consents` | User/Therapist | 予約ごとの同意記録 |
| POST | `/bookings/{public_id}/health-checks` | User/Therapist | 施術前体調確認 |

`POST /bookings/{public_id}/consents` は参加者本人の `consent_type` を1予約1種別で記録し、同じ `consent_type` の再送は更新として扱う。必要に応じて公開済み `legal_document_id` を関連付ける。

`POST /bookings/{public_id}/health-checks` は参加者本人の施術前体調申告を記録する。`drinking_status` / `has_injury` / `has_fever` / `contraindications[]` / `notes` を受け取り、`booking_id + account_id + role` 単位で最新値に更新する。

## 9. メッセージ・通知API

### 9.1 メッセージ

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/bookings/{public_id}/messages` | User/Therapist | 予約メッセージ一覧 |
| POST | `/bookings/{public_id}/messages` | User/Therapist | メッセージ送信 |
| POST | `/bookings/{public_id}/messages/{message_id}/read` | User/Therapist | 既読化 |

メッセージ送信時は、電話番号、SNS ID、メールアドレス、外部決済情報らしき文字列を検知する。MVPでは検知時に `422` を返し、送信・保存しない。

`GET /bookings/{public_id}/messages` は `read_status=read|unread` で絞り込める。レスポンス `meta` には `booking_public_id` / `booking_status` / `unread_count` / `counterparty` を含め、各メッセージには `sender` / `sender_role` / `is_own` / `is_read` を返す。`POST /bookings/{public_id}/messages/{message_id}/read` は相手から届いた未読メッセージのみ既読化し、送信者本人が叩いた場合は状態を変更しない。

### 9.2 出張リクエスト

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| POST | `/therapists/{public_id}/travel-requests` | User | 出張リクエスト送信 |
| GET | `/me/therapist/travel-requests` | Therapist | 受信した出張リクエスト一覧 |
| GET | `/me/therapist/travel-requests/{public_id}` | Therapist | 出張リクエスト詳細 |
| POST | `/me/therapist/travel-requests/{public_id}/read` | Therapist | 出張リクエスト既読化 |
| POST | `/me/therapist/travel-requests/{public_id}/archive` | Therapist | 一覧整理のためのアーカイブ |

`POST /therapists/{public_id}/travel-requests` リクエスト例:

```json
{
  "prefecture": "福岡県",
  "message": "来月に博多へ行く予定があるので、そのタイミングでお願いしたいです。"
}
```

出張リクエストは予約ではなく、承諾義務や日程拘束を発生させない。送信時は、対象セラピストが公開可能状態であること、相互ブロック関係がないこと、短時間の重複送信でないことを確認する。同一ユーザーから同一セラピストへの出張リクエストは、少なくとも同一都道府県について7日以内の重複送信を禁止し、アカウント全体にもレート制限を設ける。

本文は予約メッセージと同様に、電話番号、SNS ID、メールアドレス、外部決済情報らしき文字列を検知した場合は `422` を返して保存しない。MVPではユーザーからの一方向送信のみで、アプリ内返信APIは持たない。

`GET /me/therapist/travel-requests` は `status` / `prefecture` / `submitted_from` / `submitted_to` / `q` / `sort` / `direction` で絞り込める。レスポンスには希望都道府県、メッセージ、送信者の公開プロフィール最小情報、受信日時、既読状態を含める。`archive` は一覧整理用であり、送信者への通知は行わない。

### 9.3 通知

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/notifications` | Auth | アプリ内通知一覧 |
| POST | `/notifications/{id}/read` | Auth | 既読化 |
| POST | `/push-subscriptions` | Auth | Web Push購読登録 |
| DELETE | `/push-subscriptions/{id}` | Auth | Web Push購読解除 |

Push購読情報はエンドポイントをハッシュ化して重複管理し、エンドポイント・鍵情報は暗号化して保存する。MVPではアプリ内通知の保存・既読管理とPush購読管理までを実装し、実配信は後続のキュー処理で接続する。

`GET /notifications` は `notification_type` / `status` / `read_status` / `limit` で絞り込める。レスポンス `meta.unread_count` には、現在の絞り込み条件とは別にアカウント全体の未読件数を返し、通知バッジ描画に使えるようにする。各通知には `is_read` を含める。

予約関連の主な通知種別は `booking_requested` / `booking_accepted` / `booking_canceled` / `booking_interrupted` / `booking_refunded` とし、`data.booking_public_id` を共通キーとして持つ。`booking_requested` はセラピスト向け、`booking_accepted` はユーザー向け、`booking_canceled` は相手方または決済失敗時のユーザー向け、`booking_interrupted` は中断相手方への安全通知、`booking_refunded` は返金対象ユーザー向けに送る。

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
| GET | `/reports` | Auth | 自分が送信した通報一覧 |
| GET | `/reports/{public_id}` | Auth/Admin | 自分の通報詳細、管理者は全件 |
| GET | `/accounts/blocks` | Auth | 自分がブロックした相手一覧 |
| POST | `/accounts/{public_id}/block` | Auth | ブロック |
| DELETE | `/accounts/{public_id}/block` | Auth | ブロック解除 |

予約に紐づく通報は予約参加者のみ作成でき、対象アカウントを指定する場合は当該予約の参加者に限定する。通報詳細は暗号化保存し、作成時に `report_actions` へ `report_created` を記録する。MVPの一般ユーザー向け詳細表示は通報者本人のみ許可する。`GET /reports` は通報者本人が送信した履歴のみを返し、`booking_id` / `target_account_id` / `status` / `category` / `severity` / `sort` / `direction` で絞り込める。レスポンス `meta` には `total_count` / `open_count` / `resolved_count` と適用中フィルタを含める。`GET /accounts/blocks` は自分がブロックした相手のみ返し、`reason_code` / `q` / `sort` / `direction` で絞り込める。

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

返金申請はMVPでは `requested` として保存し、運営審査後に管理APIから承認・却下する。ユーザーは `therapist_completed`、`completed`、`canceled_by_user`、`canceled_by_therapist` の予約に対して申請でき、同一予約に未処理申請がある場合は `409 Conflict` を返す。

## 11. 売上・出金API

| Method | Path | 権限 | 用途 |
| --- | --- | --- | --- |
| GET | `/me/therapist/ledger` | Therapist | 売上台帳 |
| GET | `/me/therapist/balance` | Therapist | 確定済み/保留中/申請中/支払済みの集計 |
| GET | `/me/therapist/payout-requests` | Therapist | 出金申請一覧 |
| POST | `/me/therapist/payout-requests` | Therapist | 出金申請 |
| GET | `/me/therapist/payout-requests/{public_id}` | Therapist | 出金申請詳細 |

ユーザーが施術完了確認を行った時点で、セラピスト売上を `therapist_ledger_entries` に `pending` として記録する。出金申請は `available` かつ未申請の台帳合計に対して行い、MVPでは利用可能残高全額の申請のみ受け付ける。出金処理予定日は、1〜10日申請分は15日、11〜20日申請分は25日、21日〜月末申請分は翌月5日とする。

`GET /me/therapist/balance` は `pending_amount` / `available_amount` / `payout_requested_amount` / `paid_amount` / `held_amount` に加えて、現在申請可能な `requestable_amount`、進行中出金件数 `active_payout_request_count`、もっとも近い `next_scheduled_process_date` を返す。

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

アカウント停止は `admin` ロールのみ実行でき、自分自身は停止できない。停止時は `status=suspended`、停止理由、停止日時を保存し、対象アカウントの既存APIトークンを失効させる。セラピストプロフィールを持つ場合は `is_online=false` にして公開検索から即時外す。復旧時は `status=active` に戻し、停止理由と停止日時をクリアするが、自動でオンライン復帰はさせない。停止・復旧操作は `admin_audit_logs` に記録する。

監査ログ一覧は `actor_account_id`、`action`、`target_type`、`target_id` で絞り込める。`before_json` / `after_json` は管理者にのみ返す。

ダッシュボードは未処理件数を優先して返す。少なくとも、アカウント総数・停止中件数、本人確認待ち、セラピスト審査待ち、停止中セラピストプロフィール件数、写真審査待ち、未解決通報、返金申請待ち、出金申請待ち、進行中の予約件数を含める。

問い合わせ未処理件数もダッシュボードに含め、`navigation` から `/admin/contact-inquiries` と `/admin/bookings` の推奨クエリへ遷移できるようにする。停止中セラピストプロフィール件数には `/admin/therapist-profiles?status=suspended` への導線も含め、`restore` 運用へ辿れるようにする。安全運用向けに `bookings.interrupted` と `operations.open_interruption_reports` も集計し、`/admin/bookings?status=interrupted` と `/admin/reports?status=open&category=booking_interrupted` へ辿れるようにする。

### 12.2 審査

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/admin/identity-verifications` | 本人確認一覧 |
| POST | `/admin/identity-verifications/{id}/approve` | 本人確認承認 |
| POST | `/admin/identity-verifications/{id}/reject` | 本人確認差し戻し |
| GET | `/admin/therapist-profiles` | セラピスト一覧 |
| GET | `/admin/therapist-profiles/{public_id}` | セラピスト詳細 |
| POST | `/admin/therapist-profiles/{public_id}/approve` | セラピスト承認 |
| POST | `/admin/therapist-profiles/{public_id}/reject` | セラピスト差し戻し |
| POST | `/admin/therapist-profiles/{public_id}/suspend` | 表示停止 |
| POST | `/admin/therapist-profiles/{public_id}/restore` | 表示停止解除（下書き復帰） |
| GET | `/admin/profile-photos` | 写真審査一覧 |
| POST | `/admin/profile-photos/{id}/approve` | 写真承認 |
| POST | `/admin/profile-photos/{id}/reject` | 写真差し戻し |

本人確認は `pending` のみ承認・差し戻しできる。承認時は `status=approved`、`is_age_verified=true`、審査者、審査日時を保存する。差し戻し時は `status=rejected`、`is_age_verified=false`、差し戻し理由を保存する。本人確認・年齢確認の審査操作は `admin_audit_logs` に記録する。

セラピストプロフィールは `pending` のみ承認・差し戻しできる。承認時は `profile_status=approved`、承認者、承認日時を保存する。差し戻し時は `profile_status=rejected`、差し戻し理由を保存し、オンライン表示を停止する。表示停止は `approved` のみ対象とし、`profile_status=suspended` にしてオンライン表示を停止する。`POST /admin/therapist-profiles/{public_id}/restore` は `suspended` のみ対象とし、再公開は行わず `profile_status=draft`・`is_online=false` に戻して再提出可能な状態へ復帰させる。復帰時は承認者情報をクリアし、停止理由コードは履歴文脈として保持する。

`GET /admin/therapist-profiles/{public_id}` は運営詳細画面向けの情報を返し、少なくともアカウント状態、最新の本人確認状態、位置公開状態、メニュー、プロフィール写真、Stripe Connect 状態、`available_actions` を含める。詳細閲覧は `admin_audit_logs` に `therapist_profile.view` として記録する。

`GET /admin/therapist-profiles` は `account_id` / `status` / `photo_review_status` / `training_status` / `is_online` / `has_searchable_location` / `has_active_menu` / `latest_identity_verification_status` / `stripe_connected_account_status` / `q` / `sort` / `direction` で絞り込める。`latest_identity_verification_status` と `stripe_connected_account_status` は `none` も受け付け、未提出・未連携も拾えるようにする。

一覧レスポンスには `active_menu_count`、`has_searchable_location`、`latest_identity_verification_status`、`stripe_connected_account_status` を含め、運営が詳細を開かなくても「再提出準備が整っているか」を見やすくする。

一覧・詳細レスポンスには `available_actions` を含め、`approve` / `reject` / `suspend` / `restore` のどれが現在実行可能かをフロント側でそのまま判定できるようにする。各操作は `admin_audit_logs` に記録する。

プロフィール写真は `pending` のみ承認・差し戻しできる。承認時は写真を `approved`、差し戻し時は `rejected` にし、審査者、審査日時、差し戻し理由を保存する。セラピストプロフィールに紐づく写真の場合は `photo_review_status` も同期する。各操作は `admin_audit_logs` に記録する。

### 12.3 予約・通報・返金

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/admin/bookings` | 予約一覧 |
| GET | `/admin/bookings/{public_id}` | 予約詳細 |
| GET | `/admin/bookings/{public_id}/messages` | 予約メッセージ閲覧 |
| POST | `/admin/bookings/{public_id}/messages/{message_id}/notes` | 予約メッセージ内部メモ追加 |
| POST | `/admin/bookings/{public_id}/messages/{message_id}/moderation` | 予約メッセージ対応更新 |
| POST | `/admin/bookings/{public_id}/messages/{message_id}/reports` | 予約メッセージから通報起票 |
| POST | `/admin/bookings/{public_id}/messages/{message_id}/suspend-sender` | メッセージ送信者アカウント停止 |
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

予約一覧は `user_account_id` / `therapist_account_id` / `therapist_profile_id` / `status` / `cancel_reason_code` / `interruption_reason_code` / `is_on_demand` / `payment_intent_status` / `has_refund_request` / `has_auto_refund` / `has_open_report` / `has_interruption_report` / `has_consent` / `has_health_check` / `has_open_dispute` / `has_flagged_message` / `scheduled_from` / `scheduled_to` / `completed_on` / `request_expires_from` / `request_expires_to` / `q` / `sort` / `direction` で絞り込める。レスポンスには `cancel_reason_note` / `canceled_by_account` / `refund_count` / `auto_refund_count` / `report_count` / `interruption_report_count` / `consent_count` / `health_check_count` / `open_dispute_count` / `flagged_message_count` を含める。予約詳細は支払い状態、返金申請、通報、状態遷移ログ、施術場所情報に加えて `interrupted_at` / `interruption_reason_code` / `cancel_reason_note` / `canceled_by_account` / `auto_refund_count` / `consents` / `health_checks` を返し、詳細閲覧は `admin_audit_logs` に記録する。`GET /admin/bookings/{public_id}/messages` は `sender_account_id` / `moderated_by_admin_account_id` / `moderation_status` / `detected_contact_exchange` / `read_status` / `has_admin_notes` / `has_open_report` で絞り込め、本文閲覧は `admin_audit_logs` に記録する。メッセージには `admin_note_count`、`open_report_count`、必要時は `notes`、`moderated_by_admin`、`moderated_at` を含める。`sender` には `status` / `suspension_reason` / `suspended_at` も返し、停止済み送信者かを一覧上で確認できるようにする。

`POST /admin/bookings/{public_id}/messages/{message_id}/notes` は運営内部メモを追加し、`admin_notes` と `admin_audit_logs` に記録する。`POST /admin/bookings/{public_id}/messages/{message_id}/moderation` は `moderation_status` を `ok` / `blocked` / `reviewed` / `escalated` で更新し、対応管理者と対応時刻を保存する。`reviewed` は要確認キューから外すための完了扱いとする。

`POST /admin/bookings/{public_id}/messages/{message_id}/reports` は対象メッセージを元に管理通報を起票し、`reports.source_booking_message_id` に元メッセージを保存する。起票時は対象メッセージの `moderation_status=escalated`、`moderated_by_admin_account_id`、`moderated_at` を更新し、必要ならメモも同時追加する。通報一覧は `source_booking_message_id` に加えて `has_source_booking_message` と `category` でも絞り込める。管理ダッシュボードには、メッセージ起点の未解決通報件数と安全中断起点の未解決通報件数、その導線を表示する。

`POST /admin/bookings/{public_id}/messages/{message_id}/suspend-sender` は送信者アカウントを停止し、対象メッセージを `escalated` に更新する。停止理由は `accounts.suspension_reason` に保存し、対象アカウントのアクセストークンは即時失効させる。操作は `account.suspend` と `booking.message.suspend_sender` の両方で監査ログに残す。

チャージバック一覧は `booking_id` / `status` / `reason` / `q` / `sort` / `direction` で絞り込める。MVPでは一覧確認を優先し、Stripe webhook で保存した `status`、`reason`、`amount`、`evidence_due_by`、`outcome` を返す。

### 12.4 出金・設定

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/admin/payout-requests` | 出金申請一覧 |
| POST | `/admin/payout-requests/{public_id}/hold` | 出金保留 |
| POST | `/admin/payout-requests/{public_id}/release` | 出金保留解除 |
| POST | `/admin/payout-requests/{public_id}/process` | 出金処理開始 |
| GET | `/admin/platform-fee-settings` | 料金設定一覧 |
| POST | `/admin/platform-fee-settings` | 料金設定作成 |
| GET | `/admin/pricing-rules` | 料金ルール一覧 |
| GET | `/admin/pricing-rules/{id}` | 料金ルール詳細 |
| POST | `/admin/pricing-rules/{id}/notes` | 料金ルール内部メモ追加 |
| POST | `/admin/pricing-rules/{id}/monitoring` | 料金ルール対応状態更新 |
| GET | `/admin/legal-documents` | 法務文書一覧 |
| POST | `/admin/legal-documents` | 法務文書作成 |
| PATCH | `/admin/legal-documents/{id}` | 法務文書更新 |
| GET | `/admin/contact-inquiries` | 問い合わせ一覧 |
| GET | `/admin/contact-inquiries/{public_id}` | 問い合わせ詳細 |
| POST | `/admin/contact-inquiries/{public_id}/notes` | 問い合わせ内部メモ追加 |
| POST | `/admin/contact-inquiries/{public_id}/resolve` | 問い合わせ解決 |
| GET | `/admin/travel-requests` | 出張リクエスト一覧 |
| GET | `/admin/travel-requests/{public_id}` | 出張リクエスト詳細 |
| POST | `/admin/travel-requests/{public_id}/notes` | 出張リクエスト内部メモ追加 |
| POST | `/admin/travel-requests/{public_id}/monitoring` | 出張リクエスト対応状態更新 |

出金申請は `payout_requested` のみ保留・処理開始できる。保留時は紐づく台帳も `held` にし、保留解除時は `payout_requested` に戻す。処理開始は原則 `scheduled_process_date` 当日以降のみ許可し、Stripe Payout作成後はStripe側ステータスに応じて `processing` / `paid` / `failed` に更新する。運営操作は `admin_audit_logs` に記録する。

料金設定は `setting_key` ごとに履歴管理し、`value_json` に設定本体を保持する。`active_from` 未指定時は作成時刻を採用し、`active_until` は任意とする。一覧では `is_active` を返し、必要に応じて `setting_key` / `is_active` で絞り込める。

料金ルール一覧は `account_id` / `therapist_profile_id` / `therapist_menu_id` / `rule_type` / `adjustment_bucket` / `monitoring_flag` / `has_monitoring_flags` / `monitoring_status` / `monitored_by_admin_account_id` / `adjustment_type` / `scope` / `is_active` / `has_notes` / `q` / `sort` / `direction` で絞り込める。`adjustment_bucket` は `profile_adjustment` または `demand_fee` を受け付け、`scope` はプロフィール共通ルールかメニュー個別ルールかを示す。`monitoring_flag` は `inactive_menu` / `extreme_percentage` / `menu_price_override` を受け付け、アクティブな停止メニュー紐づきルール、100%以上の増減率、メニュー基準額以上の固定増減額を監視対象として扱う。レスポンスにはセラピストアカウント、対象プロフィール、対象メニュー、`condition_summary`、`monitoring_flags`、`monitoring_status`、`admin_note_count` を含め、運営が不自然な設定を横断確認できるようにする。詳細APIは `condition_json`、価格上下限、優先度、適用対象、内部メモ、対応管理者、対応日時を返し、閲覧時は `admin_audit_logs` に `pricing_rule.view` として記録する。`POST /admin/pricing-rules/{id}/notes` は `admin_notes` と `admin_audit_logs` に記録し、`POST /admin/pricing-rules/{id}/monitoring` は `monitoring_status` を `unreviewed` / `under_review` / `reviewed` / `escalated` で更新し、必要に応じて内部メモを同時追加できる。

法務文書は `document_type` と `version` の組み合わせで一意管理する。一覧では `document_type` / `is_published` で絞り込める。公開済み文書は後から上書きせず、新しい `version` を作成して差し替える運用を基本とするため、更新APIは未公開または公開前のドラフト文書の調整用途として扱う。作成・更新操作は `admin_audit_logs` に記録する。

問い合わせ一覧は `account_id` / `status` / `category` / `source` / `has_notes` / `submitted_from` / `submitted_to` / `resolved_from` / `resolved_to` / `q` / `sort` / `direction` で絞り込める。詳細APIは送信者情報、本文、内部メモを返す。内部メモ追加と解決操作は `admin_notes` と `admin_audit_logs` に記録し、解決時は `status=resolved` と `resolved_at` を保存する。

出張リクエスト一覧は `user_account_id` / `therapist_account_id` / `therapist_profile_id` / `status` / `monitoring_status` / `monitored_by_admin_account_id` / `prefecture` / `has_notes` / `detected_contact_exchange` / `submitted_from` / `submitted_to` / `q` / `sort` / `direction` で絞り込める。レスポンスには送信者、対象セラピスト、本文、`admin_note_count`、対応状態を含める。詳細APIは内部メモ、対応管理者、対応日時も返し、閲覧時は `admin_audit_logs` に `travel_request.view` として記録する。`POST /admin/travel-requests/{public_id}/notes` は `admin_notes` と `admin_audit_logs` に記録し、`POST /admin/travel-requests/{public_id}/monitoring` は `monitoring_status` を `unreviewed` / `under_review` / `reviewed` / `escalated` で更新し、必要に応じて内部メモを同時追加できる。

主要な管理一覧APIは、状態や対象アカウントでの絞り込みに加えて `sort` / `direction` を受け付ける。例として、本人確認一覧は `account_id` / `document_type`、セラピスト一覧は `account_id` / `training_status` / `q`、写真一覧は `account_id` / `therapist_profile_id` / `usage_type`、通報一覧は `booking_id` / `reporter_account_id` / `target_account_id` / `assigned_admin_account_id`、返金一覧は `booking_id` / `requested_by_account_id`、出金一覧は `therapist_account_id` / `scheduled_from` / `scheduled_to` を想定する。予約一覧は `is_on_demand` / `payment_intent_status` / `has_refund_request` / `has_open_report` / `has_open_dispute` / `request_expires_from` / `request_expires_to`、チャージバック一覧は `user_account_id` / `therapist_account_id` / `status_group` / `outcome` / `evidence_due_from` / `evidence_due_to` も受け付ける。管理ダッシュボードは各保留件数に対応する一覧APIの `path` と推奨クエリを `navigation` として返し、料金ルールについては `pricing_rules.active` / `inactive` / `active_profile_adjustments` / `active_demand_fees` に加えて `needs_attention` / `pending_review` / `inactive_menu_rules` / `extreme_percentage_adjustments` / `menu_price_override_rules` の監視件数と導線を含める。出張リクエストについては `operations.unread_travel_requests` と `operations.pending_travel_request_reviews` の件数と導線を含める。

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
| 予約リクエスト期限切れ | 1分ごと | 予定予約の `payment_authorizing` / `requested` のうち期限切れを `expired` へ進め、仮押さえとカード与信を解放する |
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
* User: 施術場所、セラピスト検索、予約作成、出張リクエスト送信、支払い、レビュー、通報、返金申請。
* Therapist: 提供プロフィール、Stripe Connect、稼働管理、リクエスト承諾、出張リクエスト閲覧、施術進行、売上、出金。
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
| 出張リクエスト送信 | 5回/7日/アカウント |
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
8. メッセージ・出張リクエスト・通知。
9. レビュー・通報・返金。
10. 売上台帳・出金申請。
11. 管理API。
