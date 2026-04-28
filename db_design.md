# DBテーブル設計

## 1. 目的

このドキュメントは、`requirements.md` と `screen_flows.md` をもとに、MVP実装に必要なLaravel/MySQL向けのテーブル設計を整理する。

MVPでは、以下を重視する。

* 1アカウントがユーザー・タチキャスト両方のロールを持てる。
* 正確な位置情報・本人確認書類・予約住所・通報内容は慎重に扱う。
* 予約、決済、売上、出金、返金、チャージバックを後から監査できる。
* Stripe ConnectのConnected Accountを前提にする。
* 予約ステータス、出金ステータス、審査ステータスは画面・API・DBで同じ名称を使う。

## 2. 命名・型方針

### 2.1 命名
* テーブル名はLaravel標準に合わせて複数形スネークケースにする。
* 主キーは全テーブル `id` のunsigned big integer。
* 外部キーは `{table_singular}_id` 形式。
* 金額はすべて税込の整数円で保存する。カラム名は `*_amount`。
* ステータスはMySQL enumではなく `varchar(50)` で保存し、アプリ側で定数管理する。
* 外部公開するIDは内部IDとは別に `public_id` を持たせる。

### 2.2 共通カラム
多くのテーブルに以下を持たせる。

| カラム | 型 | 用途 |
| --- | --- | --- |
| id | bigint unsigned | 主キー |
| public_id | varchar(36) nullable | 外部公開用ID。予約、通報、出金などに付与 |
| created_at | timestamp nullable | 作成日時 |
| updated_at | timestamp nullable | 更新日時 |
| deleted_at | timestamp nullable | 論理削除。必要なテーブルのみ |

### 2.3 暗号化・秘匿方針
* 住所、本人確認書類の保存先、通報本文、メッセージ本文、健康情報、管理メモはアプリ側で暗号化して保存する。
* 検索・集計に使う項目は暗号化せず、必要最小限のコード値・フラグ・ハッシュで持つ。
* 本人確認書類はStripe Connectまたは外部KYCでの管理を優先し、アプリ本体には長期保管しない。
* 再登録防止に使う値は、原文ではなくハッシュまたは照合用トークンを優先する。

## 3. 主要ER概要

```text
accounts
  ├─ account_roles
  ├─ identity_verifications
  ├─ temp_files
  ├─ user_profiles
  ├─ therapist_profiles
  │    ├─ therapist_menus
  │    ├─ therapist_pricing_rules
  │    ├─ therapist_booking_settings
  │    ├─ therapist_availability_slots
  │    ├─ therapist_travel_requests
  │    ├─ therapist_locations
  │    └─ stripe_connected_accounts
  ├─ service_addresses
  ├─ bookings
  │    ├─ booking_quotes
  │    ├─ booking_status_logs
  │    ├─ booking_consents
  │    ├─ booking_health_checks
  │    ├─ booking_messages
  │    ├─ payment_intents
  │    ├─ reviews
  │    ├─ reports
  │    └─ refunds
  ├─ therapist_ledger_entries
  └─ payout_requests
```

## 4. アカウント・認証

### 4.1 accounts
ログイン主体。ユーザー・タチキャスト・管理者の共通アカウント。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| public_id | varchar(36) | No | 外部公開ID |
| email | varchar(255) | Yes | メールアドレス |
| email_verified_at | timestamp | Yes | メール確認日時 |
| phone_e164 | varchar(32) | Yes | 電話番号。E.164形式 |
| phone_verified_at | timestamp | Yes | 電話番号確認日時 |
| password | varchar(255) | No | パスワードハッシュ |
| display_name | varchar(80) | Yes | 共通表示名 |
| status | varchar(50) | No | active, suspended, deleted |
| last_active_role | varchar(50) | Yes | user, therapist, admin |
| registered_ip_hash | varchar(64) | Yes | 登録時IPのハッシュ |
| last_login_at | timestamp | Yes | 最終ログイン |
| suspended_at | timestamp | Yes | 停止日時 |
| suspension_reason | varchar(100) | Yes | 停止理由コード |
| deleted_at | timestamp | Yes | 論理削除 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* unique: `public_id`
* unique: `email`
* unique: `phone_e164`
* index: `status`

### 4.2 account_roles
1アカウントが複数ロールを持てるようにする。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| account_id | bigint unsigned | No | accounts.id |
| role | varchar(50) | No | user, therapist, admin |
| status | varchar(50) | No | active, suspended |
| granted_at | timestamp | Yes | 付与日時 |
| revoked_at | timestamp | Yes | 無効化日時 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* unique: `account_id, role`
* index: `role, status`

### 4.3 legal_documents
利用規約、プライバシーポリシー、特商法表記のバージョン管理。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| document_type | varchar(50) | No | terms, privacy, commercial_transaction |
| version | varchar(50) | No | 例: 2026-04-01 |
| title | varchar(255) | No | タイトル |
| body | longtext | No | 本文 |
| published_at | timestamp | Yes | 公開日時 |
| effective_at | timestamp | Yes | 効力発生日 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* unique: `document_type, version`
* index: `document_type, published_at`

### 4.4 legal_acceptances
規約同意履歴。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| account_id | bigint unsigned | No | accounts.id |
| legal_document_id | bigint unsigned | No | legal_documents.id |
| accepted_at | timestamp | No | 同意日時 |
| ip_hash | varchar(64) | Yes | IPハッシュ |
| user_agent_hash | varchar(64) | Yes | UAハッシュ |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* unique: `account_id, legal_document_id`
* index: `account_id, accepted_at`

## 5. 本人確認・プロフィール

