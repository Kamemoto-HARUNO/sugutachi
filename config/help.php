<?php

return [
    'faqs' => [
        [
            'id' => 'about-service',
            'category' => 'service',
            'question' => 'すぐタチはどんなサービスですか？',
            'answer' => 'すぐタチは、リラクゼーション / ボディケア / もみほぐしを受けたい人と、提供したい人をつなぐマッチングサービスです。医療行為や治療を目的としたサービスではありません。',
            'sort_order' => 10,
        ],
        [
            'id' => 'usage-eligibility',
            'category' => 'account',
            'question' => '利用条件はありますか？',
            'answer' => '18歳未満は利用できません。本人確認・年齢確認が必要な機能があり、利用規約やガイドラインへの同意が前提です。',
            'sort_order' => 20,
        ],
        [
            'id' => 'payment-method',
            'category' => 'payment',
            'question' => '支払い方法は何ですか？',
            'answer' => 'MVPではクレジットカード決済のみ対応します。現金払い、直接振込、アプリ外決済は取り扱いません。',
            'sort_order' => 30,
        ],
        [
            'id' => 'cancellation-policy',
            'category' => 'booking',
            'question' => 'キャンセル料はかかりますか？',
            'answer' => '予約の進行状況と開始予定時刻までの残り時間によって変わります。予約前や承諾前は無料、直前キャンセルや無断キャンセルは所定のキャンセル料対象になる場合があります。',
            'sort_order' => 40,
        ],
        [
            'id' => 'prohibited-acts',
            'category' => 'safety',
            'question' => '禁止されている行為はありますか？',
            'answer' => '外部連絡先の交換、直接取引への誘導、虚偽プロフィール、危険行為の要求、規約違反にあたるやり取りは禁止です。違反が確認された場合は利用制限や通報対応の対象になります。',
            'sort_order' => 50,
        ],
    ],
];
