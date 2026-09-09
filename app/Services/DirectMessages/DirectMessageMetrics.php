<?php

namespace App\Services\DirectMessages;

use App\Models\Booking;
use App\Models\DirectMessageThread;

class DirectMessageMetrics
{
    public function summarize(): array
    {
        $result = [];
        $empty = ['consultations' => 0, 'reply_observed_24h' => 0, 'replied_within_24h' => 0, 'booking_observed_7d' => 0, 'booked_within_7d' => 0, 'completion_observed_30d' => 0, 'completed_within_30d' => 0, 'free_bookings' => 0, 'paid_bookings' => 0];
        foreach (['normal', 'test', 'admin'] as $group) {
            $result[$group] = $empty;
        }
        DirectMessageThread::with('relationship.userAccount.roleAssignments', 'relationship.therapistAccount.roleAssignments')->chunkById(100, function ($threads) use (&$result) {
            foreach ($threads as $thread) {
                $r = $thread->relationship;
                $accounts = collect([$r->userAccount, $r->therapistAccount])->filter();
                $test = $accounts->contains(fn ($a) => in_array($a->public_id, config('direct_messages.test_account_public_ids'), true));
                $admin = $accounts->contains(fn ($a) => $a->roleAssignments->contains('role', 'admin'));
                $key = $test ? 'test' : ($admin ? 'admin' : 'normal');
                $row = &$result[$key];
                $row['consultations']++;
                $created = $thread->created_at;
                if ($created->copy()->addDay()->isPast()) {
                    $row['reply_observed_24h']++;
                    if ($thread->first_reply_at && $thread->first_reply_at->lte($created->copy()->addDay())) {
                        $row['replied_within_24h']++;
                    }
                }
                $bookings = Booking::where('user_account_id', $r->user_account_id)->where('therapist_account_id', $r->therapist_account_id)->where('created_at', '>=', $created)->where('created_at', '<=', $created->copy()->addDays(30))->get();
                if ($created->copy()->addDays(7)->isPast()) {
                    $row['booking_observed_7d']++;
                    $first = $bookings->filter(fn ($b) => ($b->accepted_at ?? $b->created_at)->lte($created->copy()->addDays(7)) && ($b->accepted_at || in_array($b->status, ['accepted', 'moving', 'arrived', 'in_progress', 'therapist_completed', 'completed'], true)))->sortBy('created_at')->first();
                    if ($first) {
                        $row['booked_within_7d']++;
                        $row[$first->isFreeBooking() ? 'free_bookings' : 'paid_bookings']++;
                    }
                }
                if ($created->copy()->addDays(30)->isPast()) {
                    $row['completion_observed_30d']++;
                    if ($bookings->contains(fn ($b) => $b->status === 'completed' && $b->completed_at && $b->completed_at->lte($created->copy()->addDays(30)))) {
                        $row['completed_within_30d']++;
                    }
                }
            }
        });
        foreach ($result as &$row) {
            foreach (['reply' => '24h', 'booking' => '7d', 'completion' => '30d'] as $metric => $window) {
                $numerator = match ($metric) {
                    'reply' => 'replied_within_24h','booking' => 'booked_within_7d',default => 'completed_within_30d'
                };
                $denominator = $row[$metric.'_observed_'.$window];
                $row[$metric.'_rate'] = $denominator ? round($row[$numerator] / $denominator, 4) : null;
            }
        }

        return ['as_of' => now()->toIso8601String(), 'groups' => $result];
    }
}
