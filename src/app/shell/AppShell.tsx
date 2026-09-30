import { lazy, Suspense, useEffect, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Outlet, useLocation } from "react-router";
import CrashScreen from "@/app/pages/CrashScreen";
import { load } from "@/app/routing/pages";
import { errorMessage } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import Skeleton, { SkeletonKpis, SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { cx } from "@/shared/utils/cx";
import { LogWorkHost } from "@/domains/design/work/LogWorkHost";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { useCompanySettings } from "./shellQueries";
import { useArea } from "./useArea";

// opened with ⌘K, so it loads then
const CommandPalette = lazy(load(() => import("./CommandPalette")));

/** A page's shape while its code loads, the first time it is opened. */
function PageLoading() {
    return (
        <div className="page" aria-busy="true">
            <div className="page-head">
                <div>
                    <Skeleton width={220} height={22} />
                    <Skeleton width={340} height={11} style={{ marginTop: 10 }} />
                </div>
            </div>
            <SkeletonKpis count={4} />
            <div className="panel mt"><div className="panel-body"><SkeletonLines lines={6} /></div></div>
        </div>
    );
}

/** The signed-in frame: sidebar, top bar and the page (the prototype's .app grid). */
export default function AppShell() {
    const location = useLocation();
    // The phone menu stays open only on the page it was opened on: moving to another page closes it.
    const [navOpenOn, setNavOpenOn] = useState<string | null>(null);
    const navOpen = navOpenOn === location.pathname;
    const setNavOpen = (open: boolean) => setNavOpenOn(open ? location.pathname : null);
    const [palette, setPalette] = useState(false);
    const area = useArea();
    const company = useCompanySettings();
    // times and weeks follow the company's settings, so the page waits for them (a failure falls back to defaults)
    const formatsKnown = !!company.data || company.isError;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setPalette(true);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    // Only a new page scrolls to the top: a query change (?tab=, ?entry=) is the same page.
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [location.pathname]);

    return (
        <div className={cx("app", navOpen && "nav-open")}>
            <div className="scrim-nav" onClick={() => setNavOpen(false)} />
            <Sidebar area={area} />
            <div className="main">
                <TopBar area={area} onMenu={() => setNavOpen(!navOpen)} onSearch={() => setPalette(true)} />
                {/* a page that fails keeps the shell around it, and moving to another page clears it */}
                <ErrorBoundary FallbackComponent={CrashScreen} resetKeys={[location.pathname]}>
                    <Suspense fallback={<PageLoading />}>
                        {formatsKnown ? <Outlet /> : <PageLoading />}
                    </Suspense>
                </ErrorBoundary>
            </div>
            {palette && (
                // a failure closes the palette only, not the whole app around it
                <ErrorBoundary fallback={null} onError={(e) => { setPalette(false); toast({ text: "Search didn't open", sub: errorMessage(e), icon: "alert" }); }}>
                    <Suspense fallback={null}><CommandPalette area={area} onClose={() => setPalette(false)} /></Suspense>
                </ErrorBoundary>
            )}
            <LogWorkHost />
        </div>
    );
}