### 5.1 identity_verifications
本人確認・年齢確認の状態。ユーザー/タチキャスト共通。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| account_id | bigint unsigned | No | accounts.id |
| provider | varchar(50) | No | manual, stripe, external_kyc |
| provider_reference_id | varchar(255) | Yes | 外部KYC参照ID |
| status | varchar(50) | No | pending, approved, rejected, needs_review, expired |
| full_name_encrypted | text | Yes | 氏名 |
| birthdate_encrypted | text | Yes | 生年月日 |
| birth_year | smallint unsigned | Yes | 年齢確認・検索補助。生年月日は出さない |
| is_age_verified | boolean | No | 18歳以上確認 |
| self_declared_male | boolean | No | 男性専用サービス対象の自己申告 |
| document_type | varchar(50) | Yes | driver_license, passport等 |
| document_last4_hash | varchar(64) | Yes | 書類番号末尾等のハッシュ |
| document_storage_key_encrypted | text | Yes | 一時保管時のみ |
| selfie_storage_key_encrypted | text | Yes | 一時保管時のみ |
| submitted_at | timestamp | Yes | 提出日時 |
| reviewed_by_account_id | bigint unsigned | Yes | 管理者account_id |
| reviewed_at | timestamp | Yes | 審査日時 |
| rejection_reason_code | varchar(100) | Yes | 差し戻し理由 |
| purge_after | timestamp | Yes | 一時ファイル削除予定日時 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* index: `account_id, status`
* index: `status, submitted_at`
* index: `is_age_verified`

### 5.2 user_profiles
利用者側プロフィール。価格算定・安全運用に使う。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| account_id | bigint unsigned | No | accounts.id |
| profile_status | varchar(50) | No | incomplete, active, suspended |
| age_range | varchar(50) | Yes | 20s, 30s等 |
| body_type | varchar(50) | Yes | slim, average, muscular等 |
| height_cm | smallint unsigned | Yes | 任意 |
| weight_range | varchar(50) | Yes | レンジ保存 |
| preferences_json | json | Yes | 希望、強さ、雰囲気等 |
| touch_ng_json | json | Yes | 触れてほしくない部位等 |
| health_notes_encrypted | text | Yes | 持病・注意事項等 |
| sexual_orientation | varchar(50) | Yes | gay, bi, straight, other, undisclosed |
| gender_identity | varchar(50) | Yes | cis_male, trans_male, other, undisclosed |
| disclose_sensitive_profile_to_therapist | boolean | No | タチキャストへの表示同意 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* unique: `account_id`
* index: `profile_status`

### 5.3 therapist_profiles
提供者側プロフィール。検索表示・審査・稼働状態を持つ。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| account_id | bigint unsigned | No | accounts.id |
| public_id | varchar(36) | No | 外部公開ID |
| public_name | varchar(80) | No | 表示名 |
| bio | text | Yes | 自己紹介 |
| profile_status | varchar(50) | No | draft, pending_review, approved, rejected, suspended |
| training_status | varchar(50) | No | none, pending, completed |
| photo_review_status | varchar(50) | No | pending, approved, rejected |
| is_online | boolean | No | 稼働状態 |
| online_since | timestamp | Yes | オンライン開始 |
| last_location_updated_at | timestamp | Yes | 位置更新日時 |
| rating_average | decimal(3,2) | No | 平均評価 |
| review_count | unsigned int | No | レビュー数 |
| therapist_cancellation_count | unsigned int | No | 公開表示するタチキャスト都合キャンセル累計 |
| approved_at | timestamp | Yes | 承認日時 |
| approved_by_account_id | bigint unsigned | Yes | 管理者account_id |
| rejected_reason_code | varchar(100) | Yes | 差し戻し理由 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* unique: `account_id`
* unique: `public_id`
* index: `profile_status, is_online`
* index: `training_status`
* index: `rating_average`

### 5.4 profile_photos
プロフィール写真・ギャラリー画像。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| account_id | bigint unsigned | No | accounts.id |
| therapist_profile_id | bigint unsigned | Yes | therapist_profiles.id |
| usage_type | varchar(50) | No | avatar, therapist_gallery |
| storage_key_encrypted | text | No | 画像保存先 |
| content_hash | varchar(64) | Yes | 重複・再投稿検知 |
| status | varchar(50) | No | pending, approved, rejected, removed |
| rejection_reason_code | varchar(100) | Yes | 差し戻し理由 |
| sort_order | unsigned int | No | 表示順 |
| reviewed_by_account_id | bigint unsigned | Yes | 管理者account_id |
| reviewed_at | timestamp | Yes | 審査日時 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* index: `account_id, usage_type`
* index: `therapist_profile_id, status, sort_order`
* index: `status, created_at`

### 5.5 temp_files
本人確認書類、セルフィー、プロフィール写真などの提出前アップロードを一時的に保持する。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| file_id | varchar(64) | No | APIで参照する一時ファイルID |
| account_id | bigint unsigned | No | accounts.id |
| purpose | varchar(50) | No | identity_document, selfie, profile_photo等 |
| storage_key_encrypted | text | No | 一時保存先 |
| original_name | varchar(255) | Yes | 元ファイル名 |
| mime_type | varchar(100) | Yes | MIMEタイプ |
| size_bytes | bigint unsigned | Yes | ファイルサイズ |
| status | varchar(50) | No | uploaded, used, deleted, expired |
| expires_at | timestamp | No | 有効期限 |
| used_at | timestamp | Yes | 提出APIで使用された日時 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* unique: `file_id`
* index: `account_id, purpose, status`
* index: `expires_at, status`

## 6. 提供メニュー・料金

