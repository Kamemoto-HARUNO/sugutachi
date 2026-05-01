<?php

namespace App\Services\ProfilePhotos;

use App\Models\ProfilePhoto;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

class PrivatePhotoWatermarkRenderer
{
    /**
     * @return array{binary:string,mime_type:string}
     */
    public function render(ProfilePhoto $photo, string $watermarkLabel): array
    {
        $path = Crypt::decryptString($photo->storage_key_encrypted);
        $binary = Storage::disk('local')->get($path);
        $image = imagecreatefromstring($binary);

        if (! $image) {
            throw new RuntimeException('Failed to render the private profile photo.');
        }

        $imageInfo = getimagesizefromstring($binary);

        if (! is_array($imageInfo) || ! isset($imageInfo[0], $imageInfo[1], $imageInfo['mime'])) {
            imagedestroy($image);

            throw new RuntimeException('The private profile photo format is unsupported.');
        }

        [$width, $height] = [$imageInfo[0], $imageInfo[1]];
        $mimeType = $imageInfo['mime'];

        imagealphablending($image, true);
        imagesavealpha($image, true);

        $shadowColor = imagecolorallocatealpha($image, 15, 23, 42, 88);
        $textColor = imagecolorallocatealpha($image, 255, 255, 255, 78);
        $font = 5;
        $label = $watermarkLabel;
        $labelWidth = imagefontwidth($font) * strlen($label);
        $stepX = max($labelWidth + 80, (int) floor($width / 2));
        $stepY = max(90, (int) floor($height / 4));

        for ($row = -1, $y = 24; $y <= $height + 48; $row++, $y += $stepY) {
            $offsetX = $row % 2 === 0 ? -40 : (int) floor($stepX / 2) * -1;

            for ($x = $offsetX; $x <= $width + $labelWidth; $x += $stepX) {
                imagestring($image, $font, $x + 2, $y + 2, $label, $shadowColor);
                imagestring($image, $font, $x, $y, $label, $textColor);
            }
        }

        ob_start();

        $written = match ($mimeType) {
            'image/png' => imagepng($image),
            'image/webp' => imagewebp($image, quality: 90),
            default => imagejpeg($image, quality: 88),
        };

        $renderedBinary = (string) ob_get_clean();
        imagedestroy($image);

        if (! $written) {
            throw new RuntimeException('Failed to output the private profile photo.');
        }

        return [
            'binary' => $renderedBinary,
            'mime_type' => in_array($mimeType, ['image/png', 'image/webp'], true)
                ? $mimeType
                : 'image/jpeg',
        ];
    }
}
