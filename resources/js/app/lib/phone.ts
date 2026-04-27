export function toDisplayPhoneNumber(value: string | null): string {
    if (!value) {
        return '';
    }

    const digits = value.replace(/\D/g, '');

    if (value.startsWith('+81') && digits.startsWith('81')) {
        return `0${digits.slice(2)}`;
    }

    return digits;
}

export function toDomesticDigits(value: string): string {
    return value.replace(/\D/g, '').slice(0, 11);
}

function isDomesticPhoneNumber(value: string): boolean {
    return /^0\d{9,10}$/.test(value);
}

export function toE164PhoneNumber(value: string): string | null {
    const digits = toDomesticDigits(value);

    if (digits === '') {
        return null;
    }

    if (!isDomesticPhoneNumber(digits)) {
        return null;
    }

    return `+81${digits.slice(1)}`;
}
