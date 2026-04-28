# すぐタチ

`sugutachi.com` 向けの、リラクゼーション / ボディケア / もみほぐし提供者と利用者をマッチングするWebアプリです。

## 技術スタック

* Laravel 13
* PHP 8.3+
* MySQL 8+ / MariaDB 10.6+（ローカル・本番の基本DB）
* SQLite（自動テストの高速実行用途）
* Stripe（ユーザー決済）+ アプリ内売上台帳 + 手動出金

## セットアップ

```bash
composer install
cp .env.example .env
# .env の DB_* をローカル MySQL に合わせて必要に応じて修正
mysql -u your_user -p -e "CREATE DATABASE IF NOT EXISTS sugutachi_local CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
php artisan key:generate
php artisan migrate
php artisan db:seed
php artisan serve
```

ローカル開発と本番受け入れ確認は MySQL / MariaDB を前提にします。SQLite は `php artisan test` の高速実行用です。
ブランチ更新後や `git pull` 後は、必ず `php artisan migrate` を実行してローカルDBを最新スキーマに追従させてください。
Homebrew の `mysql` 9 系は、既存の 8.0 系データディレクトリから直接起動できず失敗することがあります。ローカル検証には `mysql@8.4` か MariaDB 10.6+ を推奨します。

## 検証

```bash
php artisan test
vendor/bin/pint --test
```

主要フローの最終確認では、MySQL 接続で `php artisan migrate:fresh --seed` 相当の検証を行ってから反映してください。

## ローカルプレビュー用シーダー

ローカル環境で `php artisan db:seed` を実行すると、法務文書の初期公開に加えて、画面プレビュー用の利用者 / タチキャスト / 兼用アカウントと、予約・空き枠・レビュー・通知などの関連データが入ります。

必要に応じて個別実行もできます。

```bash
php artisan db:seed --class=Database\\Seeders\\LocalPreviewSeeder
```

主なログイン情報:

* 利用者: `preview-user@sugutachi.local` / `password`
* タチキャスト: `preview-therapist@sugutachi.local` / `password`
* 兼用: `preview-hybrid@sugutachi.local` / `password`

## 設計ドキュメント

* [要件定義](requirements.md)
* [画面・ユーザーフロー](screen_flows.md)
* [DB設計](db_design.md)
* [API設計](api_design.md)
* [Laravelマイグレーション案](laravel_migrations.md)
* [環境・リリース運用ガイド](environment_and_release_runbook.md)
