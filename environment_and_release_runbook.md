# 環境・リリース運用ガイド

このドキュメントは、`ローカル / 開発(staging) / 本番(main)` の運用、デプロイ手順、環境変数、GTM、メール、AIエージェント運用の前提をまとめたものです。

## 1. 環境の分け方

| 環境 | 用途 | Gitブランチ | 推奨ドメイン | 備考 |
| --- | --- | --- | --- | --- |
| local | 開発者の手元 | 任意 | `http://localhost:8000` など | 実メール・実課金・実計測は無効 |
| staging | 結合確認 / 人力テスト | `staging` | `https://stg.sugutachi.com` | 本番に近い構成で動作確認 |
| production | 公開本番 | `main` | `https://sugutachi.com` | 実ユーザー向け |

### 推奨方針

- `main` は本番反映専用にする
- `staging` は開発環境の統合ブランチにする
- 機能開発は `feature/...` や `fix/...` ブランチを `staging` から切る
- 緊急修正は `main` から `hotfix/...` を切って、本番反映後に `staging` へも戻す

## 2. Git運用

### 推奨フロー

1. `staging` から `feature/xxx` を作る
2. 作業後に `staging` へ PR
3. staging 環境へデプロイ
4. 人力で UAT
5. 問題なければ `staging -> main` の PR
6. 本番デプロイ

### 命名例

- `feature/instant-booking`
- `feature/admin-legal-documents`
- `fix/booking-expiration`
- `hotfix/payment-sync-error`

### 補足

- リリース単位が分かるように、`main` へ入る PR はなるべく複数機能を詰め込みすぎない
- 本番反映後はタグを切ると追跡しやすい
  - 例: `release/2026-04-28.1`

## 3. 環境変数の考え方

最低限、環境ごとに分けるべき項目は次です。

### アプリ基本

- `APP_ENV`
- `APP_DEBUG`
- `APP_URL`
- `SERVICE_BASE_URL`
- `SERVICE_DOMAIN`
- `SANCTUM_STATEFUL_DOMAINS`

### DB

- `DB_HOST`
- `DB_PORT`
- `DB_DATABASE`
- `DB_USERNAME`
- `DB_PASSWORD`

### メール

- `MAIL_MAILER`
- `MAIL_HOST`
- `MAIL_PORT`
- `MAIL_USERNAME`
- `MAIL_PASSWORD`
- `MAIL_FROM_ADDRESS`
- `MAIL_FROM_NAME`
- `SERVICE_SUPPORT_EMAIL`

### 決済

- `STRIPE_SECRET`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`

### プッシュ通知

- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_VAPID_SUBJECT`

### GTM

- `GTM_ENABLED`
- `GTM_CONTAINER_ID`
- `GTM_AUTH`
- `GTM_PREVIEW`

## 4. メールアドレスの分け方

### 結論

- `本番` と `staging` で送信元メールアドレスは分けるのがおすすめ
- `support` 系は同じでも構わないが、テスター向け表示もあるなら staging 用も分けた方が事故が少ない

### 推奨例

#### production

- `MAIL_FROM_ADDRESS=notify@sugutachi.com`
- `SERVICE_SUPPORT_EMAIL=support@sugutachi.com`

#### staging

- `MAIL_FROM_ADDRESS=staging-notify@sugutachi.com`
- `SERVICE_SUPPORT_EMAIL=staging-support@sugutachi.com` もしくは `support@sugutachi.com`

### 運用注意

- staging では実ユーザーにメールを送らない運用が安全
- 可能なら staging は
  - テスターのみに送る
  - 送信先を allowlist 制御する
  - もしくは `MAIL_MAILER=log` で確認する

## 5. Googleタグマネージャー

## 方針

- local: 無効
- staging: staging 用の GTM 環境で有効
- production: 本番の Live 環境で有効

### 今回の実装

`resources/views/app.blade.php` に、環境変数で切り替えられる GTM スニペットを追加済みです。

#### 使い方

##### production

```env
GTM_ENABLED=true
GTM_CONTAINER_ID=GTM-XXXXXXX
GTM_AUTH=
GTM_PREVIEW=
```

##### staging

```env
GTM_ENABLED=true
GTM_CONTAINER_ID=GTM-XXXXXXX
GTM_AUTH=xxxx
GTM_PREVIEW=env-3
```

