# 環境・リリース運用ガイド

このドキュメントは、`ローカル / 開発(staging) / 本番(main)` の運用、デプロイ手順、環境変数、GTM、メール、AIエージェント運用の前提をまとめたものです。

## 1. 環境の分け方

| 環境 | 用途 | Gitブランチ | 推奨ドメイン | 備考 |
| --- | --- | --- | --- | --- |
| local | 開発者の手元 | 任意 | `http://localhost:8000` など | 実メール・実課金・実計測は無効 |
| staging | 結合確認 / 人力テスト | `staging` | `https://dev.sugutachi.com` | 本番に近い構成で動作確認 |
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

- `MAIL_FROM_ADDRESS=noreply@sugutachi.com`
- `SERVICE_SUPPORT_EMAIL=support@sugutachi.com`

#### staging

- `MAIL_FROM_ADDRESS=noreply-dev@sugutachi.com`
- `SERVICE_SUPPORT_EMAIL=support@sugutachi.com`

### 運用注意

- 今回の方針では staging でも実メール送信を行う
- ただし、事故防止のため staging の件名や本文のどこかに `【開発環境】` を付けるのがおすすめ
- staging で実送信する場合は、`MAIL_FROM_ADDRESS` と `APP_URL` が本番と混ざらないよう必ず分離する

### 役割ごとの推奨用途

- `noreply@sugutachi.com`: 本番のシステム送信元
- `noreply-dev@sugutachi.com`: staging のシステム送信元
- `support@sugutachi.com`: ユーザー向けサポート窓口
- `contact@sugutachi.com`: 法人・運営への問い合わせ窓口
- `info@sugutachi.com`: 一般案内や会社情報向け窓口

## 5. Googleタグマネージャー

## 方針

- local: 無効
- staging: staging 用の GTM 環境で有効
- production: 本番の Live 環境で有効

### 今回の実装

`resources/views/app.blade.php` に、環境変数で切り替えられる GTM スニペットを追加済みです。

### 運用方針

- `1コンテナ + GTM Environment分離` で運用する
- `production` は Live 環境
- `staging` は `dev.sugutachi.com` 用の Environment を使う
- local では GTM を無効にする

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
- `staging -> main` の PR 単位で成果物を自動生成しやすい
- 手元で build 済み資産を人力で持ち運ぶ必要が減る

### 現時点の推奨結論

- まずは `staging / main` 運用を固める
- デプロイは当面手動でもよい
- ただし build は将来的に GitHub Actions へ寄せる前提で設計する
- AI エージェントとの相性を考えると、`サーバで build しない` 方向が最終的には一番安定する

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

このアプリは Laravel scheduler を前提にしています。最低限、本番と staging の両方で cron 設定が必要です。Xserver 共有環境では、サーバーパネルの cron 設定から登録するか、SSH で作業パスを確認したうえで登録します。

```cron
* * * * * php /path/to/artisan schedule:run >> /dev/null 2>&1
```

今回の確認では、Xserver 共有環境で Laravel 用に使う CLI は `/usr/bin/php8.3` を前提にするのが安全です。また、推奨配置先は次のとおりです。

- 本番アプリ: `/home/hnice2204/sugutachi.com/app-production`
- 開発アプリ: `/home/hnice2204/sugutachi.com/app-staging`
- 共通ログ置き場: `/home/hnice2204/sugutachi.com/shared/logs`

cron は次の形を基準にします。

```cron
* * * * * /usr/bin/php8.3 /home/hnice2204/sugutachi.com/app-production/artisan schedule:run >> /home/hnice2204/sugutachi.com/app-production/storage/logs/schedule.log 2>&1
* * * * * /usr/bin/php8.3 /home/hnice2204/sugutachi.com/app-staging/artisan schedule:run >> /home/hnice2204/sugutachi.com/app-staging/storage/logs/schedule.log 2>&1
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

## 11. 秘密情報の管理方針

### 結論

- `.env` は各サーバー上にだけ置き、Git には絶対に含めない
- 正本は `1Password / Bitwarden / LastPass Enterprise` などの共有パスワードマネージャで管理する
- CI を使う場合は `GitHub Actions Environments` の secrets に staging / production を分けて保存する

### 保存場所のおすすめ

#### ローカル

- 各開発者の `.env`
- 共有はしない

#### staging / production

- サーバー上の `.env`
- 共有ホスティングのコントロールパネルや秘密メモにベタ書きしない

#### チーム共有の正本

- `1Password` などの Vault
- 推奨項目:
  - アプリURL
  - DB接続情報
  - Stripe鍵
  - Stripe webhook secret
  - VAPID鍵
  - SMTP接続情報
  - GTM container/environment 情報

### 運用ルール

- staging と production で秘密情報は分離する
- `.env.example` にはダミー値だけ置く
- 鍵を更新したら、このドキュメントのチェックリストにも反映する
- 担当者退職や権限変更時に、Stripe / SMTP / VAPID を必要に応じてローテーションする

## 12. AIエージェント向け運用ルール

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

## 13. 確定済み事項

- staging ドメインは `https://dev.sugutachi.com`
- staging でも実メール送信を行う
- GTM は `1コンテナ + Environment分離`
- cron は Xserver 側で本番 / staging の両方に設定する
- build 方針は、将来的に `CI build` へ寄せる

## 14. 次に決める / 確認すること

次に決めると運用が安定します。

1. staging の送信元メールアドレスを最終確定する
2. cron を本番 / staging に設定する
3. GitHub Actions を使うかどうか決める
4. GTM の staging Environment 名と ID を控える
5. サーバー上へ本番 / staging アプリ本体をどう配置するか決める
