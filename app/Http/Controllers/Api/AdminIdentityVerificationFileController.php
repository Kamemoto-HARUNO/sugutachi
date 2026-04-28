<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Controller;
use App\Models\IdentityVerification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AdminIdentityVerificationFileController extends Controller
{
    use AuthorizesAdminRequests;

    public function showDocument(Request $request, IdentityVerification $identityVerification): StreamedResponse
    {
        $this->authorizeViewer($request);

        return $this->responseFor(
            encryptedPath: $identityVerification->document_storage_key_encrypted,
            cacheControl: 'private, max-age=300',
        );
    }

    public function showSelfie(Request $request, IdentityVerification $identityVerification): StreamedResponse
    {
        $this->authorizeViewer($request);

        return $this->responseFor(
            encryptedPath: $identityVerification->selfie_storage_key_encrypted,
            cacheControl: 'private, max-age=300',
        );
    }

    private function authorizeViewer(Request $request): void
    {
        if ($request->hasValidSignature()) {
            return;
        }

        $this->authorizeAdmin($request->user());
    }

    private function responseFor(?string $encryptedPath, string $cacheControl): StreamedResponse
    {
        abort_unless(filled($encryptedPath), 404);

        $path = Crypt::decryptString($encryptedPath);

        abort_unless(Storage::disk('local')->exists($path), 404);

        return Storage::disk('local')->response($path, headers: [
            'Cache-Control' => $cacheControl,
        ]);
    }
}
