import { useEffect } from 'react';
import {
    BrowserRouter,
    Navigate,
    Outlet,
    Route,
    Routes,
    useLocation,
    useParams,
} from 'react-router-dom';
import { ActiveUserBookingDock } from './components/booking';
import { LoadingScreen } from './components/LoadingScreen';
import { PushOptInModal } from './components/notifications/PushOptInModal';
import { PlaceholderScreen } from './components/PlaceholderScreen';
import { useAuth } from './hooks/useAuth';
import {
    adminNavItems,
    adminPlaceholderRoutes,
    therapistNavItems,
    therapistPlaceholderRoutes,
    userNavItems,
    userPlaceholderRoutes,
} from './lib/navigation';
import { getPostAuthPath, type RoleName } from './lib/account';
import { DashboardLayout } from './layouts/DashboardLayout';
import { BookingFlowLayout } from './layouts/BookingFlowLayout';
import { PublicLayout } from './layouts/PublicLayout';
import { HelpPage } from './pages/HelpPage';
import { LegalDocumentPage } from './pages/LegalDocumentPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdminAccountsPage } from './pages/AdminAccountsPage';
import { AdminLegalDocumentsPage } from './pages/AdminLegalDocumentsPage';
import { AdminBookingsPage } from './pages/AdminBookingsPage';
import { AdminBookingMessagesPage } from './pages/AdminBookingMessagesPage';
import { AdminContactInquiriesPage } from './pages/AdminContactInquiriesPage';
import { AdminIdentityVerificationsPage } from './pages/AdminIdentityVerificationsPage';
import { AdminAuditLogsPage } from './pages/AdminAuditLogsPage';
import { AdminPlatformFeeSettingsPage } from './pages/AdminPlatformFeeSettingsPage';
import { AdminPricingRulesPage } from './pages/AdminPricingRulesPage';
import { AdminProfilePhotosPage } from './pages/AdminProfilePhotosPage';
import { AdminPayoutRequestsPage } from './pages/AdminPayoutRequestsPage';
import { AdminRefundRequestsPage } from './pages/AdminRefundRequestsPage';
import { AdminReportsPage } from './pages/AdminReportsPage';
import { AdminStripeDisputesPage } from './pages/AdminStripeDisputesPage';
import { AdminTherapistProfilesPage } from './pages/AdminTherapistProfilesPage';
import { AdminTravelRequestsPage } from './pages/AdminTravelRequestsPage';
import { AccountIdentityVerificationPage } from './pages/AccountIdentityVerificationPage';
import { AccountProfilePage } from './pages/AccountProfilePage';
import { TherapistBookingNoShowPage, UserBookingNoShowPage } from './pages/BookingNoShowPage';
import { ContactPage } from './pages/ContactPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { PublicHomePage } from './pages/PublicHomePage';
import { RegisterPage } from './pages/RegisterPage';
import { RoleSelectPage } from './pages/RoleSelectPage';
import { SectionHomePage } from './pages/SectionHomePage';
import { TherapistIdentityVerificationPage } from './pages/TherapistIdentityVerificationPage';
import { TherapistAvailabilityPage } from './pages/TherapistAvailabilityPage';
import { TherapistBalancePage } from './pages/TherapistBalancePage';
import { TherapistBookingDetailPage } from './pages/TherapistBookingDetailPage';
import { TherapistBookingsPage } from './pages/TherapistBookingsPage';
import { TherapistBookingMessagesPage } from './pages/TherapistBookingMessagesPage';
import { TherapistOnboardingPage } from './pages/TherapistOnboardingPage';
import { TherapistPricingPage } from './pages/TherapistPricingPage';
import { TherapistProfilePage } from './pages/TherapistProfilePage';
import { TherapistRequestsPage } from './pages/TherapistRequestsPage';
import { TherapistReviewsPage } from './pages/TherapistReviewsPage';
import { TherapistSettingsPage } from './pages/TherapistSettingsPage';
import { TherapistStripeConnectPage } from './pages/TherapistStripeConnectPage';
import { TherapistTravelRequestsPage } from './pages/TherapistTravelRequestsPage';
import { UserBookingDetailPage } from './pages/UserBookingDetailPage';
import { UserBookingMessagesPage } from './pages/UserBookingMessagesPage';
import { UserBookingCancelPage } from './pages/UserBookingCancelPage';
import { UserBookingPaymentPage } from './pages/UserBookingPaymentPage';
import { UserBookingReviewPage } from './pages/UserBookingReviewPage';
import { UserBookingsPage } from './pages/UserBookingsPage';
import { UserBookingQuotePage } from './pages/UserBookingQuotePage';
import { UserBookingRequestPage } from './pages/UserBookingRequestPage';
import { UserBookingRefundPage } from './pages/UserBookingRefundPage';
import { UserBookingReportPage } from './pages/UserBookingReportPage';
import { UserBookingWaitingPage } from './pages/UserBookingWaitingPage';
import { UserIdentityVerificationPage } from './pages/UserIdentityVerificationPage';
import { UserBlocksPage } from './pages/UserBlocksPage';
import { UserProfilePage } from './pages/UserProfilePage';
import { UserReportsPage } from './pages/UserReportsPage';
import { UserServiceAddressesPage } from './pages/UserServiceAddressesPage';
import { UserTherapistAvailabilityPage } from './pages/UserTherapistAvailabilityPage';
import { UserTherapistDetailPage } from './pages/UserTherapistDetailPage';
import { UserTherapistTravelRequestPage } from './pages/UserTherapistTravelRequestPage';
import { UserTherapistSearchPage } from './pages/UserTherapistSearchPage';
import { AuthProvider } from './providers/AuthProvider';
import { NotificationProvider } from './providers/NotificationProvider';
import { ToastProvider } from './providers/ToastProvider';

