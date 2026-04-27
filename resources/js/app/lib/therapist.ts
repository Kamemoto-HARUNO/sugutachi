import { formatJstDate, formatJstDateTime } from './datetime';

export function formatProfileStatus(status: string | null | undefined): string {
    switch (status) {
        case 'draft':
            return '公開準備中';
        case 'pending':
            return '確認中';
        case 'approved':
            return '公開可能';
        case 'rejected':
            return '非公開';
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

export function formatBankAccountType(value: string | null | undefined): string {
    switch (value) {
        case 'ordinary':
            return '普通';
        case 'checking':
            return '当座';
        case 'savings':
            return '貯蓄';
        default:
            return '未設定';
    }
}

export function formatRejectionReason(code: string | null | undefined): string {
    if (!code) {
        return '理由は未設定です。';
    }

    return code.replaceAll('_', ' ');
}

export function formatDateTime(value: string | null | undefined): string {
    return formatJstDateTime(value, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }) ?? '未設定';
}

export function formatDate(value: string | null | undefined): string {
    return formatJstDate(value, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    }) ?? '未設定';
}

export function formatTherapistRequirementKey(key: string | null | undefined): string {
    switch (key) {
        case 'public_name':
            return '公開名';
        case 'active_menu':
            return '有効メニュー';
        case 'identity_verification':
            return '本人確認';
        default:
            return '設定内容';
    }
}

export function formatStripeRequirementField(key: string | null | undefined): string {
    switch (key) {
        case 'bank_name':
            return '銀行名';
        case 'bank_branch_name':
            return '支店名';
        case 'bank_account_type':
            return '口座種別';
        case 'bank_account_number':
            return '口座番号';
        case 'bank_account_holder_name':
            return '口座名義';
        case 'business_profile.mcc':
            return '業種カテゴリの確認';
        case 'business_profile.product_description':
            return 'サービス内容の説明';
        case 'external_account':
            return '受取口座の登録';
        case 'individual.address.line1':
            return '住所1行目';
        case 'individual.address.city':
            return '市区町村';
        case 'individual.address.postal_code':
            return '郵便番号';
        case 'individual.dob.day':
        case 'individual.dob.month':
        case 'individual.dob.year':
            return '生年月日';
        case 'individual.email':
            return 'メールアドレス';
        case 'individual.first_name':
        case 'individual.last_name':
            return '氏名';
        case 'individual.id_number':
            return '本人確認番号';
        case 'individual.phone':
            return '電話番号';
        case 'individual.ssn_last_4':
            return '本人確認番号下4桁';
        case 'individual.verification.document':
            return '本人確認書類';
        case 'individual.verification.additional_document':
            return '追加本人確認書類';
        case 'representative.verification.document':
            return '代表者の本人確認書類';
        case 'tos_acceptance.date':
        case 'tos_acceptance.ip':
            return '利用規約同意';
        default:
            return '追加確認項目';
    }
}

export function formatNotificationType(type: string | null | undefined): string {
    switch (type) {
        case 'travel_request_received':
            return '出張リクエスト受信';
        case 'travel_request_warning':
            return '出張リクエスト注意';
        case 'travel_request_restricted':
            return '出張リクエスト制限';
        case 'booking_refunded':
            return '返金完了';
        default:
            return 'アプリ通知';
    }
}