### 6.1 therapist_menus
タチキャストが提供するメニュー。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| therapist_profile_id | bigint unsigned | No | therapist_profiles.id |
| name | varchar(120) | No | メニュー名 |
| description | text | Yes | 説明 |
| duration_minutes | unsigned int | No | 所要時間 |
| base_price_amount | unsigned int | No | 基本料金 |
| is_active | boolean | No | 表示可否 |
| sort_order | unsigned int | No | 表示順 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* index: `therapist_profile_id, is_active, sort_order`

### 6.2 therapist_pricing_rules
ダイナミック料金ルール。条件はJSONに閉じ込め、計算結果は見積もりにスナップショット保存する。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| therapist_profile_id | bigint unsigned | No | therapist_profiles.id |
| therapist_menu_id | bigint unsigned | Yes | メニュー限定の場合 |
| rule_type | varchar(50) | No | `user_profile_attribute`, `time_band`, `walking_time_range`, `demand_level` |
| condition_json | json | Yes | 適用条件 |
| adjustment_type | varchar(50) | No | `fixed_amount`, `percentage` |
| adjustment_amount | int | No | 円、%等。意味はtypeに依存 |
| min_price_amount | unsigned int | Yes | 適用後下限 |
| max_price_amount | unsigned int | Yes | 適用後上限 |
| priority | unsigned int | No | 適用順 |
| is_active | boolean | No | 有効/無効 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* index: `therapist_profile_id, is_active, priority`
* index: `therapist_menu_id, is_active`

### 6.3 therapist_booking_settings
タチキャストごとの予定予約設定。現在地とは別に、予定予約用の基本地点と受付締切を管理する。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| therapist_profile_id | bigint unsigned | No | therapist_profiles.id |
| booking_request_lead_time_minutes | unsigned int | No | 受付締切。デフォルト60 |
| scheduled_base_label | varchar(120) | Yes | タチキャスト内部向けラベル |
| scheduled_base_lat | decimal(10,7) | No | 予定予約用基本地点の緯度 |
| scheduled_base_lng | decimal(10,7) | No | 予定予約用基本地点の経度 |
| scheduled_base_geohash | varchar(12) | Yes | 粗い検索補助 |
| scheduled_base_accuracy_m | unsigned int | Yes | 位置精度 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* unique: `therapist_profile_id`
* index: `scheduled_base_geohash`

### 6.4 therapist_availability_slots
タチキャストが公開する単発の空き時間。ユーザーには生の枠ではなく連続予約可能時間帯として返す。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| public_id | varchar(36) | No | 外部公開ID |
| therapist_profile_id | bigint unsigned | No | therapist_profiles.id |
| start_at | timestamp | No | 空き開始 |
| end_at | timestamp | No | 空き終了 |
| status | varchar(50) | No | published, hidden, expired |
| dispatch_base_type | varchar(50) | No | default, custom |
| dispatch_area_label | varchar(120) | Yes | ユーザー向け公開エリア名 |
| custom_dispatch_base_label | varchar(120) | Yes | タチキャスト内部向け拠点ラベル |
| custom_dispatch_base_lat | decimal(10,7) | Yes | 枠専用出動拠点の緯度 |
| custom_dispatch_base_lng | decimal(10,7) | Yes | 枠専用出動拠点の経度 |
| custom_dispatch_base_geohash | varchar(12) | Yes | 粗い検索補助 |
| custom_dispatch_base_accuracy_m | unsigned int | Yes | 位置精度 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |
| deleted_at | timestamp | Yes | 論理削除 |

インデックス:
* unique: `public_id`
* index: `therapist_profile_id, status, start_at`
* index: `dispatch_base_type, start_at`
* index: `status, start_at`

補足:
* 単発登録のみを対象とし、繰り返しルールは持たない。
* 実際の予約可能時間帯は、この空き時間から `requested` / `accepted` / `confirmed` 以降の予定予約、承諾済みバッファ、受付締切を差し引いて算出する。
* 距離・徒歩目安・交通費・表示可否判定は、`dispatch_base_type=custom` なら枠専用出動拠点、`default` なら `therapist_booking_settings` の基本地点を使う。

### 6.5 platform_fee_settings
運営手数料、キャンセル料、上限/下限などの設定。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| setting_key | varchar(100) | No | platform_fee, matching_fee等 |
| value_json | json | No | 設定値 |
| active_from | timestamp | Yes | 適用開始 |
| active_until | timestamp | Yes | 適用終了 |
| created_by_account_id | bigint unsigned | Yes | 管理者account_id |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* unique: `setting_key, active_from`

## 7. 位置情報・住所

### 7.1 therapist_locations
タチキャストの最新待機位置。MVPでは履歴を長期保存せず、原則最新1件を更新する。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| therapist_profile_id | bigint unsigned | No | therapist_profiles.id |
| lat | decimal(10,7) | No | 緯度。APIでは返さない |
| lng | decimal(10,7) | No | 経度。APIでは返さない |
| geohash | varchar(12) | Yes | 粗い検索補助 |
| accuracy_m | unsigned int | Yes | 位置精度 |
| source | varchar(50) | No | browser, manual |
| is_searchable | boolean | No | 検索対象可否 |
| updated_at | timestamp | Yes | 更新日時 |
| created_at | timestamp | Yes | 作成日時 |

インデックス:
* unique: `therapist_profile_id`
* index: `is_searchable, updated_at`
* index: `lat, lng`
* index: `geohash`

