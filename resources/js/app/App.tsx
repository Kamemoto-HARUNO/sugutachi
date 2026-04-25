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
import { LoadingScreen } from './components/LoadingScreen';
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
import { PublicLayout } from './layouts/PublicLayout';
import { HelpPage } from './pages/HelpPage';
import { LegalDocumentPage } from './pages/LegalDocumentPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PublicHomePage } from './pages/PublicHomePage';
import { RegisterPage } from './pages/RegisterPage';
import { RoleSelectPage } from './pages/RoleSelectPage';
import { SectionHomePage } from './pages/SectionHomePage';
import { TherapistIdentityVerificationPage } from './pages/TherapistIdentityVerificationPage';
import { TherapistOnboardingPage } from './pages/TherapistOnboardingPage';
import { TherapistProfilePage } from './pages/TherapistProfilePage';
import { TherapistStripeConnectPage } from './pages/TherapistStripeConnectPage';
import { UserBookingDetailPage } from './pages/UserBookingDetailPage';
import { UserBookingMessagesPage } from './pages/UserBookingMessagesPage';
import { UserBookingReviewPage } from './pages/UserBookingReviewPage';
import { UserBookingsPage } from './pages/UserBookingsPage';
import { UserBookingQuotePage } from './pages/UserBookingQuotePage';
import { UserBookingRequestPage } from './pages/UserBookingRequestPage';
import { UserServiceAddressesPage } from './pages/UserServiceAddressesPage';
import { UserTherapistAvailabilityPage } from './pages/UserTherapistAvailabilityPage';
import { UserTherapistDetailPage } from './pages/UserTherapistDetailPage';
import { UserTherapistSearchPage } from './pages/UserTherapistSearchPage';
import { AuthProvider } from './providers/AuthProvider';