function AppRoutes() {
    const { account, activeRole, hasRole, isAuthenticated, isBootstrapping, selectRole } = useAuth();

    if (isBootstrapping) {
        return <LoadingScreen title="起動中" message="認証状態とアプリ設定を確認しています。" />;
    }

    return (
        <>
            <Routes>
                <Route path="/" element={<PublicHomePage />} />
                <Route path="/therapists/:publicId" element={<UserTherapistDetailPage />} />
                <Route path="/user/therapists/:publicId" element={<LegacyUserTherapistDetailRedirect />} />

                <Route element={<PublicLayout />}>
                    <Route path="/help" element={<HelpPage />} />
                    <Route path="/terms" element={<LegalDocumentPage documentType="terms" title="利用規約" />} />
                    <Route path="/privacy" element={<LegalDocumentPage documentType="privacy" title="プライバシーポリシー" />} />
                    <Route path="/commerce" element={<LegalDocumentPage documentType="commerce" title="特定商取引法に基づく表記" />} />
                    <Route path="/contact" element={<ContactPage />} />
                    <Route element={<ProtectedRoute isAuthenticated={isAuthenticated} />}>
                        <Route path="/notifications" element={<NotificationsPage />} />
                    </Route>
                    <Route element={<GuestOnlyRoute isAuthenticated={isAuthenticated} accountPath={getPostAuthPath(account, activeRole)} />}>
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/register" element={<RegisterPage />} />
                        <Route path="/admin/login" element={<LoginPage targetRole="admin" />} />
                    </Route>
                </Route>

                <Route element={<ProtectedRoute isAuthenticated={isAuthenticated} />}>
                    <Route path="/role-select" element={<RoleSelectPage />} />
                    <Route path="/identity-verification" element={<AccountIdentityVerificationPage />} />
                    <Route path="/profile" element={<AccountProfilePage />} />
                </Route>

            <Route element={<RoleRoute role="user" hasRole={hasRole} isAuthenticated={isAuthenticated} activeRole={activeRole} selectRole={selectRole} />}>
                <Route path="/user/therapists" element={<UserTherapistSearchPage />} />
                <Route path="/user/therapists/:publicId/availability" element={<UserTherapistAvailabilityPage />} />
                <Route path="/user/booking-request" element={<BookingFlowLayout />}>
                    <Route index element={<UserBookingRequestPage />} />
                    <Route path="quote" element={<UserBookingQuotePage />} />
                    <Route path="payment" element={<UserBookingPaymentPage />} />
                    <Route path="waiting" element={<UserBookingWaitingPage />} />
                </Route>
                <Route
                    path="/user"
                    element={<DashboardLayout role="user" title="利用者ダッシュボード" description="検索、予約、メッセージ、安全導線の入口です。" navItems={userNavItems} />}
                >
                    <Route
                        index
                        element={
                            <SectionHomePage
                                eyebrow="利用者マイページ"
                                title="利用者ダッシュボード"
                                description="検索から予約、レビュー、通報までの利用者フローをここから組み上げていきます。"
                                actions={[
                                    { label: 'セラピストを探す', to: '/user/therapists', description: '検索一覧、詳細、空き枠の導線をつなぎます。' },
                                    { label: '予約一覧', to: '/user/bookings', description: '進行中の予約や未読メッセージへすぐ戻れます。' },
                                    { label: '待ち合わせ場所', to: '/user/service-addresses', description: '来てほしい場所とデフォルト住所を管理します。' },
                                ]}
                            />
                        }
                    />
                    <Route path="bookings" element={<UserBookingsPage />} />
                    <Route path="bookings/:publicId" element={<UserBookingDetailPage />} />
                    <Route path="bookings/:publicId/messages" element={<UserBookingMessagesPage />} />
                    <Route path="bookings/:publicId/review" element={<UserBookingReviewPage />} />
                    <Route path="bookings/:publicId/cancel" element={<UserBookingCancelPage />} />
                    <Route path="bookings/:publicId/no-show" element={<UserBookingNoShowPage />} />
                    <Route path="bookings/:publicId/refund" element={<UserBookingRefundPage />} />
                    <Route path="bookings/:publicId/report" element={<UserBookingReportPage />} />
                    <Route path="identity-verification" element={<UserIdentityVerificationPage />} />
                    <Route path="profile" element={<UserProfilePage />} />
                    <Route path="reports" element={<UserReportsPage />} />
                    <Route path="blocks" element={<UserBlocksPage />} />
                    <Route path="service-addresses" element={<UserServiceAddressesPage />} />
                    <Route path="therapists/:publicId/travel-request" element={<UserTherapistTravelRequestPage />} />
                    {userPlaceholderRoutes
                        .filter(
                            (route) =>
                                route.path !== 'therapists'
                                && route.path !== 'bookings'
                                && route.path !== 'bookings/:publicId'
                                && route.path !== 'bookings/:publicId/messages'
                                && route.path !== 'bookings/:publicId/review'
                                && route.path !== 'bookings/:publicId/cancel'
                                && route.path !== 'bookings/:publicId/refund'
                                && route.path !== 'bookings/:publicId/report'
                                && route.path !== 'identity-verification'
                                && route.path !== 'profile'
                                && route.path !== 'reports'
                                && route.path !== 'blocks'
                                && route.path !== 'service-addresses'
                                && route.path !== 'booking-request'
                                && route.path !== 'booking-request/quote'
                                && route.path !== 'booking-request/payment'
                                && route.path !== 'booking-request/waiting'
                                && route.path !== 'therapists/:publicId'
                                && route.path !== 'therapists/:publicId/availability'
                                && route.path !== 'therapists/:publicId/travel-request'
                        )
                        .map((route) => (
                        <Route
                            key={route.path}
                            path={route.path}
                            element={<PlaceholderScreen title={route.title} description={route.description} apiPath={route.apiPath} />}
                        />
                        ))}
                </Route>
            </Route>

            <Route
                element={<RoleRoute role="therapist" hasRole={hasRole} isAuthenticated={isAuthenticated} activeRole={activeRole} selectRole={selectRole} />}
            >
                <Route
                    path="/therapist"
                    element={
                        <DashboardLayout
                            role="therapist"
                            title="セラピストダッシュボード"
                            description="公開準備、空き枠、予約依頼、売上確認の入口です。"
                            navItems={therapistNavItems}
                        />
                    }
                >
                    <Route
                        index
                        element={
                            <SectionHomePage
                                eyebrow="セラピストマイページ"
                                title="セラピストダッシュボード"
                                description="プロフィール審査から空き枠、料金ルール、売上管理までをここからつないでいきます。"
                                actions={[
                                    { label: '準備状況', to: '/therapist/onboarding', description: '本人確認、プロフィール、Stripe の進み具合を確認します。' },
                                    { label: 'プロフィール編集', to: '/therapist/profile', description: '公開プロフィールと審査状態を確認します。' },
                                    { label: '空き枠管理', to: '/therapist/availability', description: '予定予約設定と公開枠を管理します。' },
                                    { label: '予約管理', to: '/therapist/bookings', description: '承諾待ちから進行中、完了まで同じ画面で確認します。' },
                                    { label: '設定', to: '/therapist/settings', description: '稼働状態、現在地、通知をまとめて確認します。' },
                                ]}
                            />
                        }
                    />
                    <Route path="onboarding" element={<TherapistOnboardingPage />} />
                    <Route path="identity-verification" element={<TherapistIdentityVerificationPage />} />
                    <Route path="stripe-connect" element={<TherapistStripeConnectPage />} />
                    <Route path="photos" element={<Navigate to="/therapist/profile#profile-photos" replace />} />
                    <Route path="profile" element={<TherapistProfilePage />} />
                    <Route path="pricing" element={<TherapistPricingPage />} />
                    <Route path="availability" element={<TherapistAvailabilityPage />} />
                    <Route path="requests" element={<Navigate to="/therapist/bookings?group=requested" replace />} />
                    <Route path="requests/:publicId" element={<TherapistRequestsPage />} />
                    <Route path="reviews" element={<TherapistReviewsPage />} />
                    <Route path="bookings" element={<TherapistBookingsPage />} />
                    <Route path="bookings/:publicId" element={<TherapistBookingDetailPage />} />
                    <Route path="bookings/:publicId/no-show" element={<TherapistBookingNoShowPage />} />
                    <Route path="bookings/:publicId/messages" element={<TherapistBookingMessagesPage />} />
                    <Route path="travel-requests" element={<TherapistTravelRequestsPage />} />
                    <Route path="travel-requests/:publicId" element={<TherapistTravelRequestsPage />} />
                    <Route path="balance" element={<TherapistBalancePage />} />
                    <Route path="payouts" element={<Navigate to="/therapist/balance" replace />} />
                    <Route path="settings" element={<TherapistSettingsPage />} />
                    {therapistPlaceholderRoutes
                        .filter((route) => !['onboarding', 'identity-verification', 'stripe-connect', 'photos', 'profile', 'pricing', 'availability', 'requests', 'requests/:publicId', 'reviews', 'bookings', 'bookings/:publicId', 'bookings/:publicId/messages', 'travel-requests', 'travel-requests/:publicId', 'balance', 'payouts', 'settings'].includes(route.path))
                        .map((route) => (
                        <Route
                            key={route.path}
                            path={route.path}
                            element={<PlaceholderScreen title={route.title} description={route.description} apiPath={route.apiPath} />}
                        />
                        ))}
                </Route>
            </Route>

            <Route element={<RoleRoute role="admin" hasRole={hasRole} isAuthenticated={isAuthenticated} activeRole={activeRole} selectRole={selectRole} />}>
                <Route
                    path="/admin"
                    element={<DashboardLayout role="admin" title="運営ダッシュボード" description="監視、審査、法務、料金運用の入口です。" navItems={adminNavItems} />}
                >
                    <Route index element={<AdminDashboardPage />} />
                    <Route path="accounts" element={<AdminAccountsPage />} />
                    <Route path="accounts/:publicId" element={<AdminAccountsPage />} />
                    <Route path="identity-verifications" element={<AdminIdentityVerificationsPage />} />
                    <Route path="therapist-profiles" element={<AdminTherapistProfilesPage />} />
                    <Route path="therapist-profiles/:publicId" element={<AdminTherapistProfilesPage />} />
                    <Route path="profile-photos" element={<AdminProfilePhotosPage />} />
                    <Route path="bookings" element={<AdminBookingsPage />} />
                    <Route path="bookings/:publicId" element={<AdminBookingsPage />} />
                    <Route path="bookings/:publicId/messages" element={<AdminBookingMessagesPage />} />
                    <Route path="reports" element={<AdminReportsPage />} />
                    <Route path="reports/:publicId" element={<AdminReportsPage />} />
                    <Route path="refund-requests" element={<AdminRefundRequestsPage />} />
                    <Route path="payout-requests" element={<AdminPayoutRequestsPage />} />
                    <Route path="stripe-disputes" element={<AdminStripeDisputesPage />} />
                    <Route path="contact-inquiries" element={<AdminContactInquiriesPage />} />
                    <Route path="contact-inquiries/:publicId" element={<AdminContactInquiriesPage />} />
                    <Route path="travel-requests" element={<AdminTravelRequestsPage />} />
                    <Route path="travel-requests/:publicId" element={<AdminTravelRequestsPage />} />
                    <Route path="pricing-rules" element={<AdminPricingRulesPage />} />
                    <Route path="pricing-rules/:id" element={<AdminPricingRulesPage />} />
                    <Route path="legal-documents" element={<AdminLegalDocumentsPage />} />
                    <Route path="platform-fee-settings" element={<AdminPlatformFeeSettingsPage />} />
                    <Route path="audit-logs" element={<AdminAuditLogsPage />} />
                    {adminPlaceholderRoutes
                        .filter((route) => ![
                            'accounts',
                            'accounts/:publicId',
                            'identity-verifications',
                            'therapist-profiles',
                            'therapist-profiles/:publicId',
                            'profile-photos',
                            'bookings',
                            'bookings/:publicId',
                            'bookings/:publicId/messages',
                            'reports',
                            'reports/:publicId',
                            'refund-requests',
                            'payout-requests',
                            'stripe-disputes',
                            'contact-inquiries',
                            'contact-inquiries/:publicId',
                            'travel-requests',
                            'travel-requests/:publicId',
                            'pricing-rules',
                            'pricing-rules/:id',
                            'legal-documents',
                            'platform-fee-settings',
                            'audit-logs',
                        ].includes(route.path))
                        .map((route) => (
                        <Route
                            key={route.path}
                            path={route.path}
                            element={<PlaceholderScreen title={route.title} description={route.description} apiPath={route.apiPath} />}
                        />
                        ))}
                </Route>
            </Route>

                <Route path="*" element={<NotFoundPage />} />
            </Routes>
            <ActiveUserBookingDock />
        </>
    );
}

