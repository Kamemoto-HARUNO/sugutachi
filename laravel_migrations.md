# Laravelマイグレーション案

## 1. 目的

このドキュメントは、`db_design.md` をLaravel/MySQLのマイグレーションへ落とすための実装順、ファイル名、型、制約、注意点を整理する。

現時点ではLaravelプロジェクト本体は未作成のため、実コードではなくマイグレーション実装案として定義する。

## 2. 前提

* Laravel 11以降を想定する。
* MySQL 8系を想定する。
* 主キーは `id()` を使う。
* 外部キーは原則 `foreignId()->constrained()` を使う。
* 外部公開IDは `public_id` とし、ULIDまたはUUID文字列を保存する。
* ステータスはMySQL enumではなく `string(..., 50)` で保存し、PHP側のEnum/定数で管理する。
* 金額はすべて日本円の整数で `unsignedInteger()` に保存する。
* 暗号化対象の値は `text()` に保存し、アプリケーション層で暗号化/復号する。
* `created_at` / `updated_at` はLaravel標準の `timestamps()` を使う。
* 論理削除が必要なテーブルのみ `softDeletes()` を使う。

## 3. 共通実装メモ

### 3.1 public_id

予約、通報、出金申請など外部URLに出るテーブルには `public_id` を持たせる。

```php
$table->string('public_id', 36)->unique();
```

ULIDを使う場合は36文字ではなく26文字で足りるが、UUIDへの変更余地を残して36文字にする。

### 3.2 status

```php
$table->string('status', 50)->index();
```

ステータス例:

* `active`
* `pending`
* `approved`
* `rejected`
* `requested`
* `confirmed`
* `payout_requested`

### 3.3 encryptedカラム

住所詳細、本人確認書類、通報本文、健康情報、管理メモなどは以下の形にする。

```php
$table->text('address_line_encrypted');
$table->text('detail_encrypted')->nullable();
```

検索・一覧で使う値は暗号化対象から分離する。

### 3.4 JSONカラム

MySQL 8の `json()` を使う。

```php
$table->json('metadata_json')->nullable();
```

MVPではJSON内検索に強く依存しない。検索が必要な項目は通常カラムへ切り出す。

### 3.5 外部キー制約

* 予約・決済・売上・監査ログは、過去履歴を壊さないため基本的にcascade deleteしない。
* マスタ/子要素で消してよいものだけcascadeする。
* `admin_account_id` 系は管理者アカウント削除時も履歴を残すため `nullOnDelete()` を使う。

## 4. マイグレーション作成順

### 4.1 認証・法務

1. `2026_01_01_000001_create_accounts_table.php`
2. `2026_01_01_000002_create_account_roles_table.php`
3. `2026_01_01_000003_create_legal_documents_table.php`
4. `2026_01_01_000004_create_legal_acceptances_table.php`

### 4.2 本人確認・プロフィール

5. `2026_01_01_000005_create_identity_verifications_table.php`
6. `2026_01_01_000006_create_user_profiles_table.php`
7. `2026_01_01_000007_create_therapist_profiles_table.php`
8. `2026_01_01_000008_create_profile_photos_table.php`

### 4.3 メニュー・料金

9. `2026_01_01_000009_create_therapist_menus_table.php`
10. `2026_01_01_000010_create_therapist_pricing_rules_table.php`
11. `2026_01_01_000011_create_platform_fee_settings_table.php`

### 4.4 位置・住所

12. `2026_01_01_000012_create_therapist_locations_table.php`
13. `2026_01_01_000013_create_service_addresses_table.php`
14. `2026_01_01_000014_create_location_search_logs_table.php`

### 4.5 予約

15. `2026_01_01_000015_create_bookings_table.php`
16. `2026_01_01_000016_create_booking_quotes_table.php`
17. `2026_01_01_000017_add_current_quote_id_to_bookings_table.php`
18. `2026_01_01_000018_create_booking_status_logs_table.php`
19. `2026_01_01_000019_create_booking_consents_table.php`
20. `2026_01_01_000020_create_booking_health_checks_table.php`
21. `2026_01_01_000021_create_booking_messages_table.php`

### 4.6 通知

22. `2026_01_01_000022_create_push_subscriptions_table.php`
23. `2026_01_01_000023_create_notifications_table.php`

### 4.7 Stripe・決済

24. `2026_01_01_000024_create_stripe_connected_accounts_table.php`
25. `2026_01_01_000025_create_stripe_customers_table.php`
26. `2026_01_01_000026_create_payment_intents_table.php`
27. `2026_01_01_000027_create_refunds_table.php`
28. `2026_01_01_000028_create_stripe_disputes_table.php`
29. `2026_01_01_000029_create_stripe_webhook_events_table.php`

### 4.8 売上・出金

