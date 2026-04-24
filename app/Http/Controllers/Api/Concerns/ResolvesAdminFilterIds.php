<?php

namespace App\Http\Controllers\Api\Concerns;

use App\Models\Account;
use App\Models\Booking;
use App\Models\TherapistProfile;

trait ResolvesAdminFilterIds
{
    protected function resolveAccountId(?string $publicId): ?int
    {
        if (! filled($publicId)) {
            return null;
        }

        $id = Account::query()
            ->where('public_id', $publicId)
            ->value('id');

        abort_unless($id, 404);

        return (int) $id;
    }

    protected function resolveBookingId(?string $publicId): ?int
    {
        if (! filled($publicId)) {
            return null;
        }

        $id = Booking::query()
            ->where('public_id', $publicId)
            ->value('id');

        abort_unless($id, 404);

        return (int) $id;
    }

    protected function resolveTherapistProfileId(?string $publicId): ?int
    {
        if (! filled($publicId)) {
            return null;
        }

        $id = TherapistProfile::query()
            ->where('public_id', $publicId)
            ->value('id');

        abort_unless($id, 404);

        return (int) $id;
    }
}
