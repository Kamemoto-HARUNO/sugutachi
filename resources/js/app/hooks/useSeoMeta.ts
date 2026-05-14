import { useEffect } from 'react';

interface SeoMetaInput {
    title?: string | null;
    description?: string | null;
    canonicalUrl?: string | null;
    ogImageUrl?: string | null;
    type?: 'website' | 'article';
    noindex?: boolean;
    jsonLd?: Record<string, unknown> | null;
}

function setMeta(selector: string, attr: 'content' | 'href', value: string | null | undefined): void {
    if (!value) {
        return;
    }

    const element = document.head.querySelector(selector) as HTMLMetaElement | HTMLLinkElement | null;

    if (element) {
        element.setAttribute(attr, value);
    }
}

export function useSeoMeta(input: SeoMetaInput): void {
    useEffect(() => {
        const title = input.title ? `${input.title} | すぐタチ` : 'すぐタチ';
        document.title = title;

        setMeta('meta[name="description"]', 'content', input.description);
        setMeta('meta[property="og:title"]', 'content', input.title ?? title);
        setMeta('meta[property="og:description"]', 'content', input.description);
        setMeta('meta[property="og:type"]', 'content', input.type ?? 'website');
        setMeta('meta[property="og:url"]', 'content', input.canonicalUrl ?? window.location.href);
        setMeta('meta[property="og:image"]', 'content', input.ogImageUrl);
        setMeta('meta[property="og:image:secure_url"]', 'content', input.ogImageUrl);
        setMeta('meta[name="twitter:title"]', 'content', input.title ?? title);
        setMeta('meta[name="twitter:description"]', 'content', input.description);
        setMeta('meta[name="twitter:image"]', 'content', input.ogImageUrl);

        let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;

        if (!canonical) {
            canonical = document.createElement('link');
            canonical.rel = 'canonical';
            document.head.appendChild(canonical);
        }

        canonical.href = input.canonicalUrl ?? window.location.href;

        let robots = document.head.querySelector('meta[name="robots"]') as HTMLMetaElement | null;

        if (input.noindex) {
            if (!robots) {
                robots = document.createElement('meta');
                robots.name = 'robots';
                document.head.appendChild(robots);
            }

            robots.content = 'noindex,nofollow';
        } else {
            robots?.remove();
        }

        const existingJsonLd = document.getElementById('page-json-ld') ?? document.getElementById('server-json-ld');
        existingJsonLd?.remove();

        if (input.jsonLd) {
            const script = document.createElement('script');
            script.id = 'page-json-ld';
            script.type = 'application/ld+json';
            script.text = JSON.stringify(input.jsonLd);
            document.head.appendChild(script);
        }
    }, [input.canonicalUrl, input.description, input.jsonLd, input.noindex, input.ogImageUrl, input.title, input.type]);
}