30. `2026_01_01_000030_create_payout_requests_table.php`
31. `2026_01_01_000031_create_therapist_ledger_entries_table.php`

### 4.9 レビュー・通報

32. `2026_01_01_000032_create_reviews_table.php`
33. `2026_01_01_000033_create_reports_table.php`
34. `2026_01_01_000034_create_report_actions_table.php`
35. `2026_01_01_000035_create_account_blocks_table.php`

### 4.10 管理・監査

36. `2026_01_01_000036_create_admin_audit_logs_table.php`
37. `2026_01_01_000037_create_admin_notes_table.php`

## 5. 各マイグレーション案

### 5.1 accounts

```php
Schema::create('accounts', function (Blueprint $table) {
    $table->id();
    $table->string('public_id', 36)->unique();
    $table->string('email')->nullable()->unique();
    $table->timestamp('email_verified_at')->nullable();
    $table->string('phone_e164', 32)->nullable()->unique();
    $table->timestamp('phone_verified_at')->nullable();
    $table->string('password');
    $table->string('display_name', 80)->nullable();
    $table->string('status', 50)->default('active')->index();
    $table->string('last_active_role', 50)->nullable();
    $table->string('registered_ip_hash', 64)->nullable();
    $table->timestamp('last_login_at')->nullable();
    $table->timestamp('suspended_at')->nullable();
    $table->string('suspension_reason', 100)->nullable();
    $table->rememberToken();
    $table->timestamps();
    $table->softDeletes();
});
```

### 5.2 account_roles

```php
Schema::create('account_roles', function (Blueprint $table) {
    $table->id();
    $table->foreignId('account_id')->constrained('accounts')->restrictOnDelete();
    $table->string('role', 50);
    $table->string('status', 50)->default('active');
    $table->timestamp('granted_at')->nullable();
    $table->timestamp('revoked_at')->nullable();
    $table->timestamps();

    $table->unique(['account_id', 'role']);
    $table->index(['role', 'status']);
});
```

### 5.3 legal_documents / legal_acceptances

```php
Schema::create('legal_documents', function (Blueprint $table) {
    $table->id();
    $table->string('document_type', 50);
    $table->string('version', 50);
    $table->string('title');
    $table->longText('body');
    $table->timestamp('published_at')->nullable();
    $table->timestamp('effective_at')->nullable();
    $table->timestamps();

    $table->unique(['document_type', 'version']);
    $table->index(['document_type', 'published_at']);
});

Schema::create('legal_acceptances', function (Blueprint $table) {
    $table->id();
    $table->foreignId('account_id')->constrained('accounts')->restrictOnDelete();
    $table->foreignId('legal_document_id')->constrained('legal_documents')->restrictOnDelete();
    $table->timestamp('accepted_at');
    $table->string('ip_hash', 64)->nullable();
    $table->string('user_agent_hash', 64)->nullable();
    $table->timestamps();

    $table->unique(['account_id', 'legal_document_id']);
    $table->index(['account_id', 'accepted_at']);
});
```

### 5.4 identity_verifications

```php
Schema::create('identity_verifications', function (Blueprint $table) {
    $table->id();
    $table->foreignId('account_id')->constrained('accounts')->restrictOnDelete();
    $table->string('provider', 50)->default('manual');
    $table->string('provider_reference_id')->nullable();
    $table->string('status', 50)->default('pending')->index();
    $table->text('full_name_encrypted')->nullable();
    $table->text('birthdate_encrypted')->nullable();
    $table->unsignedSmallInteger('birth_year')->nullable();
    $table->boolean('is_age_verified')->default(false)->index();
    $table->boolean('self_declared_male')->default(false);
    $table->string('document_type', 50)->nullable();
    $table->string('document_last4_hash', 64)->nullable();
    $table->text('document_storage_key_encrypted')->nullable();
    $table->text('selfie_storage_key_encrypted')->nullable();
    $table->timestamp('submitted_at')->nullable();
    $table->foreignId('reviewed_by_account_id')->nullable()->constrained('accounts')->nullOnDelete();
    $table->timestamp('reviewed_at')->nullable();
    $table->string('rejection_reason_code', 100)->nullable();
    $table->timestamp('purge_after')->nullable();
    $table->timestamps();

    $table->index(['account_id', 'status']);
    $table->index(['status', 'submitted_at']);
});
```

### 5.5 user_profiles

```php
Schema::create('user_profiles', function (Blueprint $table) {
    $table->id();
    $table->foreignId('account_id')->unique()->constrained('accounts')->restrictOnDelete();
    $table->string('profile_status', 50)->default('incomplete')->index();
    $table->string('age_range', 50)->nullable();
    $table->string('body_type', 50)->nullable();
    $table->unsignedSmallInteger('height_cm')->nullable();
    $table->string('weight_range', 50)->nullable();
    $table->json('preferences_json')->nullable();
    $table->json('touch_ng_json')->nullable();
    $table->text('health_notes_encrypted')->nullable();
    $table->string('sexual_orientation', 50)->nullable();
    $table->string('gender_identity', 50)->nullable();
    $table->boolean('disclose_sensitive_profile_to_therapist')->default(false);
    $table->timestamps();
});
```

