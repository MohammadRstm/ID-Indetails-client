import { useSearchParams } from "react-router";
import { P } from "@/app/permissions/codes";
import { DOMAINS, type Domain } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { DomainContext, useDomain } from "@/app/routing/domainContext";
import { Segmented } from "@/shared/components/Forms/Filters";
import { DOMAIN_LABEL } from "@/shared/format/labels";
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
/** The same whichever business is being looked at. */
const COMPANY_WIDE: Section[] = ["general", "admins"];

type Choice = { domains: Domain[]; pick: (domain: Domain) => void };

/** A business's Settings, in its own area. */
export default function SettingsPage() {
    return <Settings domain={useDomain()} />;
}

/**
 * Settings in the company area: the company's own, and each business's, picked at the top of its sections.
 * The prototype had them per business only.
 */
export function CompanySettingsPage() {
    const permissions = usePermissions();
    const [params, setParams] = useSearchParams();
    const domains = DOMAINS.filter((d) => permissions.canSeeDomain(d));
    const requested = params.get("domain") as Domain | null;
    const domain = requested && domains.includes(requested) ? requested : domains[0] ?? "design";
    const pick = (next: Domain) => { params.set("domain", next); setParams(params, { replace: true }); };
    return (
        <DomainContext.Provider value={domain}>
            <Settings domain={domain} choice={{ domains, pick }} />
        </DomainContext.Provider>
    );
}

/**
 * The prototype's P.AdminSettings. Everyone who reaches it sees every section; what they may change follows
 * their permissions: the domain's rules, billing and teams for its admins, the company's name, week, working
 * time, exchange rates and anyone's permissions for a super admin. Whoever reaches the company overview
 * manages the teams there instead.
 */
function Settings({ domain, choice }: { domain: Domain; choice?: Choice }) {
    const permissions = usePermissions();
    const [params, setParams] = useSearchParams();
    const sections = SECTIONS.filter(([k]) => k !== "teams" || !permissions.has(P.COMPANY_VIEW));
    const requested = params.get("section") as Section | null;
    const section: Section = requested && sections.some(([k]) => k === requested) ? requested : "general";
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
                        {sections.map(([k, label, icon]) => (
                            <button key={k} className={cx("nav-item", section === k && "on")} aria-current={section === k ? "page" : undefined} onClick={() => open(k)}>
                                <Icon name={icon} /><span>{label}</span>
                            </button>
                        ))}
                    </nav>
                </div>
                <div>
                    {choice && !COMPANY_WIDE.includes(section) && choice.domains.length > 1 && (
                        <div className="row" style={{ gap: 10, marginBottom: 12 }}>
                            <span className="u">Business</span>
                            <Segmented aria-label="Business" value={domain} onChange={choice.pick}
                                options={choice.domains.map((d) => ({ value: d, label: DOMAIN_LABEL[d] }))} />
                        </div>
                    )}
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
