const STRIPE_JS_URL = 'https://js.stripe.com/v3/';

interface StripeErrorLike {
    message?: string;
}

export interface StripeCardElementChangeEvent {
    complete: boolean;
    empty: boolean;
    error?: StripeErrorLike;
}

export interface StripeCardElement {
    mount: (element: HTMLElement) => void;
    destroy: () => void;
    on: (event: 'change', handler: (event: StripeCardElementChangeEvent) => void) => void;
}

export interface StripeElements {
    create: (
        type: 'card',
        options?: Record<string, unknown>,
    ) => StripeCardElement;
}

export interface StripePaymentIntentResult {
    paymentIntent?: {
        status?: string | null;
    };
    error?: StripeErrorLike;
}

export interface StripeInstance {
    elements: (options?: Record<string, unknown>) => StripeElements;
    confirmCardPayment: (
        clientSecret: string,
        data: {
            payment_method: {
                card: StripeCardElement;
            };
        },
    ) => Promise<StripePaymentIntentResult>;
}

type StripeFactory = (publishableKey: string) => StripeInstance;

declare global {
    interface Window {
        Stripe?: StripeFactory;
    }
}

let stripeScriptPromise: Promise<void> | null = null;

function loadStripeScript(): Promise<void> {
    if (window.Stripe) {
        return Promise.resolve();
    }

    if (!stripeScriptPromise) {
        stripeScriptPromise = new Promise<void>((resolve, reject) => {
            const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${STRIPE_JS_URL}"]`);

            if (existingScript) {
                if (window.Stripe || existingScript.dataset.loaded === 'true') {
                    resolve();
                    return;
                }

                existingScript.addEventListener('load', () => resolve(), { once: true });
                existingScript.addEventListener('error', () => {
                    stripeScriptPromise = null;
                    reject(new Error('Stripe.js を読み込めませんでした。'));
                }, { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = STRIPE_JS_URL;
            script.async = true;
            script.onload = () => {
                script.dataset.loaded = 'true';
                resolve();
            };
            script.onerror = () => {
                stripeScriptPromise = null;
                reject(new Error('Stripe.js を読み込めませんでした。'));
            };
            document.head.appendChild(script);
        });
    }

    return stripeScriptPromise;
}

export async function createStripeInstance(publishableKey: string): Promise<StripeInstance> {
    await loadStripeScript();

    if (!window.Stripe) {
        throw new Error('Stripe.js を初期化できませんでした。');
    }

    return window.Stripe(publishableKey);
}