### 7.2 service_addresses
ユーザーの施術場所。予約確定前はタチキャストへ詳細住所を表示しない。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| account_id | bigint unsigned | No | accounts.id |
| label | varchar(80) | Yes | 自宅、ホテル名等 |
| place_type | varchar(50) | No | home, hotel, rental_space, other |
| postal_code_encrypted | text | Yes | 郵便番号 |
| prefecture | varchar(50) | Yes | 都道府県。検索補助 |
| city | varchar(100) | Yes | 市区町村。検索補助 |
| address_line_encrypted | text | No | 詳細住所 |
| building_encrypted | text | Yes | 建物名・部屋番号 |
| access_notes_encrypted | text | Yes | 入室方法・注意事項 |
| lat | decimal(10,7) | No | 緯度。APIでは原則返さない |
| lng | decimal(10,7) | No | 経度。APIでは原則返さない |
| geohash | varchar(12) | Yes | 粗い検索補助 |
| is_default | boolean | No | 既定住所 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |
| deleted_at | timestamp | Yes | 論理削除 |

インデックス:
* index: `account_id, is_default`
* index: `prefecture, city`
* index: `lat, lng`
* index: `geohash`

### 7.3 location_search_logs
位置推定の悪用監視。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| account_id | bigint unsigned | No | accounts.id |
| searched_lat | decimal(10,7) | Yes | 検索中心。必要期間のみ保持 |
| searched_lng | decimal(10,7) | Yes | 検索中心。必要期間のみ保持 |
| searched_geohash | varchar(12) | Yes | 粗い位置 |
| result_count | unsigned int | No | 結果件数 |
| ip_hash | varchar(64) | Yes | IPハッシュ |
| created_at | timestamp | Yes | 作成日時 |

インデックス:
* index: `account_id, created_at`
* index: `searched_geohash, created_at`

## 8. 予約・見積もり

### 8.1 bookings
予約の中心テーブル。予約一覧で必要な金額・時刻は一部冗長保存する。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| public_id | varchar(36) | No | 外部公開ID |
| user_account_id | bigint unsigned | No | 利用者accounts.id |
| therapist_account_id | bigint unsigned | No | タチキャストaccounts.id |
| therapist_profile_id | bigint unsigned | No | therapist_profiles.id |
| therapist_menu_id | bigint unsigned | No | therapist_menus.id |
| service_address_id | bigint unsigned | No | service_addresses.id |
| current_quote_id | bigint unsigned | Yes | booking_quotes.id |
| availability_slot_id | bigint unsigned | Yes | therapist_availability_slots.id |
| status | varchar(50) | No | 予約ステータス |
| is_on_demand | boolean | No | 今すぐ依頼か。falseは公開空きスケジュール予約 |
| requested_start_at | timestamp | Yes | 希望開始日時。予定予約の仮押さえ基準 |
| scheduled_start_at | timestamp | Yes | 確定開始日時 |
| scheduled_end_at | timestamp | Yes | 確定終了予定 |
| duration_minutes | unsigned int | No | 施術時間 |
| buffer_before_minutes | unsigned int | No | 承諾時に確定した前バッファ |
| buffer_after_minutes | unsigned int | No | 承諾時に確定した後バッファ |
| request_expires_at | timestamp | Yes | 承諾期限 |
| accepted_at | timestamp | Yes | 承諾日時 |
| confirmed_at | timestamp | Yes | 確定日時 |
| moving_at | timestamp | Yes | 移動開始 |
| arrived_at | timestamp | Yes | 到着 |
| started_at | timestamp | Yes | 開始 |
| ended_at | timestamp | Yes | 終了 |
| canceled_at | timestamp | Yes | キャンセル日時 |
| canceled_by_account_id | bigint unsigned | Yes | キャンセル実行者 |
| cancel_reason_code | varchar(100) | Yes | キャンセル理由 |
| cancel_reason_note_encrypted | text | Yes | ユーザー向け説明・補足 |
| interrupted_at | timestamp | Yes | 中断日時 |
| interruption_reason_code | varchar(100) | Yes | 中断理由 |
| total_amount | unsigned int | No | ユーザー支払総額 |
| therapist_net_amount | unsigned int | No | タチキャスト受取予定額 |
| platform_fee_amount | unsigned int | No | 運営手数料 |
| matching_fee_amount | unsigned int | No | マッチング手数料 |
| user_snapshot_json | json | Yes | 予約時の利用者公開情報 |
| therapist_snapshot_json | json | Yes | 予約時のタチキャスト公開情報 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* unique: `public_id`
* index: `user_account_id, status, scheduled_start_at`
* index: `therapist_account_id, status, scheduled_start_at`
* index: `therapist_profile_id, status`
* index: `availability_slot_id`
* index: `status, request_expires_at`
* index: `created_at`

補足:
* 予定予約では、`requested_start_at + duration_minutes` を仮押さえ対象時間とし、承諾後は `buffer_before_minutes` / `buffer_after_minutes` を加味して重複判定する。
* `request_expires_at` は `created_at + 6時間`、`requested_start_at - booking_request_lead_time_minutes`、`requested_start_at` のうち最も早い時刻を保存する。

