/*
 * The website form's checks, the same as the API's (Business/Website/WebsiteRules.cs), so mistakes show as they are
 * typed rather than after saving.
 */

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_SLUG = 100;

/** The address the API makes from a title when none is typed: lowercase ASCII words joined by dashes. */
export function slugOf(title: string): string {
    const slug = title.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug.slice(0, MAX_SLUG).replace(/-+$/, "");
}

/** A year: required when nothing is linked, between 1900 and 2100 when given. */
export function yearError(year: string, linked: boolean): string | false {
    if (!year.trim()) return !linked && "Enter a year, or link a system project to follow its year.";
    const n = Number(year);
    return !(Number.isInteger(n) && n >= 1900 && n <= 2100) && "The year must be between 1900 and 2100.";
}

/** A map position: both numbers or neither, within the globe. */
export function placeError(latitude: string, longitude: string): string | false {
    const lat = latitude.trim(), lng = longitude.trim();
    if (!lat && !lng) return false;
    if (!lat || !lng) return "Give both the latitude and the longitude, or neither.";
    const a = Number(lat), b = Number(lng);
    if (!Number.isFinite(a) || a < -90 || a > 90) return "The latitude must be a number between -90 and 90.";
    if (!Number.isFinite(b) || b < -180 || b > 180) return "The longitude must be a number between -180 and 180.";
    return false;
}

/** A pasted "33.8938, 35.5018" (as maps copy it): the two numbers, or null when it's a single value. */
export function splitPosition(value: string): [string, string] | null {
    const match = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(value);
    return match ? [match[1], match[2]] : null;
}

/** A photo credit: all three parts or none, the link a full https:// address. */
export function creditError(credit: { photographer: string; source: string; url: string }): string | false {
    const parts = [credit.photographer, credit.source, credit.url].map((v) => v.trim());
    if (parts.every((v) => !v)) return false;
    if (parts.some((v) => !v)) return "A credit needs the photographer, the source and the link, or none of them.";
    try {
        const url = new URL(parts[2]);
        return (url.protocol !== "https:" || !url.hostname.includes(".")) && "The credit link must be a full https:// address.";
    } catch {
        return "The credit link must be a full https:// address.";
    }
}

type Publishable = {
    status: string | null;
    year: number | null;
    city: string;
    country: string;
    latitude: string;
    longitude: string;
    description: string;
    thumbnail: number | null;
    hero: number | null;
};

/** What a project still needs before it can be published, in the API's words. */
export function missingToPublish(p: Publishable): string[] {
    const missing: string[] = [];
    if (!p.status) missing.push("a status");
    if (p.year == null) missing.push("a year");
    if (!p.city.trim()) missing.push("a city");
    if (!p.country.trim()) missing.push("a country");
    if (!p.latitude.trim() || !p.longitude.trim()) missing.push("a position on the map");
    if (!p.description.trim()) missing.push("a description");
    if (p.thumbnail == null) missing.push("a thumbnail");
    if (p.hero == null) missing.push("a main picture");
    return missing;
}

/** A link in the footer: a full https:// address. */
export function linkError(url: string): string | false {
    if (!url.trim()) return "Enter the link.";
    try {
        const parsed = new URL(url.trim());
        return (parsed.protocol !== "https:" || !parsed.hostname.includes(".")) && "The link must be a full https:// address.";
    } catch {
        return "The link must be a full https:// address.";
    }
}
