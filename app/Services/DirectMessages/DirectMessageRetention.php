<?php

namespace App\Services\DirectMessages;

use App\Models\DirectMessage;
use App\Models\Report;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class DirectMessageRetention
{
    public function erase(DirectMessage $message): void
    {
        DB::table('dm_deletions')->insertOrIgnore(['subject_type' => 'message', 'subject_public_id' => $message->public_id, 'deleted_at' => now()]);
        app(MessageImages::class)->remove($message->attachment_key);
        $message->update(['body_encrypted' => null, 'attachment_key' => null, 'attachment_mime' => null, 'attachment_size' => null, 'deleted_at' => now()]);
        DB::table('direct_message_deliveries')->where('message_id', $message->id)->where('status', 'pending')->update(['status' => 'suppressed']);
    }

    public function run(): int
    {
        $deleted = 0;
        DirectMessage::query()->whereNull('deleted_at')->with('thread.relationship.userAccount', 'thread.relationship.therapistAccount')->chunkById(100, function ($messages) use (&$deleted) {
            foreach ($messages as $message) {
                if ($message->isVisible()) {
                    continue;
                }
                // Evidence has its own private copy. Deleting the conversation must
                // never remove an open report's evidence or restore it to the user.
                DB::transaction(fn () => $this->erase(DirectMessage::whereKey($message->id)->lockForUpdate()->firstOrFail()));
                $deleted++;
            }
        });
        Report::query()->whereNotNull('direct_message_thread_id')->where('status', 'resolved')->whereNotNull('resolved_at')->chunkById(100, function ($reports) {
            foreach ($reports as $report) {
                DB::transaction(function () use ($report) {
                    $report = Report::whereKey($report->id)->lockForUpdate()->firstOrFail();
                    $expiry = $report->evidence_expires_at ?: $report->resolved_at->copy()->addYear();
                    if ($expiry->isFuture()) {
                        return;
                    }
                    DB::table('dm_deletions')->insertOrIgnore(['subject_type' => 'report', 'subject_public_id' => $report->public_id, 'deleted_at' => now()]);
                    if ($report->dm_evidence_attachment) {
                        app(MessageImages::class)->remove(Crypt::decryptString($report->dm_evidence_attachment));
                    }
                    $report->update(['dm_evidence_encrypted' => null, 'dm_evidence_attachment' => null]);
                });
            }
        });
        // Crash leftovers are unreferenced encrypted files only, never live attachments.
        $referenced = DirectMessage::whereNotNull('attachment_key')->get()->pluck('attachment_key')->all();
        foreach (Storage::disk('local')->files('direct-messages') as $path) {
            if (! in_array($path, $referenced, true) && Storage::disk('local')->lastModified($path) < now()->subDay()->timestamp) {
                app(MessageImages::class)->remove($path);
            }
        }
        $evidence = Report::whereNotNull('dm_evidence_attachment')->pluck('dm_evidence_attachment')->map(fn ($key) => Crypt::decryptString($key))->all();
        foreach (Storage::disk('local')->files('dm-evidence') as $path) {
            if (! in_array($path, $evidence, true) && Storage::disk('local')->lastModified($path) < now()->subDay()->timestamp) {
                app(MessageImages::class)->remove($path);
            }
        }

        return $deleted;
    }
}