### 8.2 booking_quotes
価格算定結果のスナップショット。後から料金根拠を確認するため保存する。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| booking_id | bigint unsigned | Yes | bookings.id。作成前見積もりではnullも可 |
| therapist_profile_id | bigint unsigned | No | therapist_profiles.id |
| therapist_menu_id | bigint unsigned | No | therapist_menus.id |
| duration_minutes | unsigned int | No | 施術時間 |
| base_amount | unsigned int | No | 基本料金 |
| travel_fee_amount | unsigned int | No | 交通費/移動負荷 |
| night_fee_amount | unsigned int | No | 深夜料金 |
| demand_fee_amount | unsigned int | No | 需要調整 |
| profile_adjustment_amount | int | No | プロフィール由来の調整 |
| matching_fee_amount | unsigned int | No | マッチング手数料 |
| platform_fee_amount | unsigned int | No | 運営手数料 |
| total_amount | unsigned int | No | ユーザー支払総額 |
| therapist_gross_amount | unsigned int | No | タチキャスト売上総額 |
| therapist_net_amount | unsigned int | No | タチキャスト受取予定額 |
| calculation_version | varchar(50) | No | 算定ロジック版 |
| input_snapshot_json | json | No | 算定入力値 |
| applied_rules_json | json | No | 適用ルール |
| expires_at | timestamp | Yes | 見積もり期限 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* index: `booking_id`
* index: `therapist_profile_id, created_at`
* index: `expires_at`

### 8.3 booking_status_logs
予約ステータスの履歴。監査の中心。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| booking_id | bigint unsigned | No | bookings.id |
| from_status | varchar(50) | Yes | 変更前 |
| to_status | varchar(50) | No | 変更後 |
| actor_account_id | bigint unsigned | Yes | 操作者。システムならnull |
| actor_role | varchar(50) | Yes | user, therapist, admin, system |
| reason_code | varchar(100) | Yes | 理由 |
| note_encrypted | text | Yes | 補足 |
| metadata_json | json | Yes | 関連情報 |
| created_at | timestamp | Yes | 作成日時 |

インデックス:
* index: `booking_id, created_at`
* index: `to_status, created_at`
* index: `actor_account_id, created_at`

### 8.4 booking_consents
予約ごとの同意履歴。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| booking_id | bigint unsigned | No | bookings.id |
| account_id | bigint unsigned | No | accounts.id |
| consent_type | varchar(100) | No | relaxation_purpose, cancellation_policy, health_check等 |
| legal_document_id | bigint unsigned | Yes | 関連規約 |
| consented_at | timestamp | No | 同意日時 |
| ip_hash | varchar(64) | Yes | IPハッシュ |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* unique: `booking_id, account_id, consent_type`
* index: `account_id, consented_at`

### 8.5 booking_health_checks
施術前の体調確認。詳細は暗号化。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| booking_id | bigint unsigned | No | bookings.id |
| account_id | bigint unsigned | No | 申告者accounts.id |
| role | varchar(50) | No | user, therapist |
| drinking_status | varchar(50) | Yes | none, light, heavy, undisclosed |
| has_injury | boolean | Yes | ケガ有無 |
| has_fever | boolean | Yes | 発熱有無 |
| contraindications_json | json | Yes | コード化できる注意事項 |
| notes_encrypted | text | Yes | 詳細 |
| checked_at | timestamp | No | 確認日時 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* index: `booking_id, role`
* index: `account_id, checked_at`

## 9. メッセージ・通知

### 9.1 booking_messages
予約ごとのアプリ内メッセージ。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| booking_id | bigint unsigned | No | bookings.id |
| sender_account_id | bigint unsigned | Yes | システムメッセージはnull |
| message_type | varchar(50) | No | text, template, system |
| body_encrypted | text | No | 本文 |
| detected_contact_exchange | boolean | No | 連絡先交換検知 |
| moderation_status | varchar(50) | No | ok, flagged, hidden |
| sent_at | timestamp | No | 送信日時 |
| read_at | timestamp | Yes | 既読日時 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* index: `booking_id, sent_at`
* index: `sender_account_id, sent_at`
* index: `moderation_status`

### 9.2 therapist_travel_requests
予約外の需要通知。ユーザーが希望都道府県とメッセージをタチキャストへ送る。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| public_id | varchar(36) | No | 外部公開ID |
| user_account_id | bigint unsigned | No | 送信者accounts.id |
| therapist_account_id | bigint unsigned | No | 受信タチキャストaccounts.id |
| therapist_profile_id | bigint unsigned | No | therapist_profiles.id |
| prefecture | varchar(50) | No | 希望都道府県 |
| message_encrypted | text | No | 本文 |
| detected_contact_exchange | boolean | No | 連絡先交換検知 |
| status | varchar(50) | No | unread, read, archived |
| read_at | timestamp | Yes | 既読日時 |
| archived_at | timestamp | Yes | アーカイブ日時 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* unique: `public_id`
* index: `therapist_account_id, status, created_at`
* index: `therapist_profile_id, status, created_at`
* index: `user_account_id, created_at`
* index: `prefecture, created_at`

補足:
* 同一ユーザーから同一タチキャストへの同一都道府県リクエストは、短期間の重複送信をアプリ側で禁止する。
* MVPではタチキャスト返信機能を持たず、一方向の需要通知として扱う。

### 9.3 push_subscriptions
Web Push購読情報。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| account_id | bigint unsigned | No | accounts.id |
| endpoint_hash | varchar(64) | No | endpointのハッシュ |
| endpoint_encrypted | text | No | endpoint |
| p256dh_encrypted | text | No | 公開鍵 |
| auth_encrypted | text | No | auth secret |
| user_agent_hash | varchar(64) | Yes | UAハッシュ |
| permission_status | varchar(50) | No | granted, denied, revoked |
| last_used_at | timestamp | Yes | 最終利用 |
| revoked_at | timestamp | Yes | 無効化 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* unique: `endpoint_hash`
* index: `account_id, permission_status`

### 9.4 notifications
アプリ内通知・送信履歴。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| account_id | bigint unsigned | No | 宛先 |
| notification_type | varchar(100) | No | new_request, booking_confirmed等 |
| channel | varchar(50) | No | in_app, web_push, email |
| title | varchar(255) | No | タイトル |
| body | text | Yes | 本文 |
| data_json | json | Yes | 遷移先等 |
| status | varchar(50) | No | queued, sent, failed, read |
| sent_at | timestamp | Yes | 送信日時 |
| read_at | timestamp | Yes | 既読日時 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* index: `account_id, read_at, created_at`
* index: `notification_type, created_at`
* index: `status, created_at`

