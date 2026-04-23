# すぐタチ

`sugutachi.com` 向けの、リラクゼーション / ボディケア / もみほぐし提供者と利用者をマッチングするWebアプリです。

## 技術スタック

* Laravel 13
* PHP 8.3+
* SQLite / MySQL想定
* Stripe Connect予定

## セットアップ

```bash
composer install
cp .env.example .env
php artisan key:generate
touch database/database.sqlite
php artisan migrate
php artisan serve
```

## 検証

```bash
php artisan test
vendor/bin/pint --test
```

## 設計ドキュメント

* [要件定義](requirements.md)
* [画面・ユーザーフロー](screen_flows.md)
* [DB設計](db_design.md)
* [API設計](api_design.md)
* [Laravelマイグレーション案](laravel_migrations.md)