function AppRoutes() {
    const { account, activeRole, hasRole, isAuthenticated, isBootstrapping, selectRole } = useAuth();

    if (isBootstrapping) {
        return <LoadingScreen title="起動中" message="認証状態とアプリ設定を確認しています。" />;
    }

    return (
        <Routes>
            <Route path="/" element={<PublicHomePage />} />
            <Route path="/therapists/:publicId" element={<UserTherapistDetailPage />} />
            <Route path="/user/therapists/:publicId" element={<LegacyUserTherapistDetailRedirect />} />

            <Route element={<PublicLayout />}>
                <Route path="/help" element={<HelpPage />} />
                <Route path="/terms" element={<LegalDocumentPage documentType="terms" title="利用規約" />} />
                <Route path="/privacy" element={<LegalDocumentPage documentType="privacy" title="プライバシーポリシー" />} />
                <Route path="/commerce" element={<LegalDocumentPage documentType="commerce" title="特定商取引法に基づく表記" />} />
                <Route path="/contact" element={<PlaceholderScreen title="お問い合わせ" description="問い合わせフォームと送信完了導線をつなぐ画面です。" apiPath="/api/contact" />} />
                <Route element={<GuestOnlyRoute isAuthenticated={isAuthenticated} accountPath={getPostAuthPath(account, activeRole)} />}>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/admin/login" element={<LoginPage targetRole="admin" />} />
                </Route>
            </Route>

            <Route element={<ProtectedRoute isAuthenticated={isAuthenticated} />}>
                <Route path="/role-select" element={<RoleSelectPage />} />
                <Route path="/identity-verification" element={<PlaceholderScreen title="共通本人確認導線" description="役割別の本人確認画面へつなぐ共通入口です。" apiPath="/api/me/identity-verification" />} />
                <Route path="/profile" element={<PlaceholderScreen title="共通プロフィール導線" description="役割に応じたプロフィール設定へ案内する入口です。" apiPath="/api/me/profile" />} />
            </Route>

            <Route element={<RoleRoute role="user" hasRole={hasRole} isAuthenticated={isAuthenticated} activeRole={activeRole} selectRole={selectRole} />}>
                <Route path="/user/therapists" element={<UserTherapistSearchPage />} />
                <Route path="/user/therapists/:publicId/availability" element={<UserTherapistAvailabilityPage />} />
                <Route
                    path="/user"
                    element={<DashboardLayout role="user" title="利用者ダッシュボード" description="検索、予約、メッセージ、安全導線の入口です。" navItems={userNavItems} />}
                >
                    <Route
                        index
                        element={
                            <SectionHomePage
                                eyebrow="User Workspace"
                                title="利用者ダッシュボード"
                                description="検索から予約、レビュー、通報までの利用者フローをここから組み上げていきます。"
                                actions={[
                                    { label: 'セラピストを探す', to: '/user/therapists', description: '検索一覧、詳細、空き枠の導線をつなぎます。' },
                                    { label: '予約一覧', to: '/user/bookings', description: '進行中の予約や未読メッセージへすぐ戻れます。' },
                                    { label: '施術場所', to: '/user/service-addresses', description: '来てほしい場所とデフォルト住所を管理します。' },
                                ]}
                            />
                        }
                    />
                    <Route path="bookings" element={<UserBookingsPage />} />
                    <Route path="bookings/:publicId" element={<UserBookingDetailPage />} />
                    <Route path="bookings/:publicId/messages" element={<UserBookingMessagesPage />} />
                    <Route path="bookings/:publicId/review" element={<UserBookingReviewPage />} />
                    <Route path="service-addresses" element={<UserServiceAddressesPage />} />
                    <Route path="booking-request" element={<UserBookingRequestPage />} />
                    <Route path="booking-request/quote" element={<UserBookingQuotePage />} />
                    {userPlaceholderRoutes
                        .filter(
                            (route) =>
                                route.path !== 'therapists'
                                && route.path !== 'bookings'
                                && route.path !== 'bookings/:publicId'
                                && route.path !== 'bookings/:publicId/messages'
                                && route.path !== 'bookings/:publicId/review'
                                && route.path !== 'service-addresses'
                                && route.path !== 'booking-request'
                                && route.path !== 'booking-request/quote'
                                && route.path !== 'therapists/:publicId'
                                && route.path !== 'therapists/:publicId/availability',
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
                                eyebrow="Therapist Workspace"
                                title="セラピストダッシュボード"
                                description="プロフィール審査から空き枠、料金ルール、売上管理までをここからつないでいきます。"
                                actions={[
                                    { label: '準備状況', to: '/therapist/onboarding', description: '本人確認、プロフィール、Stripe の進み具合を確認します。' },
                                    { label: 'プロフィール編集', to: '/therapist/profile', description: '公開プロフィールと審査状態を確認します。' },
                                    { label: '空き枠管理', to: '/therapist/availability', description: '予定予約設定と公開枠を管理します。' },
                                    { label: '予約依頼一覧', to: '/therapist/requests', description: '今すぐ予約と予定予約の依頼を確認します。' },
                                ]}
                            />
                        }
                    />
                    <Route path="onboarding" element={<TherapistOnboardingPage />} />
                    <Route path="identity-verification" element={<TherapistIdentityVerificationPage />} />
                    <Route path="stripe-connect" element={<TherapistStripeConnectPage />} />
                    <Route path="profile" element={<TherapistProfilePage />} />
                    {therapistPlaceholderRoutes
                        .filter((route) => !['onboarding', 'identity-verification', 'stripe-connect', 'profile'].includes(route.path))
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
                    <Route
                        index
                        element={
                            <SectionHomePage
                                eyebrow="Admin Workspace"
                                title="運営ダッシュボード"
                                description="既に実装済みの管理 API へつながるルートをここからフロントに載せていきます。"
                                actions={[
                                    { label: 'アカウント監視', to: '/admin/accounts', description: '停止・復旧・詳細確認の導線です。' },
                                    { label: '予約監視', to: '/admin/bookings', description: '決済、返金、メッセージ監視へ進めます。' },
                                    { label: '通報対応', to: '/admin/reports', description: '未解決通報と運営アクションを確認します。' },
                                ]}
                            />
                        }
                    />
                    {adminPlaceholderRoutes.map((route) => (
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
            <AuthProvider>
                <AppRoutes />
            </AuthProvider>
        </BrowserRouter>
    );
}
