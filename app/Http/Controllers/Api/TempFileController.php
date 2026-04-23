<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TempFileResource;
use App\Models\TempFile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class TempFileController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'purpose' => ['required', Rule::in(['identity_document', 'selfie', 'profile_photo'])],
            'file' => ['required', 'file', 'max:10240', 'mimes:jpg,jpeg,png,webp,pdf'],
        ]);

        $account = $request->user();
        $uploadedFile = $validated['file'];
        $path = $uploadedFile->store('temp-files/'.$account->public_id, 'local');

        $tempFile = TempFile::create([
            'file_id' => 'tmp_'.Str::ulid(),
            'account_id' => $account->id,
            'purpose' => $validated['purpose'],
            'storage_key_encrypted' => Crypt::encryptString($path),
            'original_name' => $uploadedFile->getClientOriginalName(),
            'mime_type' => $uploadedFile->getClientMimeType(),
            'size_bytes' => $uploadedFile->getSize(),
            'status' => 'uploaded',
            'expires_at' => now()->addHours(24),
        ]);

        return (new TempFileResource($tempFile))
            ->response()
            ->setStatusCode(201);
    }

    public function destroy(Request $request, TempFile $tempFile): JsonResponse
    {
        abort_unless($tempFile->account_id === $request->user()->id, 404);

        if ($tempFile->status === 'uploaded') {
            Storage::disk('local')->delete(Crypt::decryptString($tempFile->storage_key_encrypted));
        }

        $tempFile->update([
            'status' => 'deleted',
        ]);

        return response()->json(null, 204);
    }
}
