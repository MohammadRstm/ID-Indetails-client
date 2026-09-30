import { lazy, type ComponentType } from "react";

/*
 * Every page is its own chunk, loaded the first time it is opened, so signing in doesn't wait for the whole
 * app. The shell shows a skeleton meanwhile (AppShell's Suspense).
 */

const named = <M, K extends keyof M>(load: () => Promise<M>, name: K) =>
    lazy(() => load().then((m) => ({ default: m[name] as ComponentType })));

export const ClientPage = lazy(() => import("@/domains/shared/clients/ClientPage"));
export const ClientsPage = lazy(() => import("@/domains/shared/clients/ClientsPage"));
export const MeetingsPage = named(() => import("@/domains/shared/meetings/Meetings"), "MeetingsPage");
export const EmployeeProjectsRoute = named(() => import("@/domains/shared/projects/EmployeeProjectRoutes"), "EmployeeProjectsRoute");
export const EmployeeProjectRoute = named(() => import("@/domains/shared/projects/EmployeeProjectRoutes"), "EmployeeProjectRoute");
export const ProjectRoute = lazy(() => import("@/domains/shared/projects/ProjectRoute"));
export const ProjectsPage = lazy(() => import("@/domains/shared/projects/ProjectsPage"));
export const MyWorkRoute = lazy(() => import("@/domains/shared/requirements/MyWorkRoute"));
export const SettingsPage = lazy(() => import("@/domains/shared/settings/SettingsPage"));
export const CompanyExpensesPage = lazy(() => import("@/domains/company/CompanyExpensesPage"));
export const CompanyOverviewPage = lazy(() => import("@/domains/company/CompanyOverviewPage"));
export const ProjectPayPage = lazy(() => import("@/domains/company/projectPay/ProjectPayPage"));
export const SalariesPage = lazy(() => import("@/domains/company/salaries/SalariesPage"));
export const SchedulesPage = lazy(() => import("@/domains/company/schedules/SchedulesPage"));
export const MessagesPage = lazy(() => import("@/domains/shared/messages/MessagesPage"));
export const NotificationsPage = lazy(() => import("@/domains/shared/notifications/NotificationsPage"));
export const MyPayPage = lazy(() => import("@/domains/design/pay/MyPayPage"));
export const ActivityPage = lazy(() => import("@/domains/design/activity/ActivityPage"));
export const OverviewRoute = lazy(() => import("@/domains/design/dashboard/OverviewPage"));
export const FinancialsRoute = lazy(() => import("@/domains/design/financials/FinancialsPage"));
export const PeoplePage = lazy(() => import("@/domains/design/people/PeoplePage"));
export const PersonProfilePage = named(() => import("@/domains/design/people/ProfilePage"), "PersonProfilePage");
export const MyProfilePage = named(() => import("@/domains/design/people/ProfilePage"), "MyProfilePage");
export const ReportsPage = lazy(() => import("@/domains/design/reports/ReportsPage"));
export const KitGallery = lazy(() => import("@/app/pages/KitGallery"));

// signed-out pages: someone signed in never needs them
export const SignInPage = lazy(() => import("@/auth/SignInPage"));
export const ForgotPasswordPage = lazy(() => import("@/auth/ForgotPasswordPage"));
export const ResetPasswordPage = lazy(() => import("@/auth/ResetPasswordPage"));
export const AcceptInvitationPage = lazy(() => import("@/auth/AcceptInvitationPage"));
export const ChangePasswordPage = lazy(() => import("@/auth/ChangePasswordPage"));
