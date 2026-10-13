import { lazy, type ComponentType } from "react";

/*
 * Every page is its own chunk, loaded the first time it is opened, so signing in doesn't wait for the whole
 * app. The shell shows a skeleton meanwhile (AppShell's Suspense).
 */

const RELOADED = "hourline-reloaded-for-update";

/**
 * A page's code. If it can't be fetched (usually because a new version went out and the old files are gone),
 * the app reloads once to pick up the new one; a second failure shows the page's error.
 */
export function load<M>(importer: () => Promise<M>, reload = () => window.location.reload()): () => Promise<M> {
    return () => importer().then(
        (m) => { forget(); return m; },
        (error: unknown) => {
            // without session storage (blocked site data) it can't tell a second failure, so it doesn't reload
            if (reloaded() || !remember()) throw error;
            reload();
            return new Promise<M>(() => {});
        },
    );
}

// Session storage throws when the browser blocks site data.
function reloaded() {
    try { return !!sessionStorage.getItem(RELOADED); } catch { return false; }
}
function remember() {
    try { sessionStorage.setItem(RELOADED, "1"); return true; } catch { return false; }
}
function forget() {
    try { sessionStorage.removeItem(RELOADED); } catch { /* nothing to forget */ }
}

const page = <M extends { default: ComponentType }>(importer: () => Promise<M>) => lazy(load(importer));
const named = <M, K extends keyof M>(importer: () => Promise<M>, name: K) =>
    lazy(() => load(importer)().then((m) => ({ default: m[name] as ComponentType })));

export const ClientPage = page(() => import("@/domains/shared/clients/ClientPage"));
export const ClientsPage = page(() => import("@/domains/shared/clients/ClientsPage"));
export const MeetingsPage = named(() => import("@/domains/shared/meetings/Meetings"), "MeetingsPage");
export const ProjectRoute = page(() => import("@/domains/shared/projects/ProjectRoute"));
export const ProjectsPage = page(() => import("@/domains/shared/projects/ProjectsPage"));
export const MyWorkRoute = page(() => import("@/domains/shared/requirements/MyWorkRoute"));
export const SettingsPage = page(() => import("@/domains/shared/settings/SettingsPage"));
export const CompanySettingsPage = named(() => import("@/domains/shared/settings/SettingsPage"), "CompanySettingsPage");
export const CompanyProfilePage = page(() => import("@/domains/company/profile/CompanyProfilePage"));
export const CompanyExpensesPage = page(() => import("@/domains/company/CompanyExpensesPage"));
export const CompanyOverviewPage = page(() => import("@/domains/company/CompanyOverviewPage"));
export const ProjectPayPage = page(() => import("@/domains/company/projectPay/ProjectPayPage"));
export const SalariesPage = page(() => import("@/domains/company/salaries/SalariesPage"));
export const SchedulesPage = page(() => import("@/domains/company/schedules/SchedulesPage"));
export const ProtonBudgetPage = page(() => import("@/domains/company/proton/ProtonBudgetPage"));
export const MessagesPage = page(() => import("@/domains/shared/messages/MessagesPage"));
export const ProtonPage = page(() => import("@/domains/shared/proton/ProtonPage"));
export const NotificationsPage = page(() => import("@/domains/shared/notifications/NotificationsPage"));
export const HelpPage = page(() => import("@/domains/shared/help/HelpPage"));
export const MyPayPage = page(() => import("@/domains/design/pay/MyPayPage"));
export const ActivityPage = page(() => import("@/domains/design/activity/ActivityPage"));
export const OverviewRoute = page(() => import("@/domains/design/dashboard/OverviewPage"));
export const FinancialsRoute = page(() => import("@/domains/design/financials/FinancialsPage"));
export const PeoplePage = page(() => import("@/domains/design/people/PeoplePage"));
export const PersonProfilePage = named(() => import("@/domains/design/people/ProfilePage"), "PersonProfilePage");
export const MyProfilePage = named(() => import("@/domains/design/people/ProfilePage"), "MyProfilePage");
export const ReportsPage = page(() => import("@/domains/design/reports/ReportsPage"));
export const KitGallery = import.meta.env.DEV ? page(() => import("@/app/pages/KitGallery")) : () => null;

// signed-out pages: someone signed in never needs them
export const SignInPage = page(() => import("@/auth/SignInPage"));
export const ForgotPasswordPage = page(() => import("@/auth/ForgotPasswordPage"));
export const ResetPasswordPage = page(() => import("@/auth/ResetPasswordPage"));
export const AcceptInvitationPage = page(() => import("@/auth/AcceptInvitationPage"));
export const ChangePasswordPage = page(() => import("@/auth/ChangePasswordPage"));

// the client portal: its own pages and session, apart from the staff app
export const PortalRoot = page(() => import("@/portal/PortalRoot"));
export const PortalSignInPage = page(() => import("@/portal/pages/PortalSignInPage"));
export const PortalInvitePage = page(() => import("@/portal/pages/PortalInvitePage"));
export const PortalForgotPasswordPage = page(() => import("@/portal/pages/PortalForgotPasswordPage"));
export const PortalResetPasswordPage = page(() => import("@/portal/pages/PortalResetPasswordPage"));
export const PortalHomePage = page(() => import("@/portal/pages/PortalHomePage"));
export const RequirePortalSession = page(() => import("@/portal/RequirePortalSession"));
