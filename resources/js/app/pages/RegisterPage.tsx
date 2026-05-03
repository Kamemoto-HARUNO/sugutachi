import { startTransition, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BrandMark } from '../components/brand/BrandMark';
import { PasswordVisibilityToggleButton } from '../components/forms/PasswordVisibilityToggleButton';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToastOnMessage } from '../hooks/useToastOnMessage';
import { getPostAuthPath, inferRoleFromPath, sanitizeAppPath } from '../lib/account';
import { ApiError, apiRequest, getFieldError, unwrapData } from '../lib/api';
import { toDomesticDigits, toE164PhoneNumber } from '../lib/phone';
import type { ApiEnvelope, LegalDocumentSummary, PublicCampaignRecord, ServiceMeta } from '../lib/types';

type InitialRole = 'user' | 'therapist';
type RegistrationStep = 'select-role' | 'fill-form';

interface LocationState {
    from?: string;
}

interface RegisterModeOption {
    value: InitialRole;
    audienceLabel: string;
    titleMain: string;
    titleSuffix: string;
    panelDescription: string;
    summaryLead: string;
    formTitle: string;
    formLead: string;
    borderClassName: string;
    badgeClassName: string;
    badgeDotClassName: string;
    backgroundImagePath: string;
    backgroundPositionClassName: string;
    panelSurfaceClassName: string;
    panelOverlayClassName: string;
    panelGlowClassName: string;
}

const REGISTER_MODE_OPTIONS: RegisterModeOption[] = [
    {
        value: 'therapist',
        audienceLabel: '働く側',
        titleMain: 'タチキャスト',
        titleSuffix: 'としてはじめる',
        panelDescription: '本人確認後、プロフィールとメニューを登録したらすぐにデビューできます。',
        summaryLead: '本人確認、受取口座設定、プロフィール入力、空き枠公開の準備へ進みます。',
        formTitle: 'タチキャストとして会員登録',
        formLead: '基本情報と同意項目を入力すると、タチキャストとしての準備を始められます。',
        borderClassName: 'border-[#2f7a4f]',
        badgeClassName: 'bg-[#2f7a4f]',
        badgeDotClassName: 'bg-[#2f7a4f]',
        backgroundImagePath: '/images/register/tachi.jpg',
        backgroundPositionClassName: 'bg-center',
        panelSurfaceClassName: 'bg-[linear-gradient(155deg,#8eb79c_0%,#466b58_38%,#173126_100%)]',
        panelOverlayClassName: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.02)_28%,rgba(11,28,20,0.3)_54%,rgba(9,22,17,0.92)_100%)]',
        panelGlowClassName: 'bg-[#c7f0d5]/45',
    },
    {
        value: 'user',
        audienceLabel: '利用する側',
        titleMain: '利用者',
        titleSuffix: 'としてはじめる',
        panelDescription: '本人確認後、待ち合わせ場所を登録してタチキャストを探しましょう。',
        summaryLead: '検索、お気に入り追加、空き時間選択、予約リクエストへ進めます。',
        formTitle: '利用者として会員登録',
        formLead: '基本情報と同意項目を入力すると、利用者としてすぐに探し始められます。',
        borderClassName: 'border-[#d2b179]',
        badgeClassName: 'bg-[#d2b179]',
        badgeDotClassName: 'bg-[#d2b179]',
        backgroundImagePath: '/images/register/uke.jpg',
        backgroundPositionClassName: 'bg-center',
        panelSurfaceClassName: 'bg-[linear-gradient(155deg,#ead9bb_0%,#bc9764_42%,#5f4631_100%)]',
        panelOverlayClassName: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.1)_0%,rgba(255,255,255,0.03)_28%,rgba(53,35,17,0.3)_54%,rgba(34,23,15,0.9)_100%)]',
        panelGlowClassName: 'bg-[#fff1d0]/52',
    },
];

function resolveReturnTo(rawQueryValue: string | null, state: LocationState | null): string | null {
    return sanitizeAppPath(rawQueryValue) ?? sanitizeAppPath(state?.from);
}

function findRegisterModeOption(role: InitialRole): RegisterModeOption {
    return REGISTER_MODE_OPTIONS.find((option) => option.value === role) ?? REGISTER_MODE_OPTIONS[0];
}