## 10. Stripe Connect・決済

### 10.1 stripe_connected_accounts
タチキャストのStripe Connected Account。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| account_id | bigint unsigned | No | タチキャストaccounts.id |
| therapist_profile_id | bigint unsigned | No | therapist_profiles.id |
| stripe_account_id | varchar(255) | No | acct_... |
| account_type | varchar(50) | No | express |
| status | varchar(50) | No | pending, enabled, restricted, disabled |
| charges_enabled | boolean | No | Stripe値 |
| payouts_enabled | boolean | No | Stripe値 |
| details_submitted | boolean | No | Stripe値 |
| requirements_currently_due_json | json | Yes | 追加確認 |
| requirements_past_due_json | json | Yes | 期限超過 |
| disabled_reason | varchar(255) | Yes | Stripe値 |
| onboarding_completed_at | timestamp | Yes | 初回完了 |
| last_synced_at | timestamp | Yes | Webhook同期 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* unique: `stripe_account_id`
* unique: `account_id`
* index: `status, payouts_enabled`

### 10.2 stripe_customers
利用者のStripe Customer。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| account_id | bigint unsigned | No | accounts.id |
| stripe_customer_id | varchar(255) | No | cus_... |
| default_payment_method_id | varchar(255) | Yes | pm_... |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* unique: `account_id`
* unique: `stripe_customer_id`

### 10.3 payment_intents
Stripe PaymentIntentと予約の紐付け。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| booking_id | bigint unsigned | No | bookings.id |
| payer_account_id | bigint unsigned | No | 利用者accounts.id |
| stripe_payment_intent_id | varchar(255) | No | pi_... |
| stripe_customer_id | varchar(255) | Yes | cus_... |
| stripe_connected_account_id | bigint unsigned | Yes | destination |
| status | varchar(50) | No | requires_capture, succeeded等 |
| capture_method | varchar(50) | No | manual, automatic |
| currency | varchar(3) | No | jpy |
| amount | unsigned int | No | 総額 |
| application_fee_amount | unsigned int | No | 運営手数料 |
| transfer_amount | unsigned int | No | タチキャスト向け金額 |
| is_current | boolean | No | 予約に対する現在有効なIntent |
| authorized_at | timestamp | Yes | 与信日時 |
| captured_at | timestamp | Yes | 確定日時 |
| canceled_at | timestamp | Yes | キャンセル日時 |
| last_stripe_event_id | varchar(255) | Yes | 最終イベント |
| metadata_json | json | Yes | Stripeメタ情報 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* unique: `stripe_payment_intent_id`
* index: `booking_id, is_current`
* index: `payer_account_id, created_at`
* index: `status, created_at`

### 10.4 refunds
返金申請・返金処理。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| public_id | varchar(36) | No | 外部公開ID |
| booking_id | bigint unsigned | No | bookings.id |
| payment_intent_id | bigint unsigned | Yes | payment_intents.id |
| requested_by_account_id | bigint unsigned | No | 申請者 |
| status | varchar(50) | No | requested, approved, rejected, processing, refunded, failed |
| reason_code | varchar(100) | No | 理由 |
| detail_encrypted | text | Yes | 詳細 |
| requested_amount | unsigned int | Yes | 希望額 |
| approved_amount | unsigned int | Yes | 承認額 |
| stripe_refund_id | varchar(255) | Yes | re_... |
| reviewed_by_account_id | bigint unsigned | Yes | 管理者 |
| reviewed_at | timestamp | Yes | 審査日時 |
| processed_at | timestamp | Yes | 処理日時 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* unique: `public_id`
* index: `booking_id, status`
* index: `status, created_at`

### 10.5 stripe_disputes
チャージバック/支払異議。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| booking_id | bigint unsigned | Yes | bookings.id |
| payment_intent_id | bigint unsigned | Yes | payment_intents.id |
| stripe_dispute_id | varchar(255) | No | dp_... |
| status | varchar(50) | No | needs_response, under_review, won, lost等 |
| reason | varchar(100) | Yes | Stripe理由 |
| amount | unsigned int | No | 金額 |
| currency | varchar(3) | No | jpy |
| evidence_due_by | timestamp | Yes | 証跡提出期限 |
| outcome | varchar(50) | Yes | won, lost等 |
| last_stripe_event_id | varchar(255) | Yes | 最終イベント |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* unique: `stripe_dispute_id`
* index: `booking_id`
* index: `status, evidence_due_by`

### 10.6 stripe_webhook_events
Webhookの冪等性・再処理用ログ。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| stripe_event_id | varchar(255) | No | evt_... |
| event_type | varchar(255) | No | payment_intent.succeeded等 |
| payload_json | json | No | 受信内容 |
| processed_status | varchar(50) | No | pending, processed, failed |
| processed_at | timestamp | Yes | 処理日時 |
| failure_reason | text | Yes | 失敗理由 |
| retry_count | unsigned int | No | 再試行回数 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* unique: `stripe_event_id`
* index: `event_type, created_at`
* index: `processed_status, created_at`

## 11. 売上・出金