function GuestOnlyRoute({
    accountPath,
    isAuthenticated,
}: {
    accountPath: string;
    isAuthenticated: boolean;
}) {
    if (isAuthenticated) {
        return <Navigate to={accountPath} replace />;
    }

    return <Outlet />;
}

function ProtectedRoute({ isAuthenticated }: { isAuthenticated: boolean }) {
    const location = useLocation();

    if (!isAuthenticated) {
        return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
    }

    return <Outlet />;
}

function RoleRoute({
    role,
    hasRole,
    isAuthenticated,
    activeRole,
    selectRole,
}: {
    role: RoleName;
    hasRole: (role: RoleName) => boolean;
    isAuthenticated: boolean;
    activeRole: RoleName | null;
    selectRole: (role: RoleName) => void;
}) {
    const location = useLocation();

    useEffect(() => {
        if (isAuthenticated && hasRole(role) && activeRole !== role) {
            selectRole(role);
        }
    }, [activeRole, hasRole, isAuthenticated, role, selectRole]);

    if (!isAuthenticated) {
        return <Navigate to={role === 'admin' ? '/admin/login' : '/login'} replace state={{ from: `${location.pathname}${location.search}` }} />;
    }

    if (!hasRole(role)) {
        return <Navigate to="/role-select" replace />;
    }

    return <Outlet />;
}

function LegacyUserTherapistDetailRedirect() {
    const location = useLocation();
    const { publicId } = useParams();

    if (!publicId) {
        return <Navigate to="/" replace />;
    }

    return <Navigate to={`/therapists/${publicId}${location.search}`} replace />;
}

export function App() {
    return (
        <BrowserRouter>
            <ToastProvider>
                <AuthProvider>
                    <NotificationProvider>
                        <AppRoutes />
                        <PushOptInModal />
                    </NotificationProvider>
                </AuthProvider>
            </ToastProvider>
        </BrowserRouter>
    );
}
