import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { BrowserRouter, Outlet, Route, Routes } from "react-router";
import { createQueryClient } from "@/api/queryClient";
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
import { companyRoutes, domainRoutes } from "@/app/routing/routeTable";
import { SessionProvider } from "@/app/session/SessionProvider";
import AppShell from "@/app/shell/AppShell";
import CompanyLauncher from "@/app/shell/CompanyLauncher";
import AcceptInvitationPage from "@/auth/AcceptInvitationPage";
import ChangePasswordPage from "@/auth/ChangePasswordPage";
import ForgotPasswordPage from "@/auth/ForgotPasswordPage";
import ResetPasswordPage from "@/auth/ResetPasswordPage";
import SignInPage from "@/auth/SignInPage";
import Toasts from "@/shared/components/Feedback/Toasts";
import TipHost from "@/shared/components/Overlays/TipHost";
import KitGallery from "@/app/pages/KitGallery";

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
            <Outlet />
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

                <Route element={<RequireSession />}>
                    <Route path="/change-password" element={<ChangePasswordPage />} />
                    <Route element={<RequirePasswordChanged />}>
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

                <Route path="*" element={<NotFound />} />
            </Route>
        </Routes>
    );
}
