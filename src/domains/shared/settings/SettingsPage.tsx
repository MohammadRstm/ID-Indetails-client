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
import { revealInStrip } from "@/shared/utils/revealInStrip";
import AccessSettings from "./AccessSettings";
import AccountLabelsSettings from "./AccountLabelsSettings";
import CompanySettingsSection from "./CompanySettings";
import ContactSection from "./ContactSection";
import DataSettings from "./DataSettings";
import FinanceSettings from "./FinanceSettings";
import { NotificationSettings, ProjectSettings } from "./RuleSettings";
import { seesSettingsSection, type SettingsSection as Section } from "./settingsSections";
import TeamsSettings from "./TeamsSettings";
import TimeSettings from "./TimeSettings";

// Teams is the API's, not the prototype's: the prototype had them fixed.
const SECTIONS: [Section, string, IconName][] = [
    ["general", "Company", "building"], ["time", "Time tracking", "clock"], ["finance", "Finance", "card"], ["projects", "Projects", "projects"],
    ["notifications", "Notifications", "bell"], ["teams", "Departments", "people"], ["labels", "Account labels", "list"], ["admins", "Admins & access", "shield"], ["data", "Data & export", "database"],
    ["contact", "Contact", "mail"],
];
/** The same whichever business is being looked at. */
const COMPANY_WIDE: Section[] = ["general", "labels", "admins", "contact"];
/** What the Website area's Settings have: it is no business, so none of a business's sections. */
const WEBSITE: Section[] = ["general", "contact"];

type Choice = { domains: Domain[]; pick: (domain: Domain) => void };

/** A business's Settings, in its own area. */
export default function SettingsPage() {
    return <Settings domain={useDomain()} />;
}

/** The Website area's Settings: how the app looks, and Contact the developer. */
export function WebsiteSettingsPage() {
    return <Settings domain={null} />;
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
 * The prototype's P.AdminSettings. Each section shows to whoever may change something in it (settingsSections.ts):
 * the domain's rules, billing and teams for its admins, the company's name, week, working time, exchange
 * rates and anyone's permissions for a super admin. The theme and Contact the developer are everyone's, so everyone
 * has Settings. Whoever reaches the company overview manages the teams there instead. Without a business (the
 * Website area), only the theme and Contact.
 */
function Settings({ domain, choice }: { domain: Domain | null; choice?: Choice }) {
    const permissions = usePermissions();
    const [params, setParams] = useSearchParams();
    const sections = SECTIONS
        .filter(([k]) => (domain != null || WEBSITE.includes(k)) && (k !== "teams" || !permissions.has(P.COMPANY_VIEW)) && seesSettingsSection(permissions, k))
        // without the company's settings to change, the first section is only the theme
        .map(([k, label, icon]): [Section, string, IconName] => (k === "general" && !permissions.has(P.COMPANY_SETTINGS_MANAGE) ? [k, "Appearance", "sun"] : [k, label, icon]));
    const requested = params.get("section") as Section | null;
    const section: Section = requested && sections.some(([k]) => k === requested) ? requested : "general";
    const open = (k: Section) => { params.set("section", k); setParams(params, { replace: true }); };

    return (
        <div className="page page-narrow">
            <div className="page-head">
                <div>
                    <h1 className="page-title">Settings</h1>
                    <div className="page-sub">Changes apply straight away.</div>
                </div>
            </div>
            <div className="grid settings-grid">
                <div className="panel" style={{ alignSelf: "start" }}>
                    <nav className="nav" style={{ padding: 8 }} aria-label="Settings">
                        {sections.map(([k, label, icon]) => (
                            <button key={k} className={cx("nav-item", section === k && "on")} aria-current={section === k ? "page" : undefined}
                                ref={section === k ? revealInStrip : undefined} onClick={() => open(k)}>
                                <Icon name={icon} /><span>{label}</span>
                            </button>
                        ))}
                    </nav>
                </div>
                <div>
                    {choice && domain && !COMPANY_WIDE.includes(section) && choice.domains.length > 1 && (
                        <div className="row" style={{ gap: 10, marginBottom: 12 }}>
                            <span className="u">Business</span>
                            <Segmented aria-label="Business" value={domain} onChange={choice.pick}
                                options={choice.domains.map((d) => ({ value: d, label: DOMAIN_LABEL[d] }))} />
                        </div>
                    )}
                    {section === "general" && <CompanySettingsSection />}
                    {domain && section === "time" && <TimeSettings domain={domain} />}
                    {domain && section === "finance" && <FinanceSettings domain={domain} />}
                    {domain && section === "projects" && <ProjectSettings domain={domain} />}
                    {domain && section === "notifications" && <NotificationSettings domain={domain} />}
                    {domain && section === "teams" && <TeamsSettings domain={domain} />}
                    {section === "labels" && <AccountLabelsSettings />}
                    {domain && section === "admins" && <AccessSettings domain={domain} />}
                    {domain && section === "data" && <DataSettings domain={domain} />}
                    {section === "contact" && <ContactSection />}
                </div>
            </div>
        </div>
    );
}
