import type { ReactNode } from "react";
import { PageHead } from "@/shared/components/Data/Panel";
import CompanyPeople from "../company/people/CompanyPeople";
import WebsiteProjectsTab from "./WebsiteProjectsTab";
import { ContactTab, LocationsTab, ServicesTab, SiteTab, UnderConstructionNotice } from "./WebsiteContentTabs";

/*
 * The Website area's pages: what the company's public website shows (website:view to look, website:manage to change),
 * and the people who look after it. Everything saved here is public on the website straight away.
 */

const PUBLIC = "Saved changes are public straight away.";

/** A Website page; while the website is under construction it says so at the top, except on Site, whose panel does. */
function WebsiteSection({ title, sub, notice = true, children }: { title: string; sub: string; notice?: boolean; children: ReactNode }) {
    return (
        <div className="page">
            <PageHead title={title} sub={`${sub} ${PUBLIC}`} />
            {notice && <UnderConstructionNotice />}
            <div className="mt">{children}</div>
        </div>
    );
}

export function WebsiteProjectsPage() {
    return <WebsiteSection title="Projects" sub="The projects the website shows, and its moving strip."><WebsiteProjectsTab /></WebsiteSection>;
}

export function WebsiteServicesPage() {
    return <WebsiteSection title="Services" sub="What the company offers, in the website's order."><ServicesTab /></WebsiteSection>;
}

export function WebsiteLocationsPage() {
    return <WebsiteSection title="Locations" sub="The company's offices on the website's map."><LocationsTab /></WebsiteSection>;
}

export function WebsiteContactPage() {
    return <WebsiteSection title="Contact & social" sub="Where the contact form goes, and the social links."><ContactTab /></WebsiteSection>;
}

export function WebsiteSitePage() {
    return <WebsiteSection title="Site" sub="Whether the website is live, and its favicon." notice={false}><SiteTab /></WebsiteSection>;
}

/** The website's staff: admins who look after the website and nothing else. */
export function WebsiteStaffPage() {
    return (
        <div className="page">
            <PageHead title="Staff" sub="The people who look after the website. Anyone else can be given the website's permissions from their profile." />
            <UnderConstructionNotice />
            <CompanyPeople domain="website" />
        </div>
    );
}