### 5.6 therapist_profiles

```php
Schema::create('therapist_profiles', function (Blueprint $table) {
    $table->id();
    $table->foreignId('account_id')->unique()->constrained('accounts')->restrictOnDelete();
    $table->string('public_name', 80);
    $table->text('bio')->nullable();
    $table->string('profile_status', 50)->default('draft');
    $table->string('training_status', 50)->default('none');
    $table->string('photo_review_status', 50)->default('pending');
    $table->boolean('is_online')->default(false);
    $table->timestamp('online_since')->nullable();
    $table->timestamp('last_location_updated_at')->nullable();
    $table->decimal('rating_average', 3, 2)->default(0);
    $table->unsignedInteger('review_count')->default(0);
    $table->timestamp('approved_at')->nullable();
    $table->foreignId('approved_by_account_id')->nullable()->constrained('accounts')->nullOnDelete();
    $table->string('rejected_reason_code', 100)->nullable();
    $table->timestamps();

    $table->index(['profile_status', 'is_online']);
    $table->index('training_status');
    $table->index('rating_average');
});
```

### 5.7 profile_photos

```php
Schema::create('profile_photos', function (Blueprint $table) {
    $table->id();
    $table->foreignId('account_id')->constrained('accounts')->restrictOnDelete();
    $table->foreignId('therapist_profile_id')->nullable()->constrained('therapist_profiles')->cascadeOnDelete();
    $table->string('usage_type', 50);
    $table->text('storage_key_encrypted');
    $table->string('content_hash', 64)->nullable();
    $table->string('status', 50)->default('pending');
    $table->string('rejection_reason_code', 100)->nullable();
    $table->unsignedInteger('sort_order')->default(0);
    $table->foreignId('reviewed_by_account_id')->nullable()->constrained('accounts')->nullOnDelete();
    $table->timestamp('reviewed_at')->nullable();
    $table->timestamps();

    $table->index(['account_id', 'usage_type']);
    $table->index(['therapist_profile_id', 'status', 'sort_order']);
    $table->index(['status', 'created_at']);
});
```

### 5.8 therapist_menus

```php
Schema::create('therapist_menus', function (Blueprint $table) {
    $table->id();
    $table->string('public_id', 36)->unique();
    $table->foreignId('therapist_profile_id')->constrained('therapist_profiles')->cascadeOnDelete();
    $table->string('name', 120);
    $table->text('description')->nullable();
    $table->unsignedInteger('duration_minutes');
    $table->unsignedInteger('base_price_amount');
    $table->boolean('is_active')->default(true);
    $table->unsignedInteger('sort_order')->default(0);
    $table->timestamps();

    $table->index(['therapist_profile_id', 'is_active', 'sort_order']);
});
```

### 5.9 therapist_pricing_rules

```php
Schema::create('therapist_pricing_rules', function (Blueprint $table) {
    $table->id();
    $table->foreignId('therapist_profile_id')->constrained('therapist_profiles')->cascadeOnDelete();
    $table->foreignId('therapist_menu_id')->nullable()->constrained('therapist_menus')->cascadeOnDelete();
    $table->string('rule_type', 50);
    $table->json('condition_json')->nullable();
    $table->string('adjustment_type', 50);
    $table->integer('adjustment_amount');
    $table->unsignedInteger('min_price_amount')->nullable();
    $table->unsignedInteger('max_price_amount')->nullable();
    $table->unsignedInteger('priority')->default(100);
    $table->boolean('is_active')->default(true);
    $table->timestamps();

    $table->index(['therapist_profile_id', 'is_active', 'priority']);
    $table->index(['therapist_menu_id', 'is_active']);
});
```

### 5.10 platform_fee_settings

```php
Schema::create('platform_fee_settings', function (Blueprint $table) {
    $table->id();
    $table->string('setting_key', 100);
    $table->json('value_json');
    $table->timestamp('active_from')->nullable();
    $table->timestamp('active_until')->nullable();
    $table->foreignId('created_by_account_id')->nullable()->constrained('accounts')->nullOnDelete();
    $table->timestamps();

    $table->unique(['setting_key', 'active_from']);
});
```

### 5.11 therapist_locations

