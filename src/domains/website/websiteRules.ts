/*
 * The website form's checks, the same as the API's (Business/Website/WebsiteRules.cs), so mistakes show as they are
 * typed rather than after saving.
 */

const MAX_SLUG = 100;

/** The page address the API makes from a project's name: lowercase ASCII words joined by dashes; empty without any. */
export function slugOf(title: string): string {
    const slug = title.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug.slice(0, MAX_SLUG).replace(/-+$/, "");
}

/** The architectural types the form suggests; any other can be typed in. */
export const PROJECT_TYPES = [
    "Villa", "Private house", "Residential", "Apartment building", "Mixed-use", "Hotel", "Resort", "Restaurant & café", "Retail",
    "Office", "Commercial", "Healthcare", "Education", "Cultural", "Religious", "Sports & leisure", "Industrial", "Landscape",
    "Interior design", "Urban planning", "Renovation & restoration",
];

const MAX_TYPE = 60;

/** A type tidied as the API saves it: trimmed, single spaces and a capital first letter. */
export function cleanType(type: string): string {
    const tidy = type.trim().replace(/\s+/g, " ");
    return tidy.charAt(0).toUpperCase() + tidy.slice(1);
}

/**
 * The types to pick from: the suggested ones, then the others the projects have, each once. Two with the same key
 * (slugOf) are one type, spelt as the projects have it, as the API keeps it so.
 */
export function typeChoices(used: string[]): string[] {
    const byKey = new Map(used.map((t) => [slugOf(t), t]));
    const suggested = PROJECT_TYPES.map((t) => byKey.get(slugOf(t)) ?? t);
    const keys = new Set(suggested.map(slugOf));
    const others = [...byKey].filter(([key]) => key && !keys.has(key)).map(([, t]) => t).sort((a, b) => a.localeCompare(b));
    return [...suggested, ...others];
}

/** A type: required, at most 60 characters and with a Latin letter or digit, as the API's key is made from it. */
export function typeError(type: string): string | false {
    const tidy = cleanType(type);
    if (!tidy) return "Pick a type, or type your own.";
    if (tidy.length > MAX_TYPE) return `A type can be at most ${MAX_TYPE} characters.`;
    return !slugOf(tidy) && "The type needs at least one Latin letter or digit.";
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
    // coordinates are enough (the country is found from them), or a country, with a city or without
    if ((!p.latitude.trim() || !p.longitude.trim()) && !p.country.trim()) missing.push("a country");
    if (!p.description.trim()) missing.push("a description");
    if (p.thumbnail == null) missing.push("a card picture");
    if (p.hero == null) missing.push("a page picture");
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
