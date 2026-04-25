export function formatProfileStatus(status: string | null | undefined): string {
    switch (status) {
        case 'draft':
            return '下書き';
        case 'pending':
            return '審査待ち';
        case 'approved':
            return '承認済み';
        case 'rejected':
            return '差し戻し';
        case 'suspended':
            return '停止中';
        default:
            return status ?? '未設定';
    }
}

export function formatIdentityVerificationStatus(status: string | null | undefined): string {
    switch (status) {
        case 'pending':
            return '審査待ち';
        case 'approved':
            return '承認済み';
        case 'rejected':
            return '差し戻し';
        case 'needs_review':
            return '要確認';
        case 'expired':
            return '期限切れ';
        default:
            return status ?? '未提出';
    }
}

export function formatStripeStatus(status: string | null | undefined): string {
    switch (status) {
        case 'pending':
            return '準備中';
        case 'requirements_due':
            return '追加情報が必要';
        case 'restricted':
            return '制限あり';
        case 'active':
            return '利用可能';
        case 'disabled':
            return '無効';
        default:
            return status ?? '未連携';
    }
}

export function formatRejectionReason(code: string | null | undefined): string {
    if (!code) {
        return '理由は未設定です。';
    }

    return code.replaceAll('_', ' ');
}

export function formatDateTime(value: string | null | undefined): string {
    if (!value) {
        return '未設定';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '未設定';
    }

    return new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

export function formatDate(value: string | null | undefined): string {
    if (!value) {
        return '未設定';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '未設定';
    }

    return new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    }).format(date);
}
