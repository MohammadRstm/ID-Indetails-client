/** Seconds as "45s", "1m 05s" or "1h 02m": how long the website was in front of someone. */
export function fmtSeconds(seconds: number): string {
    const s = Math.max(0, Math.round(seconds));
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
    return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
}

/** A fraction (0.425) as "42.5%". */
export function fmtRate(rate: number): string {
    return `${(rate * 100).toFixed(1)}%`;
}

/** The change between two fractions in percentage points: 0.425 against 0.4 is 2.5. */
export const pointsChange = (rate: number, previous: number) => Math.round((rate - previous) * 1000) / 10;

/** The change against the previous period as a fraction (+0.124), or null when there is nothing to compare with. */
export function relativeChange(value: number, previous: number | null | undefined): number | null {
    return previous == null || previous === 0 ? null : (value - previous) / previous;
}

/** What the website's own events and Google's automatic ones mean, in the app's words. */
export const EVENT_LABEL: Record<string, string> = {
    generate_lead: "Contact requests",
    email_click: "Email clicks",
    phone_click: "Phone clicks",
    contact_cta_click: "“Contact us” clicks",
    click: "Links to other websites",
    page_view: "Page views",
    scroll: "Read to the end of a page",
    session_start: "Visits started",
    first_visit: "First visits",
    user_engagement: "Time on a page",
    file_download: "File downloads",
};

/** The website's own events, the ones that show interest in working with the studio, in the order shown. */
export const CONTACT_EVENTS = ["generate_lead", "email_click", "phone_click", "contact_cta_click", "click"] as const;

export const eventLabel = (name: string) => EVENT_LABEL[name] ?? name;

const KNOWN: Record<string, string> = {
    desktop: "Desktop",
    mobile: "Mobile",
    tablet: "Tablet",
    "smart tv": "TV",
    new: "New visitors",
    returning: "Returning visitors",
    "(not set)": "Not known",
    "(direct)": "Direct",
    "(none)": "None",
    "(organic)": "Organic",
    "(referral)": "Referral",
};

/** Google's values ("mobile", "(not set)") in the app's words; anything else as Google wrote it. */
export const label = (value: string) => KNOWN[value] ?? (value || "Not known");

/** A country's flag from its ISO code ("LB"), or nothing when Google doesn't know the country. */
export function flag(code: string): string {
    if (!/^[A-Z]{2}$/.test(code)) return "";
    return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
