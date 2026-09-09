<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\RoleRelationship;
use App\Services\DirectMessages\BlockBookingService;
use App\Services\DirectMessages\ParticipantPresenter;
use App\Services\DirectMessages\RelationshipPolicy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RoleRelationshipController extends Controller
{
    public function __construct(private RelationshipPolicy $policy, private BlockBookingService $bookings) {}

    private function authorize(Request $request, string $role, RoleRelationship $relationship): void
    {
        $this->policy->authorizeRole($request->user(), $role);
        abort_unless($relationship->accountId($role) === $request->user()->id, 404);
    }

    public function index(Request $request, string $role)
    {
        $this->policy->authorizeRole($request->user(), $role);
        $rows = RoleRelationship::where($role.'_account_id', $request->user()->id)->whereNotNull($role.'_blocked_at')->orderByDesc('id')->paginate(30);
        $other = $role === 'user' ? 'therapist' : 'user';

        return response()->json(['data' => collect($rows->items())->map(fn ($r) => [
            'public_id' => $r->public_id,
            'counterparty' => app(ParticipantPresenter::class)->present($r->{$other === 'user' ? 'userAccount' : 'therapistAccount'}, $other),
        ]), 'meta' => ['next_page' => $rows->hasMorePages() ? $rows->currentPage() + 1 : null]]);
    }

    public function forBooking(Request $request, string $role, Booking $booking)
    {
        $this->policy->authorizeRole($request->user(), $role);
        abort_unless($booking->getAttribute($role.'_account_id') === $request->user()->id, 404);
        $relationship = DB::transaction(fn () => $this->policy->lock($booking->user_account_id, $booking->therapist_account_id));

        return $this->preview($request, $role, $relationship);
    }

    public function preview(Request $request, string $role, RoleRelationship $relationship)
    {
        $this->authorize($request, $role, $relationship);
        $affected = $role === 'therapist' ? $this->bookings->affected($relationship)->get() : collect();

        return response()->json(['data' => ['public_id' => $relationship->public_id, 'blocked_by_me' => (bool) $relationship->getAttribute($role.'_blocked_at'), 'contact_unavailable' => $this->policy->blocked($relationship->user_account_id, $relationship->therapist_account_id), 'affected_bookings' => $affected->map(fn ($b) => ['public_id' => $b->public_id, 'status' => $b->status, 'scheduled_start_at' => $b->scheduled_start_at, 'paid_amount_estimate' => $b->total_amount, 'requires_review' => $this->bookings->requiresReview($b)])]]);
    }

    public function block(Request $request, string $role, RoleRelationship $relationship)
    {
        $this->authorize($request, $role, $relationship);
        $request->validate(['confirm' => 'required|accepted']);
        DB::transaction(function () use ($role, $relationship) {
            $locked = $this->policy->lock($relationship->user_account_id, $relationship->therapist_account_id);
            if ($locked->getAttribute($role.'_blocked_at')) {
                return;
            }
            $locked->update([$role.'_blocked_at' => now()]);
            DB::table('direct_message_deliveries')->whereIn('thread_id', DB::table('direct_message_threads')->where('relationship_id', $locked->id)->select('id'))->where('status', 'pending')->update(['status' => 'suppressed', 'updated_at' => now()]);
            if ($role === 'therapist') {
                $this->bookings->cancelBeforeStart($locked);
            }
        });

        return $this->preview($request, $role, $relationship->refresh());
    }

    public function unblock(Request $request, string $role, RoleRelationship $relationship)
    {
        $this->authorize($request, $role, $relationship);
        DB::transaction(function () use ($role, $relationship) {
            $this->policy->lock($relationship->user_account_id, $relationship->therapist_account_id)->update([$role.'_blocked_at' => null]);
        });

        return $this->preview($request, $role, $relationship->refresh());
    }
}
