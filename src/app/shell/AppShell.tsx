import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { cx } from "@/shared/utils/cx";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { useCompanySettings } from "./shellQueries";
import { useArea } from "./useArea";

/** The signed-in frame: sidebar, top bar and the page (the prototype's .app grid). */
export default function AppShell() {
    const [navOpen, setNavOpen] = useState(false);
    const location = useLocation();
    const area = useArea();
    useCompanySettings();

    // Only a new page scrolls to the top: a query change (?tab=, ?entry=) is the same page.
    useEffect(() => {
        window.scrollTo(0, 0);
        setNavOpen(false);
    }, [location.pathname]);

    return (
        <div className={cx("app", navOpen && "nav-open")}>
            <div className="scrim-nav" onClick={() => setNavOpen(false)} />
            <Sidebar area={area} />
            <div className="main">
                <TopBar area={area} onMenu={() => setNavOpen((open) => !open)} />
                <Outlet />
            </div>
        </div>
    );
}