### 11.1 therapist_ledger_entries
タチキャスト残高の台帳。残高は集計値ではなく台帳から算出する。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| therapist_account_id | bigint unsigned | No | タチキャストaccounts.id |
| booking_id | bigint unsigned | Yes | bookings.id |
| payout_request_id | bigint unsigned | Yes | payout_requests.id |
| entry_type | varchar(50) | No | booking_earning, refund, chargeback, payout, adjustment, hold, release |
| amount_signed | int | No | 増減額。円 |
| status | varchar(50) | No | pending_balance, available_balance, payout_requested, payout_processing, payout_paid, payout_on_hold |
| available_at | timestamp | Yes | 出金可能日時 |
| description | varchar(255) | Yes | 説明 |
| metadata_json | json | Yes | 関連情報 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* index: `therapist_account_id, status`
* index: `booking_id`
* index: `payout_request_id`
* index: `available_at`

### 11.2 payout_requests
タチキャスト出金申請。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| public_id | varchar(36) | No | 外部公開ID |
| therapist_account_id | bigint unsigned | No | タチキャストaccounts.id |
| stripe_connected_account_id | bigint unsigned | No | stripe_connected_accounts.id |
| status | varchar(50) | No | payout_requested, payout_processing, payout_paid, payout_failed, payout_on_hold |
| requested_amount | unsigned int | No | 申請額 |
| fee_amount | unsigned int | No | 振込手数料 |
| net_amount | unsigned int | No | 差引支払額 |
| requested_at | timestamp | No | 申請日時 |
| scheduled_process_date | date | No | 5日/15日/25日 |
| processed_at | timestamp | Yes | 処理日時 |
| stripe_payout_id | varchar(255) | Yes | po_... |
| failure_reason | text | Yes | 失敗理由 |
| reviewed_by_account_id | bigint unsigned | Yes | 管理者 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* unique: `public_id`
* index: `therapist_account_id, status`
* index: `scheduled_process_date, status`
* index: `stripe_payout_id`

## 12. レビュー・通報・紛争

### 12.1 reviews
相互評価。公開コメントと非公開フィードバックを分ける。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| booking_id | bigint unsigned | No | bookings.id |
| reviewer_account_id | bigint unsigned | No | 評価者 |
| reviewee_account_id | bigint unsigned | No | 評価対象 |
| reviewer_role | varchar(50) | No | user, therapist |
| rating_overall | tinyint unsigned | No | 1〜5 |
| rating_manners | tinyint unsigned | Yes | 1〜5 |
| rating_skill | tinyint unsigned | Yes | 1〜5 |
| rating_cleanliness | tinyint unsigned | Yes | 1〜5 |
| rating_safety | tinyint unsigned | Yes | 1〜5 |
| public_comment | text | Yes | 公開コメント |
| private_feedback_encrypted | text | Yes | 運営向け |
| status | varchar(50) | No | visible, hidden, pending_review |
| moderated_by_account_id | bigint unsigned | Yes | 管理者 |
| moderated_at | timestamp | Yes | 審査日時 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* unique: `booking_id, reviewer_account_id`
* index: `reviewee_account_id, status, created_at`
* index: `status, created_at`

### 12.2 reports
通報・事故報告・中断報告の入口。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| public_id | varchar(36) | No | 外部公開ID |
| booking_id | bigint unsigned | Yes | 関連予約 |
| reporter_account_id | bigint unsigned | No | 通報者 |
| target_account_id | bigint unsigned | Yes | 対象者 |
| category | varchar(100) | No | prohibited_request, violence, accident等 |
| severity | varchar(50) | No | low, medium, high, critical |
| detail_encrypted | text | Yes | 詳細 |
| status | varchar(50) | No | open, investigating, resolved, dismissed |
| assigned_admin_account_id | bigint unsigned | Yes | 担当管理者 |
| resolved_at | timestamp | Yes | 解決日時 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* unique: `public_id`
* index: `booking_id, status`
* index: `reporter_account_id, created_at`
* index: `target_account_id, status`
* index: `status, severity, created_at`

### 12.3 report_actions
通報への対応履歴。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| report_id | bigint unsigned | No | reports.id |
| admin_account_id | bigint unsigned | Yes | 対応者 |
| action_type | varchar(100) | No | note, restrict_booking, suspend, refund, hold_payout等 |
| note_encrypted | text | Yes | 管理メモ |
| metadata_json | json | Yes | 関連データ |
| created_at | timestamp | Yes | 作成日時 |

インデックス:
* index: `report_id, created_at`
* index: `action_type, created_at`

### 12.4 account_blocks
ブロック関係。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| blocker_account_id | bigint unsigned | No | ブロックした側 |
| blocked_account_id | bigint unsigned | No | ブロックされた側 |
| reason_code | varchar(100) | Yes | 理由 |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* unique: `blocker_account_id, blocked_account_id`
* index: `blocked_account_id`

## 13. 管理・監査

### 13.1 admin_audit_logs
個人情報閲覧、審査、返金、凍結、CSV出力などの監査ログ。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| actor_account_id | bigint unsigned | Yes | 管理者accounts.id |
| action | varchar(100) | No | view_identity, approve_photo, refund等 |
| target_type | varchar(100) | No | Account, Booking等 |
| target_id | bigint unsigned | Yes | 対象ID |
| ip_hash | varchar(64) | Yes | IPハッシュ |
| user_agent_hash | varchar(64) | Yes | UAハッシュ |
| before_json | json | Yes | 変更前 |
| after_json | json | Yes | 変更後 |
| created_at | timestamp | Yes | 作成日時 |

インデックス:
* index: `actor_account_id, created_at`
* index: `target_type, target_id`
* index: `action, created_at`

### 13.2 admin_notes
運営管理メモ。通報以外の審査・アカウント確認にも使う。

