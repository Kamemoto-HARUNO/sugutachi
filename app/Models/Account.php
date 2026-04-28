<?php

namespace App\Models;

use App\Models\Concerns\UsesPublicIdRouteKey;
use App\Notifications\AccountPasswordResetNotification;
use Database\Factories\AccountFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable([
    'public_id',
    'email',
    'phone_e164',
    'password',
    'display_name',
    'status',
    'last_active_role',
    'registered_ip_hash',
    'travel_request_warning_count',
    'travel_request_last_warned_at',
    'travel_request_last_warning_reason',
    'travel_request_restricted_until',
    'travel_request_restriction_reason',
])]
#[Hidden(['password', 'remember_token'])]
class Account extends Authenticatable
{
    /** @use HasFactory<AccountFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    use SoftDeletes;
    use UsesPublicIdRouteKey;

    public const STATUS_ACTIVE = 'active';

    public const STATUS_SUSPENDED = 'suspended';

    public function roleAssignments(): HasMany
    {
        return $this->hasMany(AccountRole::class);
    }

    public function legalAcceptances(): HasMany
    {
        return $this->hasMany(LegalAcceptance::class);
    }

    public function identityVerifications(): HasMany
    {
        return $this->hasMany(IdentityVerification::class);
    }

    public function latestIdentityVerification(): HasOne
    {
        return $this->hasOne(IdentityVerification::class)->latestOfMany();
    }

    public function userProfile(): HasOne
    {
        return $this->hasOne(UserProfile::class);
    }

    public function therapistProfile(): HasOne
    {
        return $this->hasOne(TherapistProfile::class);
    }

    public function profilePhotos(): HasMany
    {
        return $this->hasMany(ProfilePhoto::class);
    }

    public function tempFiles(): HasMany
    {
        return $this->hasMany(TempFile::class);
    }

    public function serviceAddresses(): HasMany
    {
        return $this->hasMany(ServiceAddress::class);
    }

    public function locationSearchLogs(): HasMany
    {
        return $this->hasMany(LocationSearchLog::class);
    }

    public function userBookings(): HasMany
    {
        return $this->hasMany(Booking::class, 'user_account_id');
    }

    public function therapistBookings(): HasMany
    {
        return $this->hasMany(Booking::class, 'therapist_account_id');
    }

    public function canceledBookings(): HasMany
    {
        return $this->hasMany(Booking::class, 'canceled_by_account_id');
    }

    public function bookingConsents(): HasMany
    {
        return $this->hasMany(BookingConsent::class);
    }

    public function bookingHealthChecks(): HasMany
    {
        return $this->hasMany(BookingHealthCheck::class);
    }

    public function sentBookingMessages(): HasMany
    {
        return $this->hasMany(BookingMessage::class, 'sender_account_id');
    }

    public function sentTravelRequests(): HasMany
    {
        return $this->hasMany(TherapistTravelRequest::class, 'user_account_id');
    }

    public function receivedTravelRequests(): HasMany
    {
        return $this->hasMany(TherapistTravelRequest::class, 'therapist_account_id');
    }

    public function pushSubscriptions(): HasMany
    {
        return $this->hasMany(PushSubscription::class);
    }

    public function appNotifications(): HasMany
    {
        return $this->hasMany(AppNotification::class);
    }

    public function stripeConnectedAccount(): HasOne
    {
        return $this->hasOne(StripeConnectedAccount::class);
    }

    public function stripeCustomer(): HasOne
    {
        return $this->hasOne(StripeCustomer::class);
    }

    public function paymentIntents(): HasMany
    {
        return $this->hasMany(PaymentIntent::class, 'payer_account_id');
    }

    public function refundsRequested(): HasMany
    {
        return $this->hasMany(Refund::class, 'requested_by_account_id');
    }

    public function refundsReviewed(): HasMany
    {
        return $this->hasMany(Refund::class, 'reviewed_by_account_id');
    }

    public function payoutRequests(): HasMany
    {
        return $this->hasMany(PayoutRequest::class, 'therapist_account_id');
    }

    public function payoutRequestsReviewed(): HasMany
    {
        return $this->hasMany(PayoutRequest::class, 'reviewed_by_account_id');
    }

    public function platformFeeSettings(): HasMany
    {
        return $this->hasMany(PlatformFeeSetting::class, 'created_by_account_id');
    }

    public function ledgerEntries(): HasMany
    {
        return $this->hasMany(TherapistLedgerEntry::class, 'therapist_account_id');
    }

    public function reviewsWritten(): HasMany
    {
        return $this->hasMany(Review::class, 'reviewer_account_id');
    }

    public function reviewsReceived(): HasMany
    {
        return $this->hasMany(Review::class, 'reviewee_account_id');
    }

    public function reportsFiled(): HasMany
    {
        return $this->hasMany(Report::class, 'reporter_account_id');
    }

    public function reportsTargeting(): HasMany
    {
        return $this->hasMany(Report::class, 'target_account_id');
    }

    public function assignedReports(): HasMany
    {
        return $this->hasMany(Report::class, 'assigned_admin_account_id');
    }

    public function blockedAccounts(): HasMany
    {
        return $this->hasMany(AccountBlock::class, 'blocker_account_id');
    }

    public function blockedByAccounts(): HasMany
    {
        return $this->hasMany(AccountBlock::class, 'blocked_account_id');
    }

    public function adminAuditLogs(): HasMany
    {
        return $this->hasMany(AdminAuditLog::class, 'actor_account_id');
    }

    public function adminNotes(): HasMany
    {
        return $this->hasMany(AdminNote::class, 'author_account_id');
    }

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'phone_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'suspended_at' => 'datetime',
            'travel_request_last_warned_at' => 'datetime',
            'travel_request_restricted_until' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function hasActiveTravelRequestRestriction(): bool
    {
        return $this->travel_request_restricted_until?->isFuture() ?? false;
    }

    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new AccountPasswordResetNotification($token));
    }
}
