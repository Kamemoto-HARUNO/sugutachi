<?php

namespace App\Http\Middleware;

use App\Models\Booking;
use App\Models\BookingQuote;
use App\Models\TherapistProfile;
use App\Services\DirectMessages\RelationshipPolicy;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RelationshipWriteGuard
{
    public function handle(Request $request, Closure $next)
    {
        $booking = $request->route('booking');
        if ($booking instanceof Booking) {
            abort_unless(in_array($request->user()->id, [$booking->user_account_id, $booking->therapist_account_id], true), 404);
            $userId = $booking->user_account_id;
            $therapistId = $booking->therapist_account_id;
        } else {
            $profile = $request->route('therapistProfile');
            if (! $profile instanceof TherapistProfile && $request->input('quote_id')) {
                $profile = BookingQuote::query()->where('public_id', $request->string('quote_id')->toString())->first()?->therapistProfile;
            }
            if (! $profile instanceof TherapistProfile && $request->input('therapist_profile_id')) {
                $profile = TherapistProfile::query()->where('public_id', $request->string('therapist_profile_id')->toString())->first();
            }
            if (! $profile) {
                return $next($request);
            }
            $userId = $request->user()->id;
            $therapistId = $profile->account_id;
        }

        return DB::transaction(function () use ($request, $next, $userId, $therapistId) {
            $policy = app(RelationshipPolicy::class);
            $policy->lock($userId, $therapistId);
            $policy->assertAllowed($userId, $therapistId);

            return $next($request);
        });
    }
}
