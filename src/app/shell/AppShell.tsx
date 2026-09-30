import { lazy, Suspense, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import Skeleton, { SkeletonKpis, SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { cx } from "@/shared/utils/cx";
import { LogWorkHost } from "@/domains/design/work/LogWorkHost";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { useCompanySettings } from "./shellQueries";
import { useArea } from "./useArea";

// opened with ⌘K, so it loads then
const CommandPalette = lazy(() => import("./CommandPalette"));

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
    useCompanySettings();

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
                <Suspense fallback={<PageLoading />}>
                    <Outlet />
                </Suspense>
            </div>
            {palette && <Suspense fallback={null}><CommandPalette area={area} onClose={() => setPalette(false)} /></Suspense>}
            <LogWorkHost />
        </div>
    );
}