```php
Schema::create('therapist_locations', function (Blueprint $table) {
    $table->id();
    $table->foreignId('therapist_profile_id')->unique()->constrained('therapist_profiles')->cascadeOnDelete();
    $table->decimal('lat', 10, 7);
    $table->decimal('lng', 10, 7);
    $table->string('geohash', 12)->nullable();
    $table->unsignedInteger('accuracy_m')->nullable();
    $table->string('source', 50)->default('browser');
    $table->boolean('is_searchable')->default(false);
    $table->timestamps();

    $table->index(['is_searchable', 'updated_at']);
    $table->index(['lat', 'lng']);
    $table->index('geohash');
});
```

### 5.12 service_addresses

```php
Schema::create('service_addresses', function (Blueprint $table) {
    $table->id();
    $table->string('public_id', 36)->unique();
    $table->foreignId('account_id')->constrained('accounts')->restrictOnDelete();
    $table->string('label', 80)->nullable();
    $table->string('place_type', 50);
    $table->text('postal_code_encrypted')->nullable();
    $table->string('prefecture', 50)->nullable();
    $table->string('city', 100)->nullable();
    $table->text('address_line_encrypted');
    $table->text('building_encrypted')->nullable();
    $table->text('access_notes_encrypted')->nullable();
    $table->decimal('lat', 10, 7);
    $table->decimal('lng', 10, 7);
    $table->string('geohash', 12)->nullable();
    $table->boolean('is_default')->default(false);
    $table->timestamps();
    $table->softDeletes();

    $table->index(['account_id', 'is_default']);
    $table->index(['prefecture', 'city']);
    $table->index(['lat', 'lng']);
    $table->index('geohash');
});
```

### 5.13 location_search_logs

```php
Schema::create('location_search_logs', function (Blueprint $table) {
    $table->id();
    $table->foreignId('account_id')->constrained('accounts')->restrictOnDelete();
    $table->decimal('searched_lat', 10, 7)->nullable();
    $table->decimal('searched_lng', 10, 7)->nullable();
    $table->string('searched_geohash', 12)->nullable();
    $table->unsignedInteger('result_count')->default(0);
    $table->string('ip_hash', 64)->nullable();
    $table->timestamp('created_at')->nullable();

    $table->index(['account_id', 'created_at']);
    $table->index(['searched_geohash', 'created_at']);
});
```

### 5.14 bookings

```php
Schema::create('bookings', function (Blueprint $table) {
    $table->id();
    $table->string('public_id', 36)->unique();
    $table->foreignId('user_account_id')->constrained('accounts')->restrictOnDelete();
    $table->foreignId('therapist_account_id')->constrained('accounts')->restrictOnDelete();
    $table->foreignId('therapist_profile_id')->constrained('therapist_profiles')->restrictOnDelete();
    $table->foreignId('therapist_menu_id')->constrained('therapist_menus')->restrictOnDelete();
    $table->foreignId('service_address_id')->constrained('service_addresses')->restrictOnDelete();
    $table->string('status', 50)->index();
    $table->boolean('is_on_demand')->default(true);
    $table->timestamp('requested_start_at')->nullable();
    $table->timestamp('scheduled_start_at')->nullable();
    $table->timestamp('scheduled_end_at')->nullable();
    $table->unsignedInteger('duration_minutes');
    $table->timestamp('request_expires_at')->nullable();
    $table->timestamp('accepted_at')->nullable();
    $table->timestamp('confirmed_at')->nullable();
    $table->timestamp('moving_at')->nullable();
    $table->timestamp('arrived_at')->nullable();
    $table->timestamp('started_at')->nullable();
    $table->timestamp('ended_at')->nullable();
    $table->timestamp('canceled_at')->nullable();
    $table->foreignId('canceled_by_account_id')->nullable()->constrained('accounts')->nullOnDelete();
    $table->string('cancel_reason_code', 100)->nullable();
    $table->timestamp('interrupted_at')->nullable();
    $table->string('interruption_reason_code', 100)->nullable();
    $table->unsignedInteger('total_amount')->default(0);
    $table->unsignedInteger('therapist_net_amount')->default(0);
    $table->unsignedInteger('platform_fee_amount')->default(0);
    $table->unsignedInteger('matching_fee_amount')->default(0);
    $table->json('user_snapshot_json')->nullable();
    $table->json('therapist_snapshot_json')->nullable();
    $table->timestamps();

    $table->index(['user_account_id', 'status', 'scheduled_start_at']);
    $table->index(['therapist_account_id', 'status', 'scheduled_start_at']);
    $table->index(['therapist_profile_id', 'status']);
    $table->index(['status', 'request_expires_at']);
});
```

`current_quote_id` は `booking_quotes` 作成後に追加する。

```php
Schema::table('bookings', function (Blueprint $table) {
    $table->foreignId('current_quote_id')->nullable()->after('service_address_id')->constrained('booking_quotes')->nullOnDelete();
});
```

### 5.15 booking_quotes