### 補足

- staging は `GTM Environment` を使うと本番と分離しやすい
- まだ Cookie 同意バナーを入れていないので、広告タグや解析タグの発火方針は別途整理が必要
- local では `GTM_ENABLED=false` のままにする

## 6. デプロイ方法

Xserver 系の共有ホスティングを前提にすると、次の 2 パターンがあります。

### A. サーバ側で build する

Node と Composer が本番サーバで十分動くなら、

1. `git pull`
2. `composer install --no-dev --optimize-autoloader`
3. `php artisan migrate --force`
4. `npm ci`
5. `npm run build`
6. `php artisan optimize`

で更新できます。

### B. CI で build して成果物をデプロイする

共有サーバで Node 実行が重い場合は、こちらの方が安全です。

1. GitHub Actions で `npm run build`
2. `public/build` を成果物に含める
3. サーバでは `composer install --no-dev` と `php artisan migrate --force` を中心に行う

### 現時点のおすすめ

本番・staging どちらも、最終的には `B. CI build` へ寄せるのがおすすめです。

理由:

- shared hosting 上の Node 依存を減らせる
- build 差異が減る
- AI エージェントや人間のローカル環境差分を本番へ持ち込みにくい

## 7. デプロイ手順

### staging

1. `feature/...` を `staging` へマージ
2. staging サーバで
   - `git pull`
   - `composer install --no-dev --optimize-autoloader`
   - `php artisan migrate --force`
   - `npm run build` または CI 成果物反映
   - `php artisan optimize`
3. 人力確認

### production

1. `staging -> main` をマージ
2. 本番サーバで
   - `php artisan down`
   - `git pull`
   - `composer install --no-dev --optimize-autoloader`
   - `php artisan migrate --force`
   - `npm run build` または CI 成果物反映
   - `php artisan optimize`
   - `php artisan up`

## 8. cron / scheduler

このアプリは Laravel scheduler を前提にしています。最低限、本番と staging の両方で cron 設定が必要です。

```cron
* * * * * php /path/to/artisan schedule:run >> /dev/null 2>&1
```

現在 scheduler で動いている主な処理:

- 保留売上の解放
- 予約リクエスト期限切れ処理
- 完了確認リマインド / 自動完了
- 本人確認書類の削除

## 9. queue の扱い

現状は `QUEUE_CONNECTION=database` ですが、主要通知やメールは同期実行の比重がまだ高く、常時 queue worker が必須という状態ではありません。

ただし今後、

- メール送信を queue 化する
- Web Push を queue 化する
- 重い集計や外部 API 連携を増やす

場合は、production / staging ともに queue worker の常駐を追加してください。

## 10. staging / production のチェックリスト

### リリース前

- `php artisan test`
- `npm run typecheck`
- `npm run build`
- 本人確認提出
- 予約作成
- タチキャスト承諾
- 決済 / 完了
- 通知センター
- プッシュ通知
- 出金申請
- 法務文書表示

### リリース直後

- エラーログ確認
- メール送信確認
- Stripe webhook 動作確認
- PWA manifest / service worker 更新確認
- GTM の発火確認

## 11. AIエージェント向け運用ルール

AI エージェントと継続運用しやすくするため、次を守るのがおすすめです。

### 変更時に必ず更新するもの

- 新しい環境変数を追加したら `.env.example`
- 新しい定期処理を追加したら `bootstrap/app.php` とこのドキュメント
- 新しい webhook / 外部連携を追加したら、このドキュメントに必要な秘密情報と設定先を追記
- branch / release 運用を変えたら、このドキュメントを更新

### デプロイ前に AI が確認すべきこと

- どのブランチを staging / production に反映するか
- migration があるか
- `.env.example` の更新が必要か
- cron / queue / webhook の追加設定があるか
- build 成果物が必要か

## 12. すぐ決めるべきこと

次に決めると運用が安定します。

1. staging の実ドメイン
2. staging の送信元メールアドレス
3. staging のメール送信ポリシー
   - 実送信するか
   - allowlist にするか
   - log にするか
4. GTM を
   - 1 コンテナ + 環境分離
   - 2 コンテナ完全分離
   のどちらで運用するか
5. 本番 build をサーバ側でやるか、CI 成果物に寄せるか
