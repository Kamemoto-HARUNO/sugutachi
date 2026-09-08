<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Api\Concerns\RecordsAdminAuditLogs;
use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Report;
use App\Services\DirectMessages\RelationshipPolicy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class AdminMessageOperationsController extends Controller
{
    use AuthorizesAdminRequests, RecordsAdminAuditLogs;

    public function index(Request $request)
    {
        $this->authorizeAdmin($request->user());
        $actions = DB::table('block_booking_actions')->join('bookings', 'bookings.id', '=', 'block_booking_actions.booking_id')
            ->whereIn('block_booking_actions.status', ['review', 'pending', 'processing'])->orderBy('block_booking_actions.id')->limit(100)
            ->get(['block_booking_actions.id', 'bookings.public_id as booking_id', 'bookings.status as booking_status', 'block_booking_actions.status', 'block_booking_actions.attempts', 'block_booking_actions.updated_at']);

        return response()->json(['data' => $actions, 'meta' => [
            'failed_notifications' => DB::table('direct_message_deliveries')->where('status', 'failed')->count() + DB::table('dm_system_deliveries')->where('status', 'failed')->count(),
            'evidence_reviews_due' => Report::whereNotNull('direct_message_thread_id')->where('status', 'open')->where('evidence_review_at', '<=', now())->count(),
        ]]);
    }

    public function resolve(Request $request, Booking $booking)
    {
        $this->authorizeAdmin($request->user());
        $v = $request->validate(['decision' => 'required|in:retry,refund,release', 'note' => 'required|string|min:5|max:2000']);
        DB::transaction(function () use ($request, $booking, $v) {
            app(RelationshipPolicy::class)->lock($booking->user_account_id, $booking->therapist_account_id);
            $booking = Booking::whereKey($booking->id)->lockForUpdate()->firstOrFail();
            $action = DB::table('block_booking_actions')->where('booking_id', $booking->id)->lockForUpdate()->first();
            abort_unless($action && $action->status === 'review', 409, '確認待ちの予約のみ操作できます。');
            $before = ['booking_status' => $booking->status, 'settlement_status' => $action->status];
            $preStartCancelled = in_array($booking->status, ['canceled', 'rejected', 'payment_canceled'], true);
            if ($v['decision'] === 'retry') {
                abort_unless($preStartCancelled, 422, '開始後の予約は精算方針を選んでください。');
            }
            if ($v['decision'] === 'release') {
                abort_if($preStartCancelled, 422, 'キャンセル済み予約の返金は解除できません。');
                DB::table('block_booking_actions')->where('id', $action->id)->update(['status' => 'resolved', 'completed_at' => now(), 'updated_at' => now()]);
            } else {
                if (! $preStartCancelled) {
                    $from = $booking->status;
                    $booking->update(['status' => 'canceled', 'canceled_at' => now(), 'canceled_by_account_id' => $request->user()->id, 'cancel_reason_code' => 'therapist_relationship_block']);
                    $booking->statusLogs()->create(['from_status' => $from, 'to_status' => 'canceled', 'actor_account_id' => $request->user()->id, 'actor_role' => 'admin', 'reason_code' => 'block_review_full_refund']);
                }
                DB::table('block_booking_actions')->where('id', $action->id)->update(['status' => 'pending', 'attempts' => 0, 'due_at' => now(), 'updated_at' => now()]);
            }
            $this->recordAdminAudit($request, 'block_booking.'.$v['decision'], $booking, $before, ['decision' => $v['decision'], 'note_encrypted' => Crypt::encryptString($v['note'])]);
        });

        return response()->json(['data' => ['ok' => true]]);
    }

    public function evidence(Request $request, Report $report)
    {
        $this->authorizeAdmin($request->user());
        abort_unless($report->direct_message_thread_id, 404);
        abort_if($report->evidence_expires_at?->isPast() || ($report->status === 'resolved' && ! $report->evidence_expires_at && $report->resolved_at?->copy()->addYear()->isPast()), 404);
        $this->recordAdminAudit($request, 'dm_evidence.view', $report, [], ['image' => $request->boolean('image')]);
        if ($request->boolean('image')) {
            abort_unless($report->dm_evidence_attachment, 404);
            $key = Crypt::decryptString($report->dm_evidence_attachment);

            return response(Crypt::decryptString(Storage::disk('local')->get($key)))->header('Content-Type', 'image/webp')->header('Cache-Control', 'private, no-store')->header('X-Content-Type-Options', 'nosniff');
        }

        return response()->json(['data' => ['body' => $report->dm_evidence_encrypted ? Crypt::decryptString($report->dm_evidence_encrypted) : null, 'has_image' => (bool) $report->dm_evidence_attachment]])->header('Cache-Control', 'private, no-store');
    }

    public function retainEvidence(Request $request, Report $report)
    {
        $this->authorizeAdmin($request->user());
        $v = $request->validate(['note' => 'required|string|min:5|max:2000']);
        abort_unless($report->direct_message_thread_id && ($report->dm_evidence_encrypted || $report->dm_evidence_attachment), 409);
        DB::transaction(function () use ($request, $report, $v) {
            $locked = Report::whereKey($report->id)->lockForUpdate()->firstOrFail();
            $locked->update(['evidence_review_at' => now()->addDays(90), 'evidence_expires_at' => $locked->status === 'resolved' ? now()->addYear() : null]);
            $locked->actions()->create(['admin_account_id' => $request->user()->id, 'action_type' => 'dm_evidence_retained', 'note_encrypted' => Crypt::encryptString($v['note']), 'created_at' => now()]);
            $this->recordAdminAudit($request, 'dm_evidence.retain', $locked, [], ['next_review_at' => $locked->evidence_review_at]);
        });

        return response()->json(['data' => ['ok' => true]]);
    }
}