```php
Schema::create('booking_quotes', function (Blueprint $table) {
    $table->id();
    $table->string('public_id', 36)->unique();
    $table->foreignId('booking_id')->nullable()->constrained('bookings')->cascadeOnDelete();
    $table->foreignId('therapist_profile_id')->constrained('therapist_profiles')->restrictOnDelete();
    $table->foreignId('therapist_menu_id')->constrained('therapist_menus')->restrictOnDelete();
    $table->unsignedInteger('duration_minutes');
    $table->unsignedInteger('base_amount')->default(0);
    $table->unsignedInteger('travel_fee_amount')->default(0);
    $table->unsignedInteger('night_fee_amount')->default(0);
    $table->unsignedInteger('demand_fee_amount')->default(0);
    $table->integer('profile_adjustment_amount')->default(0);
    $table->unsignedInteger('matching_fee_amount')->default(0);
    $table->unsignedInteger('platform_fee_amount')->default(0);
    $table->unsignedInteger('total_amount')->default(0);
    $table->unsignedInteger('therapist_gross_amount')->default(0);
    $table->unsignedInteger('therapist_net_amount')->default(0);
    $table->string('calculation_version', 50);
    $table->json('input_snapshot_json');
    $table->json('applied_rules_json');
    $table->timestamp('expires_at')->nullable();
    $table->timestamps();

    $table->index('booking_id');
    $table->index(['therapist_profile_id', 'created_at']);
    $table->index('expires_at');
});
```

### 5.16 booking_status_logs / consents / health_checks

```php
Schema::create('booking_status_logs', function (Blueprint $table) {
    $table->id();
    $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
    $table->string('from_status', 50)->nullable();
    $table->string('to_status', 50);
    $table->foreignId('actor_account_id')->nullable()->constrained('accounts')->nullOnDelete();
    $table->string('actor_role', 50)->nullable();
    $table->string('reason_code', 100)->nullable();
    $table->text('note_encrypted')->nullable();
    $table->json('metadata_json')->nullable();
    $table->timestamp('created_at')->nullable();

    $table->index(['booking_id', 'created_at']);
    $table->index(['to_status', 'created_at']);
    $table->index(['actor_account_id', 'created_at']);
});

Schema::create('booking_consents', function (Blueprint $table) {
    $table->id();
    $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
    $table->foreignId('account_id')->constrained('accounts')->restrictOnDelete();
    $table->string('consent_type', 100);
    $table->foreignId('legal_document_id')->nullable()->constrained('legal_documents')->nullOnDelete();
    $table->timestamp('consented_at');
    $table->string('ip_hash', 64)->nullable();
    $table->timestamps();

    $table->unique(['booking_id', 'account_id', 'consent_type']);
    $table->index(['account_id', 'consented_at']);
});

Schema::create('booking_health_checks', function (Blueprint $table) {
    $table->id();
    $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
    $table->foreignId('account_id')->constrained('accounts')->restrictOnDelete();
    $table->string('role', 50);
    $table->string('drinking_status', 50)->nullable();
    $table->boolean('has_injury')->nullable();
    $table->boolean('has_fever')->nullable();
    $table->json('contraindications_json')->nullable();
    $table->text('notes_encrypted')->nullable();
    $table->timestamp('checked_at');
    $table->timestamps();

    $table->index(['booking_id', 'role']);
    $table->index(['account_id', 'checked_at']);
});
```

### 5.17 booking_messages

```php
Schema::create('booking_messages', function (Blueprint $table) {
    $table->id();
    $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
    $table->foreignId('sender_account_id')->nullable()->constrained('accounts')->nullOnDelete();
    $table->string('message_type', 50);
    $table->text('body_encrypted');
    $table->boolean('detected_contact_exchange')->default(false);
    $table->string('moderation_status', 50)->default('ok');
    $table->timestamp('sent_at');
    $table->timestamp('read_at')->nullable();
    $table->timestamps();

    $table->index(['booking_id', 'sent_at']);
    $table->index(['sender_account_id', 'sent_at']);
    $table->index('moderation_status');
});
```

### 5.18 push_subscriptions / notifications

```php
Schema::create('push_subscriptions', function (Blueprint $table) {
    $table->id();
    $table->foreignId('account_id')->constrained('accounts')->cascadeOnDelete();
    $table->string('endpoint_hash', 64)->unique();
    $table->text('endpoint_encrypted');
    $table->text('p256dh_encrypted');
    $table->text('auth_encrypted');
    $table->string('user_agent_hash', 64)->nullable();
    $table->string('permission_status', 50)->default('granted');
    $table->timestamp('last_used_at')->nullable();
    $table->timestamp('revoked_at')->nullable();
    $table->timestamps();

    $table->index(['account_id', 'permission_status']);
});

Schema::create('notifications', function (Blueprint $table) {
    $table->id();
    $table->foreignId('account_id')->constrained('accounts')->cascadeOnDelete();
    $table->string('notification_type', 100);
    $table->string('channel', 50);
    $table->string('title');
    $table->text('body')->nullable();
    $table->json('data_json')->nullable();
    $table->string('status', 50)->default('queued');
    $table->timestamp('sent_at')->nullable();
    $table->timestamp('read_at')->nullable();
    $table->timestamps();

    $table->index(['account_id', 'read_at', 'created_at']);
    $table->index(['notification_type', 'created_at']);
    $table->index(['status', 'created_at']);
});
```