| カラム | 型 | Null | 説明 |
| --- | --- | --- | --- |
| id | bigint unsigned | No | 主キー |
| author_account_id | bigint unsigned | No | 管理者accounts.id |
| target_type | varchar(100) | No | Account, Booking, TherapistProfile等 |
| target_id | bigint unsigned | No | 対象ID |
| note_encrypted | text | No | メモ |
| created_at / updated_at | timestamp | Yes | Laravel標準 |

インデックス:
* index: `target_type, target_id`
* index: `author_account_id, created_at`

## 14. ステータス定義

### 14.1 予約ステータス
`screen_flows.md` の予約ステータスと同一にする。

* draft
* quote_confirmed
* payment_authorized
* requested
* accepted
* confirmed
* moving
* arrived
* in_progress
* completed
* payment_captured
* review_pending
* closed
* rejected
* expired
* canceled_by_user
* canceled_by_therapist
* interrupted
* disputed
* refunded

### 14.2 本人確認ステータス
* pending
* approved
* rejected
* needs_review
* expired

### 14.3 タチキャストプロフィールステータス
* draft
* pending_review
* approved
* rejected
* suspended

### 14.4 出金ステータス
* pending_balance
* available_balance
* payout_requested
* payout_processing
* payout_paid
* payout_failed
* payout_on_hold

### 14.5 通報ステータス
* open
* investigating
* resolved
* dismissed

## 15. 重要インデックス・制約まとめ

### 15.1 ユニーク制約
* `accounts.public_id`
* `accounts.email`
* `accounts.phone_e164`
* `account_roles.account_id, role`
* `user_profiles.account_id`
* `therapist_profiles.account_id`
* `therapist_booking_settings.therapist_profile_id`
* `therapist_availability_slots.public_id`
* `therapist_locations.therapist_profile_id`
* `therapist_travel_requests.public_id`
* `bookings.public_id`
* `payment_intents.stripe_payment_intent_id`
* `stripe_connected_accounts.account_id`
* `stripe_connected_accounts.stripe_account_id`
* `stripe_customers.account_id`
* `stripe_webhook_events.stripe_event_id`
* `reviews.booking_id, reviewer_account_id`
* `account_blocks.blocker_account_id, blocked_account_id`

### 15.2 検索・一覧用インデックス
* タチキャスト検索: `therapist_profiles.profile_status, is_online`
* 予定予約空き枠検索: `therapist_availability_slots.therapist_profile_id, status, start_at`
* 位置検索: `therapist_locations.is_searchable, updated_at`, `lat, lng`, `geohash`
* 出張リクエスト一覧: `therapist_travel_requests.therapist_account_id, status, created_at`
* ユーザー予約一覧: `bookings.user_account_id, status, scheduled_start_at`
* タチキャスト予約一覧: `bookings.therapist_account_id, status, scheduled_start_at`
* 承諾タイムアウト処理: `bookings.status, request_expires_at`
* 出金処理: `payout_requests.scheduled_process_date, status`
* 通報対応: `reports.status, severity, created_at`
* Webhook再処理: `stripe_webhook_events.processed_status, created_at`

## 16. マイグレーション作成順

1. `accounts`
2. `account_roles`
3. `legal_documents`, `legal_acceptances`
4. `identity_verifications`
5. `user_profiles`, `therapist_profiles`
6. `profile_photos`
7. `therapist_menus`, `therapist_pricing_rules`, `therapist_booking_settings`, `therapist_availability_slots`, `platform_fee_settings`
8. `therapist_locations`, `service_addresses`, `location_search_logs`
9. `bookings`
10. `booking_quotes`
11. `booking_status_logs`, `booking_consents`, `booking_health_checks`
12. `booking_messages`, `therapist_travel_requests`
13. `push_subscriptions`, `notifications`
14. `stripe_connected_accounts`, `stripe_customers`
15. `payment_intents`, `refunds`, `stripe_disputes`, `stripe_webhook_events`
16. `payout_requests`, `therapist_ledger_entries`
17. `reviews`, `reports`, `report_actions`, `account_blocks`
18. `admin_audit_logs`, `admin_notes`
19. `temp_files`

補足:
* `bookings.current_quote_id` は `booking_quotes` 作成後に外部キーを追加するか、MVPでは外部キー制約なしで運用する。
* `payment_intents` はカード再入力・与信失敗・再与信に備えて、1予約に複数作成できる。現在有効なものは `is_current` で判定する。

## 17. MVP実装メモ

### 17.1 位置情報
* MVPではMySQLの空間型に依存せず、`decimal(10,7)` の緯度経度とHaversine式で計算する。
* APIレスポンスには緯度経度を返さず、15分/30分/60分の徒歩目安レンジだけ返す。
* 連続検索対策として `location_search_logs` を使う。

### 17.2 価格算定
* 表示するのは最終価格のみ。
* 内部監査のため、`booking_quotes.input_snapshot_json` と `applied_rules_json` に算定根拠を保存する。
* センシティブな自己申告項目は、MVPでは価格算定の直接要素にしない。

### 17.3 決済・売上
* Stripe PaymentIntentは原則manual captureで開始し、施術完了またはキャンセル料確定時にcaptureする。
* Stripe Webhookは `stripe_webhook_events` で必ず冪等処理する。
* タチキャスト残高は `therapist_ledger_entries` から算出し、表示用キャッシュが必要になった場合のみ別途追加する。

### 17.4 個人情報
* 本人確認書類、住所詳細、メッセージ本文、通報本文、健康情報、管理メモは暗号化カラムに保存する。
* 管理者が個人情報を閲覧・更新・出力した場合は `admin_audit_logs` に記録する。
* 退会時は法令・会計・安全運用上必要なデータを除き、匿名化または論理削除する。
