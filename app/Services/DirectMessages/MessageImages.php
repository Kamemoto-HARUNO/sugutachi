<?php

namespace App\Services\DirectMessages;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class MessageImages
{
    public function store(UploadedFile $file): array
    {
        $bytes = file_get_contents($file->getRealPath());
        $info = @getimagesizefromstring($bytes);
        if (! $info || ! in_array($info['mime'], ['image/jpeg', 'image/png', 'image/webp'], true) || $info[0] * $info[1] > 20000000) {
            throw ValidationException::withMessages(['image' => 'JPEG・PNG・WebP形式の画像（2,000万画素以下）を選択してください。']);
        }
        $image = @imagecreatefromstring($bytes);
        if (! $image) {
            throw ValidationException::withMessages(['image' => '画像を読み込めませんでした。']);
        }
        try {
            if ($info['mime'] === 'image/jpeg' && function_exists('exif_read_data')) {
                $orientation = (@exif_read_data($file->getRealPath()))['Orientation'] ?? 1;
                if (in_array($orientation, [2, 4, 5, 7], true)) {
                    imageflip($image, IMG_FLIP_HORIZONTAL);
                }
                $angle = match ($orientation) {
                    3, 4 => 180, 5, 6 => -90, 7, 8 => 90, default => 0
                };
                if ($angle) {
                    $rotated = imagerotate($image, $angle, 0);
                    imagedestroy($image);
                    $image = $rotated;
                }
            }
            if (! imageistruecolor($image)) {
                imagepalettetotruecolor($image);
            }
            imagesavealpha($image, true);
            ob_start();
            $written = imagewebp($image, null, 85);
            $encoded = ob_get_clean();
            if (! $written || ! $encoded) {
                throw new \RuntimeException('Could not encode image.');
            }
        } finally {
            imagedestroy($image);
        }
        $key = 'direct-messages/'.Str::uuid().'.enc';
        if (! Storage::disk('local')->put($key, Crypt::encryptString($encoded))) {
            throw new \RuntimeException('Could not save attachment.');
        }

        return ['attachment_key' => $key, 'attachment_mime' => 'image/webp', 'attachment_size' => strlen($encoded)];
    }

    public function remove(?string $key): void
    {
        if ($key && ! Storage::disk('local')->delete($key)) {
            throw new \RuntimeException('Could not remove attachment.');
        }
    }
}