### 5.19 stripe_connected_accounts / stripe_customers

```php
Schema::create('stripe_connected_accounts', function (Blueprint $table) {
    $table->id();
    $table->foreignId('account_id')->unique()->constrained('accounts')->restrictOnDelete();
    $table->foreignId('therapist_profile_id')->constrained('therapist_profiles')->restrictOnDelete();
    $table->string('stripe_account_id')->unique();
    $table->string('account_type', 50)->default('express');
    $table->string('status', 50)->default('pending');
    $table->boolean('charges_enabled')->default(false);
    $table->boolean('payouts_enabled')->default(false);
    $table->boolean('details_submitted')->default(false);
    $table->json('requirements_currently_due_json')->nullable();
    $table->json('requirements_past_due_json')->nullable();
    $table->string('disabled_reason')->nullable();
    $table->timestamp('onboarding_completed_at')->nullable();
    $table->timestamp('last_synced_at')->nullable();
    $table->timestamps();

    $table->index(['status', 'payouts_enabled']);
});

Schema::create('stripe_customers', function (Blueprint $table) {
    $table->id();
    $table->foreignId('account_id')->unique()->constrained('accounts')->restrictOnDelete();
    $table->string('stripe_customer_id')->unique();
    $table->string('default_payment_method_id')->nullable();
    $table->timestamps();
});
```

### 5.20 payment_intents

```php
Schema::create('payment_intents', function (Blueprint $table) {
    $table->id();
    $table->foreignId('booking_id')->constrained('bookings')->restrictOnDelete();
    $table->foreignId('payer_account_id')->constrained('accounts')->restrictOnDelete();
    $table->string('stripe_payment_intent_id')->unique();
    $table->string('stripe_customer_id')->nullable();
    $table->foreignId('stripe_connected_account_id')->nullable()->constrained('stripe_connected_accounts')->nullOnDelete();
    $table->string('status', 50);
    $table->string('capture_method', 50)->default('manual');
    $table->string('currency', 3)->default('jpy');
    $table->unsignedInteger('amount');
    $table->unsignedInteger('application_fee_amount')->default(0);
    $table->unsignedInteger('transfer_amount')->default(0);
    $table->boolean('is_current')->default(true);
    $table->timestamp('authorized_at')->nullable();
    $table->timestamp('captured_at')->nullable();
    $table->timestamp('canceled_at')->nullable();
    $table->string('last_stripe_event_id')->nullable();
    $table->json('metadata_json')->nullable();
    $table->timestamps();

    $table->index(['booking_id', 'is_current']);
    $table->index(['payer_account_id', 'created_at']);
    $table->index(['status', 'created_at']);
});
```

### 5.21 refunds / stripe_disputes / stripe_webhook_events

```php
Schema::create('refunds', function (Blueprint $table) {
    $table->id();
    $table->string('public_id', 36)->unique();
    $table->foreignId('booking_id')->constrained('bookings')->restrictOnDelete();
    $table->foreignId('payment_intent_id')->nullable()->constrained('payment_intents')->nullOnDelete();
    $table->foreignId('requested_by_account_id')->constrained('accounts')->restrictOnDelete();
    $table->string('status', 50)->default('requested');
    $table->string('reason_code', 100);
    $table->text('detail_encrypted')->nullable();
    $table->unsignedInteger('requested_amount')->nullable();
    $table->unsignedInteger('approved_amount')->nullable();
    $table->string('stripe_refund_id')->nullable();
    $table->foreignId('reviewed_by_account_id')->nullable()->constrained('accounts')->nullOnDelete();
    $table->timestamp('reviewed_at')->nullable();
    $table->timestamp('processed_at')->nullable();
    $table->timestamps();

    $table->index(['booking_id', 'status']);
    $table->index(['status', 'created_at']);
});

Schema::create('stripe_disputes', function (Blueprint $table) {
    $table->id();
    $table->foreignId('booking_id')->nullable()->constrained('bookings')->nullOnDelete();
    $table->foreignId('payment_intent_id')->nullable()->constrained('payment_intents')->nullOnDelete();
    $table->string('stripe_dispute_id')->unique();
    $table->string('status', 50);
    $table->string('reason', 100)->nullable();
    $table->unsignedInteger('amount');
    $table->string('currency', 3)->default('jpy');
    $table->timestamp('evidence_due_by')->nullable();
    $table->string('outcome', 50)->nullable();
    $table->string('last_stripe_event_id')->nullable();
    $table->timestamps();

    $table->index('booking_id');
    $table->index(['status', 'evidence_due_by']);
});

Schema::create('stripe_webhook_events', function (Blueprint $table) {
    $table->id();
    $table->string('stripe_event_id')->unique();
    $table->string('event_type');
    $table->json('payload_json');
    $table->string('processed_status', 50)->default('pending');
    $table->timestamp('processed_at')->nullable();
    $table->text('failure_reason')->nullable();
    $table->unsignedInteger('retry_count')->default(0);
    $table->timestamps();

    $table->index(['event_type', 'created_at']);
    $table->index(['processed_status', 'created_at']);
});
```

