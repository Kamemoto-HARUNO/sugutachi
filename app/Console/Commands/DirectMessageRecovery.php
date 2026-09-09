<?php

namespace App\Console\Commands;

use App\Models\Account;
use App\Models\DirectMessage;
use App\Models\Report;
use App\Models\RoleRelationship;
use App\Services\DirectMessages\DirectMessageRetention;
use App\Services\DirectMessages\MessageImages;
use App\Services\DirectMessages\RelationshipPolicy;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

class DirectMessageRecovery extends Command
{
    protected $signature = 'direct-messages:recovery {mode : export or apply} {path : Absolute private journal path}';

    protected $description = 'Export encrypted privacy state or apply its latest copy before reopening a restored database';

    public function handle(): int
    {
        $path = (string) $this->argument('path');
        if (! str_starts_with($path, '/') || str_starts_with($path, public_path().'/')) {
            throw new \RuntimeException('Use an absolute non-public file path.');
        }
        if ($this->argument('mode') === 'export') {
            $state = ['version' => 1, 'exported_at' => now()->toIso8601String(),
                'deletions' => DB::table('dm_deletions')->get()->map(fn ($r) => (array) $r)->all(),
                'relationships' => RoleRelationship::with(['userAccount', 'therapistAccount'])->get()->map(fn ($r) => ['public_id' => $r->public_id, 'user' => $r->userAccount?->public_id, 'therapist' => $r->therapistAccount?->public_id, 'user_blocked_at' => $r->user_blocked_at, 'therapist_blocked_at' => $r->therapist_blocked_at])->all(),
                'withdrawals' => Account::withTrashed()->whereNotNull('withdrawn_at')->get(['public_id', 'withdrawn_at'])->toArray(),
                'reports' => Report::whereNotNull('direct_message_thread_id')->get(['public_id', 'status', 'resolved_at', 'evidence_review_at', 'evidence_expires_at'])->toArray(),
            ];
            $tmp = $path.'.tmp';
            if (file_put_contents($tmp, Crypt::encryptString(json_encode($state, JSON_THROW_ON_ERROR)), LOCK_EX) === false) {
                throw new \RuntimeException('Could not save privacy journal.');
            }
            chmod($tmp, 0600);
            if (! rename($tmp, $path)) {
                throw new \RuntimeException('Could not replace privacy journal.');
            }
            $this->info('Encrypted privacy journal exported. Store separately from application/database backup generations.');

            return self::SUCCESS;
        }
        if ($this->argument('mode') !== 'apply') {
            throw new \RuntimeException('Mode must be export or apply.');
        }
        if (! app()->isDownForMaintenance()) {
            throw new \RuntimeException('Enable maintenance mode and pause workers before restoring privacy state.');
        }
        $state = json_decode(Crypt::decryptString(file_get_contents($path)), true, 512, JSON_THROW_ON_ERROR);
        if (($state['version'] ?? null) !== 1) {
            throw new \RuntimeException('Unsupported journal version.');
        }
        DB::transaction(function () use ($state) {
            foreach ($state['relationships'] as $row) {
                $user = Account::withTrashed()->where('public_id', $row['user'])->first();
                $cast = Account::withTrashed()->where('public_id', $row['therapist'])->first();
                if (! $user || ! $cast) {
                    continue;
                }
                app(RelationshipPolicy::class)->lock($user->id, $cast->id)->update(['user_blocked_at' => $row['user_blocked_at'], 'therapist_blocked_at' => $row['therapist_blocked_at']]);
            }
            foreach ($state['withdrawals'] as $row) {
                $account = Account::withTrashed()->where('public_id', $row['public_id'])->first();
                if (! $account) {
                    continue;
                }
                $account->forceFill(['status' => 'withdrawn', 'withdrawn_at' => $row['withdrawn_at']])->save();
                $account->tokens()->delete();
                $account->pushSubscriptions()->delete();
            }
            foreach ($state['reports'] as $row) {
                Report::where('public_id', $row['public_id'])->update(collect($row)->except('public_id')->all());
            }
            foreach ($state['deletions'] as $row) {
                DB::table('dm_deletions')->insertOrIgnore(collect($row)->except('id')->all());
                if ($row['subject_type'] === 'message') {
                    $message = DirectMessage::where('public_id', $row['subject_public_id'])->first();
                    if ($message) {
                        app(DirectMessageRetention::class)->erase($message);
                    }
                } elseif ($row['subject_type'] === 'report') {
                    $report = Report::where('public_id', $row['subject_public_id'])->first();
                    if (! $report) {
                        continue;
                    }
                    if ($report->dm_evidence_attachment) {
                        app(MessageImages::class)->remove(Crypt::decryptString($report->dm_evidence_attachment));
                    }
                    $report->update(['dm_evidence_encrypted' => null, 'dm_evidence_attachment' => null]);
                }
            }
            // Restores must never replay stale personal notifications.
            DB::table('direct_message_deliveries')->where('status', 'pending')->update(['status' => 'suppressed']);
        });
        app(DirectMessageRetention::class)->run();
        $this->info('Privacy state applied. Reconcile booking/payment state and verify before ending maintenance mode.');

        return self::SUCCESS;
    }
}