export function RegisterPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const { register } = useAuth();
    const [documents, setDocuments] = useState<LegalDocumentSummary[]>([]);
    const [registerCampaigns, setRegisterCampaigns] = useState<PublicCampaignRecord[]>([]);
    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirmation, setPasswordConfirmation] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [isPasswordConfirmationVisible, setIsPasswordConfirmationVisible] = useState(false);
    const [acceptTerms, setAcceptTerms] = useState(false);
    const [acceptPrivacy, setAcceptPrivacy] = useState(false);
    const [isOver18, setIsOver18] = useState(false);
    const [agreedRelaxationPurpose, setAgreedRelaxationPurpose] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const locationState = (location.state as LocationState | null) ?? null;
    const returnTo = useMemo(
        () => resolveReturnTo(searchParams.get('return_to'), locationState),
        [locationState, searchParams],
    );
    const returnRole = inferRoleFromPath(returnTo);
    const defaultInitialRole: InitialRole = returnRole === 'therapist' ? 'therapist' : 'user';
    const loginPath = returnTo ? `/login?return_to=${encodeURIComponent(returnTo)}` : '/login';
    const [initialRole, setInitialRole] = useState<InitialRole>(defaultInitialRole);
    const [registrationStep, setRegistrationStep] = useState<RegistrationStep>('select-role');
    const [hasExplicitRoleSelection, setHasExplicitRoleSelection] = useState(false);

    usePageTitle('会員登録');
    useToastOnMessage(error, 'error');

    useEffect(() => {
        let isMounted = true;

        void Promise.all([
            apiRequest<ApiEnvelope<LegalDocumentSummary[]>>('/legal-documents'),
            apiRequest<ApiEnvelope<ServiceMeta>>('/service-meta'),
        ])
            .then(([documentsPayload, metaPayload]) => {
                if (!isMounted) {
                    return;
                }

                setDocuments(unwrapData(documentsPayload));
                setRegisterCampaigns(
                    unwrapData(metaPayload).campaigns.filter((campaign) => campaign.placements.includes('register')),
                );
            })
            .catch((requestError: unknown) => {
                if (!isMounted) {
                    return;
                }

                const message =
                    requestError instanceof ApiError ? requestError.message : '規約情報の取得に失敗しました。';

                setError(message);
            })
            .finally(() => {
                if (isMounted) {
                    setIsLoadingDocuments(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, []);

    const termsDocument = useMemo(
        () => documents.find((document) => document.document_type === 'terms') ?? null,
        [documents],
    );
    const privacyDocument = useMemo(
        () => documents.find((document) => document.document_type === 'privacy') ?? null,
        [documents],
    );
    const registerCampaignByRole = useMemo<Record<InitialRole, PublicCampaignRecord | null>>(() => ({
        user: registerCampaigns.find((campaign) => campaign.target_role === 'user') ?? null,
        therapist: registerCampaigns.find((campaign) => campaign.target_role === 'therapist') ?? null,
    }), [registerCampaigns]);
    const selectedMode = findRegisterModeOption(initialRole);

    const handleModeSelection = (role: InitialRole) => {
        setInitialRole(role);
        setHasExplicitRoleSelection(true);
        setError(null);

        startTransition(() => {
            setRegistrationStep('fill-form');
        });
    };

    const handleBackToModeSelection = () => {
        setError(null);

        startTransition(() => {
            setRegistrationStep('select-role');
        });
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);

        if (!termsDocument || !privacyDocument) {
            setError('公開中の法務文書が見つからないため、登録を進められません。');
            return;
        }

        if (!acceptTerms || !acceptPrivacy || !isOver18 || !agreedRelaxationPurpose) {
            setError('同意項目を確認してください。');
            return;
        }

        const normalizedPhone = toE164PhoneNumber(phone);

        if (phone.trim() !== '' && !normalizedPhone) {
            setError('電話番号は 08012345678 のように、先頭の 0 を含む数字だけで入力してください。');
            return;
        }

        setIsSubmitting(true);

        try {
            const account = await register({
                email,
                phone_e164: normalizedPhone ?? undefined,
                password,
                password_confirmation: passwordConfirmation,
                display_name: displayName || undefined,
                initial_role: initialRole,
                accepted_terms_version: termsDocument.version,
                accepted_privacy_version: privacyDocument.version,
                is_over_18: isOver18,
                relaxation_purpose_agreed: agreedRelaxationPurpose,
            });

            if (returnTo && (!returnRole || returnRole === initialRole)) {
                navigate(returnTo, { replace: true });
                return;
            }

            navigate(getPostAuthPath(account, initialRole), { replace: true });
        } catch (requestError) {
            if (requestError instanceof ApiError) {
                setError(
                    getFieldError(requestError, 'email')
                    ?? getFieldError(requestError, 'phone_e164')
                    ?? getFieldError(requestError, 'password')
                    ?? requestError.message,
                );
            } else {
                setError('会員登録に失敗しました。');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-6xl">
            {registrationStep === 'select-role' ? (
                <section className="relative overflow-hidden rounded-[40px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(210,177,121,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(47,122,79,0.18),transparent_32%),linear-gradient(135deg,#0f1723_0%,#17202b_44%,#0d1722_100%)] p-6 text-white shadow-[0_30px_80px_rgba(23,32,43,0.22)] md:p-8">
                    <div className="absolute inset-0">
                        <div className="absolute -left-12 top-0 h-56 w-56 rounded-full bg-[#d2b179]/14 blur-3xl" />
                        <div className="absolute -right-10 bottom-6 h-72 w-72 rounded-full bg-[#2f7a4f]/18 blur-3xl" />
                    </div>

                    <div className="relative flex flex-col gap-8">
                        <div className="max-w-3xl space-y-4">
                            <div className="space-y-3">
                                <h1 className="whitespace-nowrap text-[clamp(1.75rem,5vw,3rem)] font-semibold leading-[1.15]">
                                    まずは利用モードを選択
                                </h1>
                                <p className="max-w-2xl text-sm leading-7 text-[#d8d3ca] md:text-base md:leading-8">
                                    1つのアカウントで、利用者として探し始めることも、タチキャストとして準備を始めることもできます。先にモードを選ぶと、その内容に合わせた会員登録フォームへ進みます。
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-6 lg:grid-cols-2">
                            {REGISTER_MODE_OPTIONS.map((option, index) => {
                                const campaign = registerCampaignByRole[option.value];
                                const isActive = hasExplicitRoleSelection && initialRole === option.value;

                                return (
                                    <div key={option.value} className="relative pt-8">
                                        {campaign ? (
                                            <div
                                                className="campaign-offer-balloon campaign-offer-float absolute left-1/2 top-0 z-20 w-max max-w-full -translate-x-1/2 whitespace-nowrap px-4 py-2.5 text-center text-[13px] font-bold leading-5 text-[#1f1a0f]"
                                                style={{ animationDelay: index === 0 ? '0s' : '1.2s' }}
                                            >
                                                {campaign.offer_text}
                                            </div>
                                        ) : null}

                                        <button
                                            type="button"
                                            onClick={() => handleModeSelection(option.value)}
                                            aria-pressed={isActive}
                                            className={[
                                                'group relative flex min-h-[440px] w-full overflow-hidden rounded-[32px] border-2 p-0 text-left text-white shadow-[0_26px_60px_rgba(15,23,42,0.28)] transition duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white',
                                                option.borderClassName,
                                                isActive
                                                    ? 'scale-[1.01] ring-4 ring-white/10'
                                                    : 'hover:-translate-y-1 hover:shadow-[0_34px_72px_rgba(15,23,42,0.34)]',
                                            ].join(' ')}
                                        >
                                            <div className={`absolute inset-0 ${option.panelSurfaceClassName}`} />
                                            <div
                                                className={`absolute inset-0 bg-cover bg-no-repeat ${option.backgroundPositionClassName}`}
                                                style={{ backgroundImage: `url(${option.backgroundImagePath})` }}
                                            />
                                            <div className={`absolute inset-0 ${option.panelOverlayClassName}`} />
                                            <div className={`absolute left-[8%] top-[8%] h-36 w-36 rounded-full ${option.panelGlowClassName} blur-3xl`} />
                                            <div className="absolute inset-x-7 top-7 h-40 rounded-[999px] border border-white/12 bg-white/8 blur-3xl" />
                                            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0)_30%,rgba(0,0,0,0.18)_56%,rgba(0,0,0,0.78)_100%)]" />

                                            <div className="absolute inset-0 flex flex-col justify-end px-6 pb-6 pt-24">
                                                <div className="space-y-4">
                                                    <div className={`inline-flex items-center rounded-full px-4 py-2 text-xs font-bold text-white ${option.badgeClassName}`}>
                                                        {option.audienceLabel}
                                                    </div>

                                                    <div className="space-y-2">
                                                        <div className="flex flex-wrap items-end gap-x-2 gap-y-1 text-white">
                                                            <span className="text-[1.7rem] font-bold leading-none">
                                                                {option.titleMain}
                                                            </span>
                                                            <span className="pb-1 text-sm font-semibold tracking-[0.04em] text-white/92">
                                                                {option.titleSuffix}
                                                            </span>
                                                        </div>
                                                        <p className="w-full max-w-none text-sm leading-7 text-white/92">
                                                            {option.panelDescription}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="mt-5 text-center text-[10px] font-normal leading-none text-white/50">
                                                    タップ
                                                </div>
                                            </div>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/6 p-5 text-[#d8d3ca] md:flex-row md:items-center md:justify-between">
                            <div>
                                <p className="text-sm font-semibold text-white">すでにアカウントがある場合</p>
                                <p className="mt-2 text-sm leading-7">
                                    既存アカウントでログインして、そのまま続きの画面へ戻れます。
                                </p>
                            </div>
                            <Link
                                to={loginPath}
                                className="inline-flex items-center justify-center rounded-full border border-white/18 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/14"
                            >
                                ログインへ戻る
                            </Link>
                        </div>
                    </div>
                </section>
            ) : (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,0.86fr)_minmax(0,1fr)]">
                    <aside className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(210,177,121,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(47,122,79,0.18),transparent_34%),linear-gradient(135deg,#111b26_0%,#17202b_100%)] p-6 text-white shadow-[0_30px_80px_rgba(23,32,43,0.2)] md:p-8">
                        <div className="absolute inset-0">
                            <div className="absolute -left-10 top-0 h-44 w-44 rounded-full bg-[#d2b179]/14 blur-3xl" />
                            <div className="absolute -right-14 bottom-10 h-60 w-60 rounded-full bg-[#2f7a4f]/16 blur-3xl" />
                        </div>

                        <div className="relative flex h-full flex-col gap-6">
                            <BrandMark inverse />

                            <div className="space-y-3">
                                <p className="text-xs font-semibold tracking-[0.32em] text-[#d2b179]">SELECTED MODE</p>
                                <h1 className="text-[2rem] font-semibold leading-[1.3]">
                                    {selectedMode.titleMain}
                                    <span className="ml-2 text-base font-semibold text-white/80">{selectedMode.titleSuffix}</span>
                                </h1>
                                <p className="max-w-2xl text-sm leading-7 text-[#d8d3ca]">
                                    {selectedMode.summaryLead}
                                </p>
                            </div>

                            <div className={`relative flex min-h-[320px] flex-1 overflow-hidden rounded-[32px] border-2 p-6 shadow-[0_26px_60px_rgba(15,23,42,0.28)] ${selectedMode.borderClassName}`}>
                                <div className={`absolute inset-0 ${selectedMode.panelSurfaceClassName}`} />
                                <div
                                    className={`absolute inset-0 bg-cover bg-no-repeat ${selectedMode.backgroundPositionClassName}`}
                                    style={{ backgroundImage: `url(${selectedMode.backgroundImagePath})` }}
                                />
                                <div className={`absolute inset-0 ${selectedMode.panelOverlayClassName}`} />
                                <div className={`absolute left-[8%] top-[8%] h-36 w-36 rounded-full ${selectedMode.panelGlowClassName} blur-3xl`} />
                                <div className="absolute inset-x-7 top-7 h-40 rounded-[999px] border border-white/12 bg-white/8 blur-3xl" />
                                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0)_30%,rgba(0,0,0,0.18)_56%,rgba(0,0,0,0.78)_100%)]" />

                                <div className="relative mt-auto space-y-4">
                                    <div className={`inline-flex items-center rounded-full px-4 py-2 text-xs font-bold text-white ${selectedMode.badgeClassName}`}>
                                        {selectedMode.audienceLabel}
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-end gap-x-2 gap-y-1 text-white">
                                            <span className="text-[1.7rem] font-bold leading-none">{selectedMode.titleMain}</span>
                                            <span className="pb-1 text-sm font-semibold tracking-[0.04em] text-white/92">
                                                {selectedMode.titleSuffix}
                                            </span>
                                        </div>
                                        <p className="max-w-[18rem] text-sm leading-7 text-white/92">
                                            {selectedMode.panelDescription}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-[22px] border border-white/10 bg-white/6 p-4 text-sm leading-7 text-[#d8d3ca]">
                                <p>あとからもう片方のモードも追加できます。</p>
                                {returnTo ? (
                                    <p className="mt-2 text-white/80">
                                        登録が完了すると、選んだモードに応じた次の画面へ進みます。
                                    </p>
                                ) : null}
                            </div>
                        </div>
                    </aside>

                    <section className="rounded-[36px] bg-[#fffdf8] p-7 text-[#17202b] shadow-[0_18px_36px_rgba(23,32,43,0.12)] md:p-8">
                        <div className="space-y-6">
                            <div className="space-y-4">
                                <button
                                    type="button"
                                    onClick={handleBackToModeSelection}
                                    className="inline-flex items-center gap-2 rounded-full border border-[#d9c9ae] px-4 py-2 text-sm font-semibold text-[#17202b] transition hover:bg-white"
                                >
                                    <span aria-hidden="true">←</span>
                                    モード選択に戻る
                                </button>

                                <div className="space-y-2">
                                    <p className="text-xs font-semibold tracking-wide text-[#9a7a49]">ACCOUNT SETUP</p>
                                    <h2 className="text-2xl font-semibold">{selectedMode.formTitle}</h2>
                                    <p className="text-sm leading-7 text-[#68707a]">
                                        {selectedMode.formLead}
                                    </p>
                                </div>

                                <div className="inline-flex items-center gap-2 rounded-full bg-[#f6f1e7] px-4 py-2 text-xs font-semibold tracking-[0.08em] text-[#7d5f31]">
                                    <span className={`inline-flex h-2.5 w-2.5 rounded-full ${selectedMode.badgeDotClassName}`} />
                                    選択中: {selectedMode.titleMain}
                                </div>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div className="grid gap-4 md:grid-cols-2">
                                    <label className="space-y-2">
                                        <span className="text-sm font-semibold">表示名</span>
                                        <input
                                            value={displayName}
                                            onChange={(event) => setDisplayName(event.target.value)}
                                            className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm outline-none transition focus:border-[#c6a16a]"
                                            placeholder="ニックネーム"
                                        />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-sm font-semibold">電話番号</span>
                                        <input
                                            type="tel"
                                            value={phone}
                                            onChange={(event) => setPhone(toDomesticDigits(event.target.value))}
                                            className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm outline-none transition focus:border-[#c6a16a]"
                                            inputMode="numeric"
                                            autoComplete="tel-national"
                                            placeholder="08012345678"
                                        />
                                    </label>
                                </div>

                                <label className="space-y-2">
                                    <span className="text-sm font-semibold">メールアドレス</span>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(event) => setEmail(event.target.value)}
                                        className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 text-sm outline-none transition focus:border-[#c6a16a]"
                                        placeholder="you@example.com"
                                        autoComplete="email"
                                        required
                                    />
                                </label>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <label htmlFor="register-password" className="text-sm font-semibold">
                                            パスワード
                                        </label>
                                        <div className="relative">
                                            <input
                                                id="register-password"
                                                type={isPasswordVisible ? 'text' : 'password'}
                                                value={password}
                                                onChange={(event) => setPassword(event.target.value)}
                                                className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 pr-12 text-sm outline-none transition focus:border-[#c6a16a]"
                                                placeholder="10文字以上"
                                                autoComplete="new-password"
                                                required
                                            />
                                            <PasswordVisibilityToggleButton
                                                isVisible={isPasswordVisible}
                                                label="パスワード"
                                                onClick={() => setIsPasswordVisible((current) => !current)}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label htmlFor="register-password-confirmation" className="text-sm font-semibold">
                                            パスワード確認
                                        </label>
                                        <div className="relative">
                                            <input
                                                id="register-password-confirmation"
                                                type={isPasswordConfirmationVisible ? 'text' : 'password'}
                                                value={passwordConfirmation}
                                                onChange={(event) => setPasswordConfirmation(event.target.value)}
                                                className="w-full rounded-[18px] border border-[#e4d7c2] bg-[#fffaf3] px-4 py-3 pr-12 text-sm outline-none transition focus:border-[#c6a16a]"
                                                placeholder="もう一度入力"
                                                autoComplete="new-password"
                                                required
                                            />
                                            <PasswordVisibilityToggleButton
                                                isVisible={isPasswordConfirmationVisible}
                                                label="パスワード確認"
                                                onClick={() => setIsPasswordConfirmationVisible((current) => !current)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-[24px] bg-[#f6f1e7] p-5">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-semibold text-[#17202b]">公開中の法務文書</p>
                                            <p className="mt-1 text-xs text-[#68707a]">
                                                利用規約とプライバシーポリシーの最新版に同意して登録します。
                                            </p>
                                        </div>
                                        {isLoadingDocuments ? (
                                            <span className="text-xs text-[#68707a]">読み込み中...</span>
                                        ) : null}
                                    </div>

                                    <div className="mt-4 space-y-3">
                                        <label className="flex items-start gap-3 text-sm text-[#17202b]">
                                            <input type="checkbox" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} className="mt-1" />
                                            <span>
                                                <Link to="/terms" className="font-semibold text-[#9a7a49] underline underline-offset-4">
                                                    利用規約
                                                </Link>
                                                {' '}
                                                に同意します
                                            </span>
                                        </label>
                                        <label className="flex items-start gap-3 text-sm text-[#17202b]">
                                            <input type="checkbox" checked={acceptPrivacy} onChange={(event) => setAcceptPrivacy(event.target.checked)} className="mt-1" />
                                            <span>
                                                <Link to="/privacy" className="font-semibold text-[#9a7a49] underline underline-offset-4">
                                                    プライバシーポリシー
                                                </Link>
                                                {' '}
                                                に同意します
                                            </span>
                                        </label>
                                        <label className="flex items-start gap-3 text-sm text-[#17202b]">
                                            <input type="checkbox" checked={isOver18} onChange={(event) => setIsOver18(event.target.checked)} className="mt-1" />
                                            <span>18歳以上であることを確認しました</span>
                                        </label>
                                        <label className="flex items-start gap-3 text-sm text-[#17202b]">
                                            <input
                                                type="checkbox"
                                                checked={agreedRelaxationPurpose}
                                                onChange={(event) => setAgreedRelaxationPurpose(event.target.checked)}
                                                className="mt-1"
                                            />
                                            <span>本サービスがリラクゼーション / ボディケア / もみほぐし目的のサービスであることに同意します</span>
                                        </label>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSubmitting || isLoadingDocuments}
                                    className="inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(168deg,#d2b179_0%,#b5894d_100%)] px-6 py-3 text-sm font-bold text-[#1a2430] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                    {isSubmitting ? '登録中...' : '会員登録する'}
                                </button>
                            </form>

                            <div className="rounded-[24px] bg-[#f6f1e7] p-5">
                                <p className="text-sm font-semibold text-[#17202b]">すでにアカウントがある場合</p>
                                <p className="mt-2 text-sm leading-7 text-[#68707a]">
                                    既存アカウントでログインして、そのまま続きの画面へ戻れます。
                                </p>
                                <Link
                                    to={loginPath}
                                    className="mt-4 inline-flex items-center rounded-full border border-[#d9c9ae] px-4 py-2 text-sm font-semibold text-[#17202b] transition hover:bg-white"
                                >
                                    ログインへ戻る
                                </Link>
                            </div>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}