### 5.22 payout_requests / therapist_ledger_entries

```php
Schema::create('payout_requests', function (Blueprint $table) {
    $table->id();
    $table->string('public_id', 36)->unique();
    $table->foreignId('therapist_account_id')->constrained('accounts')->restrictOnDelete();
    $table->foreignId('stripe_connected_account_id')->constrained('stripe_connected_accounts')->restrictOnDelete();
    $table->string('status', 50)->default('payout_requested');
    $table->unsignedInteger('requested_amount');
    $table->unsignedInteger('fee_amount')->default(0);
    $table->unsignedInteger('net_amount');
    $table->timestamp('requested_at');
    $table->date('scheduled_process_date');
    $table->timestamp('processed_at')->nullable();
    $table->string('stripe_payout_id')->nullable();
    $table->text('failure_reason')->nullable();
    $table->foreignId('reviewed_by_account_id')->nullable()->constrained('accounts')->nullOnDelete();
    $table->timestamps();

    $table->index(['therapist_account_id', 'status']);
    $table->index(['scheduled_process_date', 'status']);
    $table->index('stripe_payout_id');
});

Schema::create('therapist_ledger_entries', function (Blueprint $table) {
    $table->id();
    $table->foreignId('therapist_account_id')->constrained('accounts')->restrictOnDelete();
    $table->foreignId('booking_id')->nullable()->constrained('bookings')->nullOnDelete();
    $table->foreignId('payout_request_id')->nullable()->constrained('payout_requests')->nullOnDelete();
    $table->string('entry_type', 50);
    $table->integer('amount_signed');
    $table->string('status', 50);
    $table->timestamp('available_at')->nullable();
    $table->string('description')->nullable();
    $table->json('metadata_json')->nullable();
    $table->timestamps();

    $table->index(['therapist_account_id', 'status']);
    $table->index('booking_id');
    $table->index('payout_request_id');
    $table->index('available_at');
});
```

### 5.23 reviews

```php
Schema::create('reviews', function (Blueprint $table) {
    $table->id();
    $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
    $table->foreignId('reviewer_account_id')->constrained('accounts')->restrictOnDelete();
    $table->foreignId('reviewee_account_id')->constrained('accounts')->restrictOnDelete();
    $table->string('reviewer_role', 50);
    $table->unsignedTinyInteger('rating_overall');
    $table->unsignedTinyInteger('rating_manners')->nullable();
    $table->unsignedTinyInteger('rating_skill')->nullable();
    $table->unsignedTinyInteger('rating_cleanliness')->nullable();
    $table->unsignedTinyInteger('rating_safety')->nullable();
    $table->text('public_comment')->nullable();
    $table->text('private_feedback_encrypted')->nullable();
    $table->string('status', 50)->default('visible');
    $table->foreignId('moderated_by_account_id')->nullable()->constrained('accounts')->nullOnDelete();
    $table->timestamp('moderated_at')->nullable();
    $table->timestamps();

    $table->unique(['booking_id', 'reviewer_account_id']);
    $table->index(['reviewee_account_id', 'status', 'created_at']);
    $table->index(['status', 'created_at']);
});
```

### 5.24 reports / report_actions / account_blocks

