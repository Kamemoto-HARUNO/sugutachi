<?php

namespace App\Services\Blogs;

use DOMDocument;
use DOMElement;
use DOMNode;

class BlogContentSanitizer
{
    private const ALLOWED_TAGS = [
        'a', 'blockquote', 'br', 'code', 'div', 'em', 'figcaption', 'figure', 'h2', 'h3', 'h4',
        'hr', 'iframe', 'img', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'table', 'tbody',
        'td', 'th', 'thead', 'tr', 'u', 'ul',
    ];

    private const ALLOWED_IFRAME_HOSTS = [
        'www.youtube.com',
        'youtube.com',
        'www.youtube-nocookie.com',
        'platform.twitter.com',
        'twitter.com',
        'www.instagram.com',
        'instagram.com',
    ];

    public function sanitize(string $html): string
    {
        $html = trim($html);

        if ($html === '') {
            return '';
        }

        $document = new DOMDocument;
        libxml_use_internal_errors(true);
        $document->loadHTML(
            '<!doctype html><html><head><meta charset="UTF-8"></head><body>'.$html.'</body></html>',
            LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD
        );
        libxml_clear_errors();

        $body = $document->getElementsByTagName('body')->item(0);

        if (! $body) {
            return '';
        }

        $this->sanitizeNode($body);

        $output = '';

        foreach ($body->childNodes as $childNode) {
            $output .= $document->saveHTML($childNode);
        }

        return trim($output);
    }

    public function excerptFromHtml(string $html, int $maxLength = 140): string
    {
        $text = trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8')) ?? '');

        if (mb_strlen($text) <= $maxLength) {
            return $text;
        }

        return mb_substr($text, 0, $maxLength - 1).'…';
    }

    private function sanitizeNode(DOMNode $node): void
    {
        for ($child = $node->firstChild; $child !== null;) {
            $next = $child->nextSibling;

            if ($child instanceof DOMElement) {
                $tagName = strtolower($child->tagName);

                if (! in_array($tagName, self::ALLOWED_TAGS, true)) {
                    $this->unwrapNode($child);
                    $child = $next;

                    continue;
                }

                $this->sanitizeAttributes($child, $tagName);
            }

            if ($child->parentNode !== null) {
                $this->sanitizeNode($child);
            }

            $child = $next;
        }
    }

    private function sanitizeAttributes(DOMElement $element, string $tagName): void
    {
        $allowedAttributes = match ($tagName) {
            'a' => ['href', 'title', 'target', 'rel'],
            'img' => ['src', 'alt', 'title', 'width', 'height'],
            'iframe' => ['src', 'title', 'width', 'height', 'allow', 'allowfullscreen', 'loading'],
            'td', 'th' => ['colspan', 'rowspan'],
            default => [],
        };

        for ($index = $element->attributes->length - 1; $index >= 0; $index--) {
            $attribute = $element->attributes->item($index);

            if (! $attribute) {
                continue;
            }

            $name = strtolower($attribute->name);
            $value = trim($attribute->value);

            if (str_starts_with($name, 'on') || str_starts_with($name, 'style')) {
                $element->removeAttribute($attribute->name);

                continue;
            }

            if (! in_array($name, $allowedAttributes, true)) {
                $element->removeAttribute($attribute->name);

                continue;
            }

            if (($name === 'href' || $name === 'src') && ! $this->isSafeUrl($value, $tagName)) {
                $element->removeAttribute($attribute->name);
            }
        }

        if ($tagName === 'a') {
            $element->setAttribute('rel', 'nofollow noopener noreferrer');

            if ($element->getAttribute('target') === '_blank') {
                $element->setAttribute('target', '_blank');
            }
        }

        if ($tagName === 'iframe') {
            $element->setAttribute('loading', 'lazy');
            $element->setAttribute('allowfullscreen', 'allowfullscreen');
        }
    }

    private function isSafeUrl(string $url, string $tagName): bool
    {
        if ($url === '') {
            return false;
        }

        if (str_starts_with($url, '/') || str_starts_with($url, '#')) {
            return true;
        }

        $parts = parse_url($url);
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));

        if (! in_array($scheme, ['http', 'https'], true)) {
            return false;
        }

        if ($tagName !== 'iframe') {
            return true;
        }

        $host = strtolower((string) ($parts['host'] ?? ''));

        return in_array($host, self::ALLOWED_IFRAME_HOSTS, true);
    }

    private function unwrapNode(DOMNode $node): void
    {
        $parent = $node->parentNode;

        if (! $parent) {
            return;
        }

        while ($node->firstChild) {
            $parent->insertBefore($node->firstChild, $node);
        }

        $parent->removeChild($node);
    }
}
