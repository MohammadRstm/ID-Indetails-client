import { useSearchParams } from "react-router";
import { useDomain } from "@/app/routing/domainContext";
import Icon from "@/shared/icons/Icon";
import type { IconName } from "@/shared/icons/icons";
import { cx } from "@/shared/utils/cx";
import AccessSettings from "./AccessSettings";
import CompanySettingsSection from "./CompanySettings";
import DataSettings from "./DataSettings";
import FinanceSettings from "./FinanceSettings";
import { NotificationSettings, ProjectSettings } from "./RuleSettings";
import TeamsSettings from "./TeamsSettings";
import TimeSettings from "./TimeSettings";

type Section = "general" | "time" | "finance" | "projects" | "notifications" | "teams" | "admins" | "data";

// Teams is the API's, not the prototype's: the prototype had them fixed.
const SECTIONS: [Section, string, IconName][] = [
    ["general", "Company", "building"], ["time", "Time tracking", "clock"], ["finance", "Finance", "card"], ["projects", "Projects", "projects"],
    ["notifications", "Notifications", "bell"], ["teams", "Teams", "people"], ["admins", "Admins & access", "shield"], ["data", "Data & export", "database"],
];

/**
 * The prototype's P.AdminSettings. Everyone who reaches it sees every section; what they may change follows
 * their permissions: the domain's rules, billing and teams for its admins, the company's name, week, working
 * time, exchange rates and anyone's permissions for a super admin.
 */
export default function SettingsPage() {
    const domain = useDomain();
    const [params, setParams] = useSearchParams();
    const requested = params.get("section") as Section | null;
    const section: Section = requested && SECTIONS.some(([k]) => k === requested) ? requested : "general";
    const open = (k: Section) => { params.set("section", k); setParams(params, { replace: true }); };

    return (
        <div className="page">
            <div className="page-head">
                <div>
                    <h1 className="page-title">Settings</h1>
                    <div className="page-sub">Changes apply straight away.</div>
                </div>
            </div>
            <div className="grid settings-grid" style={{ gridTemplateColumns: "210px minmax(0,1fr)", gap: 16 }}>
                <div className="panel" style={{ alignSelf: "start" }}>
                    <nav className="nav" style={{ padding: 8 }} aria-label="Settings">
                        {SECTIONS.map(([k, label, icon]) => (
                            <button key={k} className={cx("nav-item", section === k && "on")} aria-current={section === k ? "page" : undefined} onClick={() => open(k)}>
                                <Icon name={icon} /><span>{label}</span>
                            </button>
                        ))}
                    </nav>
                </div>
                <div>
                    {section === "general" && <CompanySettingsSection />}
                    {section === "time" && <TimeSettings domain={domain} />}
                    {section === "finance" && <FinanceSettings domain={domain} />}
                    {section === "projects" && <ProjectSettings domain={domain} />}
                    {section === "notifications" && <NotificationSettings domain={domain} />}
                    {section === "teams" && <TeamsSettings domain={domain} />}
                    {section === "admins" && <AccessSettings domain={domain} />}
                    {section === "data" && <DataSettings domain={domain} />}
                </div>
            </div>
        </div>
    );
}
