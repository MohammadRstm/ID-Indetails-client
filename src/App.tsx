import { QueryClientProvider } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { BrowserRouter, Outlet, Route, Routes } from "react-router";
import { createQueryClient } from "@/api/queryClient";
import BootScreen from "@/app/pages/BootScreen";
import CrashScreen from "@/app/pages/CrashScreen";
import NoAccess from "@/app/pages/NoAccess";
import NotFound from "@/app/pages/NotFound";
import {
    CompanyPage,
    DomainGuard,
    DomainPage,
    HomeRedirect,
    PublicOnly,
    RequirePasswordChanged,
    RequireSession,
} from "@/app/routing/guards";
import {
    AcceptInvitationPage,
    ChangePasswordPage,
    ForgotPasswordPage,
    KitGallery,
    PortalForgotPasswordPage,
    PortalHomePage,
    PortalInvitePage,
    PortalProjectPage,
    PortalResetPasswordPage,
    PortalRoot,
    PortalSignInPage,
    RequirePortalSession,
    ResetPasswordPage,
    SignInPage,
} from "@/app/routing/pages";
import { companyRoutes, domainRoutes } from "@/app/routing/routeTable";
import { SessionProvider } from "@/app/session/SessionProvider";
import LiveRoute from "@/app/live/LiveRoute";
import AppShell from "@/app/shell/AppShell";
import CompanyLauncher from "@/app/shell/CompanyLauncher";
import Toasts from "@/shared/components/Feedback/Toasts";
import TipHost from "@/shared/components/Overlays/TipHost";

export default function App() {
    const [queryClient] = useState(createQueryClient);
    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <SessionProvider>
                    <AppRoutes />
                    <Toasts />
                    <TipHost />
                </SessionProvider>
            </BrowserRouter>
        </QueryClientProvider>
    );
}

/** A page that throws while rendering shows a calm error instead of a blank screen. */
function Boundary() {
    return (
        <ErrorBoundary FallbackComponent={CrashScreen}>
            {/* the signed-out pages load on demand; the shell has its own page skeleton */}
            <Suspense fallback={<BootScreen />}>
                <Outlet />
            </Suspense>
        </ErrorBoundary>
    );
}

export function AppRoutes() {
    return (
        <Routes>
            <Route element={<Boundary />}>
                <Route path="/login" element={<PublicOnly><SignInPage /></PublicOnly>} />
                <Route path="/forgot-password" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/accept-invitation" element={<PublicOnly><AcceptInvitationPage /></PublicOnly>} />

                {/* The client portal: its own session and pages, outside the staff guards and shell. */}
                <Route path="/portal" element={<PortalRoot />}>
                    <Route path="login" element={<PortalSignInPage />} />
                    <Route path="invite" element={<PortalInvitePage />} />
                    <Route path="forgot-password" element={<PortalForgotPasswordPage />} />
                    <Route path="reset-password" element={<PortalResetPasswordPage />} />
                    <Route element={<RequirePortalSession />}>
                        <Route index element={<PortalHomePage />} />
                        <Route path="projects/:projectId" element={<PortalProjectPage />} />
                    </Route>
                    <Route path="*" element={<NotFound />} />
                </Route>

                <Route element={<RequireSession />}>
                    <Route path="/change-password" element={<ChangePasswordPage />} />
                    <Route element={<RequirePasswordChanged />}>
                        <Route element={<LiveRoute />}>
                            <Route index element={<HomeRedirect />} />
                            <Route path="/no-access" element={<NoAccess />} />
                            <Route path="/company" element={<CompanyLauncher />} />
                            {import.meta.env.DEV && <Route path="/dev/kit" element={<KitGallery />} />}

                            <Route element={<AppShell />}>
                                <Route path="/company">
                                    {companyRoutes.map((route) => (
                                        <Route key={route.path} path={route.path} element={<CompanyPage route={route} />} />
                                    ))}
                                </Route>
                                <Route path="/:domain" element={<DomainGuard />}>
                                    <Route index element={<HomeRedirect />} />
                                    {domainRoutes.map((route) => (
                                        <Route key={route.path} path={route.path} element={<DomainPage route={route} />} />
                                    ))}
                                    <Route path="*" element={<NotFound />} />
                                </Route>
                            </Route>
                        </Route>
                    </Route>
                </Route>

                <Route path="*" element={<NotFound />} />
            </Route>
        </Routes>
    );
}
