<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TherapistLedgerEntryResource;
use App\Models\TherapistLedgerEntry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TherapistLedgerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $account = $request->user();
        abort_unless($account->therapistProfile()->exists(), 404);

        $entries = $account->ledgerEntries()
            ->with(['booking', 'payoutRequest'])
            ->latest()
            ->get();

        return response()->json([
            'data' => [
                'summary' => [
                    'pending_amount' => $entries
                        ->where('status', TherapistLedgerEntry::STATUS_PENDING)
                        ->sum('amount_signed'),
                    'available_amount' => $entries
                        ->where('status', TherapistLedgerEntry::STATUS_AVAILABLE)
                        ->whereNull('payout_request_id')
                        ->sum('amount_signed'),
                    'payout_requested_amount' => $entries
                        ->where('status', TherapistLedgerEntry::STATUS_PAYOUT_REQUESTED)
                        ->sum('amount_signed'),
                    'paid_amount' => $entries
                        ->where('status', TherapistLedgerEntry::STATUS_PAID)
                        ->sum('amount_signed'),
                    'held_amount' => $entries
                        ->where('status', TherapistLedgerEntry::STATUS_HELD)
                        ->sum('amount_signed'),
                ],
                'entries' => TherapistLedgerEntryResource::collection($entries)->resolve($request),
            ],
        ]);
    }
}