```php
Schema::create('reports', function (Blueprint $table) {
    $table->id();
    $table->string('public_id', 36)->unique();
    $table->foreignId('booking_id')->nullable()->constrained('bookings')->nullOnDelete();
    $table->foreignId('reporter_account_id')->constrained('accounts')->restrictOnDelete();
    $table->foreignId('target_account_id')->nullable()->constrained('accounts')->nullOnDelete();
    $table->string('category', 100);
    $table->string('severity', 50)->default('medium');
    $table->text('detail_encrypted')->nullable();
    $table->string('status', 50)->default('open');
    $table->foreignId('assigned_admin_account_id')->nullable()->constrained('accounts')->nullOnDelete();
    $table->timestamp('resolved_at')->nullable();
    $table->timestamps();

    $table->index(['booking_id', 'status']);
    $table->index(['reporter_account_id', 'created_at']);
    $table->index(['target_account_id', 'status']);
    $table->index(['status', 'severity', 'created_at']);
});

Schema::create('report_actions', function (Blueprint $table) {
    $table->id();
    $table->foreignId('report_id')->constrained('reports')->cascadeOnDelete();
    $table->foreignId('admin_account_id')->nullable()->constrained('accounts')->nullOnDelete();
    $table->string('action_type', 100);
    $table->text('note_encrypted')->nullable();
    $table->json('metadata_json')->nullable();
    $table->timestamp('created_at')->nullable();

    $table->index(['report_id', 'created_at']);
    $table->index(['action_type', 'created_at']);
});

Schema::create('account_blocks', function (Blueprint $table) {
    $table->id();
    $table->foreignId('blocker_account_id')->constrained('accounts')->cascadeOnDelete();
    $table->foreignId('blocked_account_id')->constrained('accounts')->cascadeOnDelete();
    $table->string('reason_code', 100)->nullable();
    $table->timestamps();

    $table->unique(['blocker_account_id', 'blocked_account_id']);
    $table->index('blocked_account_id');
});
```

### 5.25 admin_audit_logs / admin_notes

```php
Schema::create('admin_audit_logs', function (Blueprint $table) {
    $table->id();
    $table->foreignId('actor_account_id')->nullable()->constrained('accounts')->nullOnDelete();
    $table->string('action', 100);
    $table->string('target_type', 100);
    $table->unsignedBigInteger('target_id')->nullable();
    $table->string('ip_hash', 64)->nullable();
    $table->string('user_agent_hash', 64)->nullable();
    $table->json('before_json')->nullable();
    $table->json('after_json')->nullable();
    $table->timestamp('created_at')->nullable();

    $table->index(['actor_account_id', 'created_at']);
    $table->index(['target_type', 'target_id']);
    $table->index(['action', 'created_at']);
});

Schema::create('admin_notes', function (Blueprint $table) {
    $table->id();
    $table->foreignId('author_account_id')->constrained('accounts')->restrictOnDelete();
    $table->string('target_type', 100);
    $table->unsignedBigInteger('target_id');
    $table->text('note_encrypted');
    $table->timestamps();

    $table->index(['target_type', 'target_id']);
    $table->index(['author_account_id', 'created_at']);
});
```

## 6. Laravelモデル候補

最低限、以下のモデルを作る。

* `Account`
* `AccountRole`
* `IdentityVerification`
* `UserProfile`
* `TherapistProfile`
* `TherapistMenu`
* `TherapistPricingRule`
* `TherapistLocation`
* `ServiceAddress`
* `Booking`
* `BookingQuote`
* `BookingStatusLog`
* `PaymentIntent`
* `StripeConnectedAccount`
* `StripeWebhookEvent`
* `TherapistLedgerEntry`
* `PayoutRequest`
* `Review`
* `Report`
* `Refund`

## 7. Seeder候補

### 7.1 platform_fee_settings

初期値:

```json
{
  "matching_fee_amount": 300,
  "platform_fee_rate": 0.10,
  "walking_detour_factor": 1.3,
  "walking_speed_kmh": 4.0,
  "cancel_policy": {
    "before_acceptance": "free",
    "before_24h": "free_or_matching_fee",
    "between_24h_and_3h": 0.5,
    "within_3h": 1.0
  }
}
```

### 7.2 legal_documents

MVP開始前に以下の初期版を登録する。

* 利用規約。
* セラピスト利用規約。
* プライバシーポリシー。
* 特定商取引法に基づく表記。

### 7.3 admin account

初期管理者アカウントを1件作成し、`account_roles` に `admin` を付与する。

## 8. 実装時の注意点

### 8.1 循環参照

`bookings.current_quote_id` は `booking_quotes` が作成された後に追加する。最初の `bookings` 作成時には入れない。

### 8.2 PaymentIntentの複数作成

カード再入力、与信失敗、与信期限切れ、再与信に備え、`payment_intents.booking_id` はuniqueにしない。現在有効なIntentは `is_current = true` で判定する。

### 8.3 緯度経度

MVPでは空間型を使わず、`decimal(10,7)` とHaversine式で計算する。APIレスポンスでは緯度経度を返さない。

### 8.4 台帳

セラピスト残高は `therapist_ledger_entries` を正とする。残高キャッシュテーブルはMVPでは作らない。

### 8.5 暗号化

LaravelのEloquent Castまたは専用Value Objectで暗号化/復号を隠蔽する。検索が必要な情報は暗号化カラムに入れず、別カラムへ分離する。
