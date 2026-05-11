<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesAdminRequests;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class AdminBlogImageController extends Controller
{
    use AuthorizesAdminRequests;

    public function store(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request->user());

        $validated = $request->validate([
            'image' => ['required', 'file', 'mimes:jpg,jpeg,png,webp', 'max:10240'],
        ]);

        $image = $validated['image'];
        $extension = strtolower($image->getClientOriginalExtension() ?: $image->extension() ?: 'jpg');
        $path = $image->storeAs('blog/body-images/'.now()->format('Y/m'), Str::ulid().'.'.$extension, 'public');

        return response()->json([
            'data' => [
                'url' => route('blog-images.show', ['image' => $this->encodePath($path)], false),
                'path' => $path,
                'original_name' => $image->getClientOriginalName(),
            ],
        ], 201);
    }

    public function show(string $image)
    {
        $path = $this->decodePath($image);

        abort_unless($path && str_starts_with($path, 'blog/body-images/'), 404);
        abort_unless(Storage::disk('public')->exists($path), 404);

        return Storage::disk('public')->response($path);
    }

    private function encodePath(string $path): string
    {
        return rtrim(strtr(base64_encode($path), '+/', '-_'), '=');
    }

    private function decodePath(string $value): ?string
    {
        $decoded = base64_decode(strtr($value, '-_', '+/'), true);

        return is_string($decoded) ? $decoded : null;
    }
}
