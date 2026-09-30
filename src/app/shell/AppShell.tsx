import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { cx } from "@/shared/utils/cx";
import CommandPalette from "./CommandPalette";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { useCompanySettings } from "./shellQueries";
import { useArea } from "./useArea";

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
                <Outlet />
            </div>
            {palette && <CommandPalette area={area} onClose={() => setPalette(false)} />}
        </div>
    );
}
