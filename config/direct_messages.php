<?php

return [
    'test_account_public_ids' => array_values(array_filter(explode(',', (string) env('DIRECT_MESSAGES_TEST_ACCOUNT_IDS', '')))),
    'enabled' => (bool) env('DIRECT_MESSAGES_ENABLED', false),
    'sending_enabled' => (bool) env('DIRECT_MESSAGES_SENDING_ENABLED', true),
    'delivery_enabled' => (bool) env('DIRECT_MESSAGES_DELIVERY_ENABLED', true),
    'new_contacts_per_day' => 5,
    'before_reply_limit' => 3,
    'messages_per_minute' => 20,
    'retention_days' => 365,
    'withdrawal_retention_days' => 90,
];
