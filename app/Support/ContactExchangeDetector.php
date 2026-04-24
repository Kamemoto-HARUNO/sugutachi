<?php

namespace App\Support;

class ContactExchangeDetector
{
    public function detects(string $body): bool
    {
        return preg_match('/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i', $body) === 1
            || preg_match('/(?:\+?\d[\d\s\-().]{8,}\d)/', $body) === 1
            || preg_match('/\b(?:line|kakao|wechat|telegram|instagram|twitter|x)\s*[:：@]/i', $body) === 1
            || preg_match('/(?:paypay|paypal|venmo|cash\s*app|銀行振込|口座)/iu', $body) === 1;
    }
}
