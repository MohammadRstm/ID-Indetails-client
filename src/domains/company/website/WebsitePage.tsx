import { useSearchParams } from "react-router";
import { PageHead } from "@/shared/components/Data/Panel";
import Tabs from "@/shared/components/Data/Tabs";
import WebsiteProjectsTab from "./WebsiteProjectsTab";
import { ContactTab, LocationsTab, ServicesTab, SiteTab } from "./WebsiteContentTabs";

type Tab = "projects" | "services" | "locations" | "contact" | "site";

const TABS: { key: Tab; label: string }[] = [
    { key: "projects", label: "Projects" },
    { key: "services", label: "Services" },
    { key: "locations", label: "Locations" },
    { key: "contact", label: "Contact & social" },
    { key: "site", label: "Site" },
];

/**
 * What the company's public website shows (website:view to look, website:manage to change). Everything saved here
 * is public on the website straight away.
 */
export default function WebsitePage() {
    const [params, setParams] = useSearchParams();
    const tab = TABS.find((t) => t.key === params.get("tab"))?.key ?? "projects";
    return (
        <>
            <PageHead title="Website" sub="What the company's public website shows. Saved changes are public straight away." />
            <Tabs items={TABS} value={tab} onChange={(key) => setParams(key === "projects" ? {} : { tab: key }, { replace: true })} />
            <div className="mt">
                {tab === "projects" && <WebsiteProjectsTab />}
                {tab === "services" && <ServicesTab />}
                {tab === "locations" && <LocationsTab />}
                {tab === "contact" && <ContactTab />}
                {tab === "site" && <SiteTab />}
            </div>
        </>
    );
}
