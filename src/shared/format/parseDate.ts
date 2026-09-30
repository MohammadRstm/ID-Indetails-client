import { companyToday, MONTHS } from "./time";

/* Typed dates, read the way people write them. Values are "yyyy-MM-dd" day keys, like the API's. */

const pad = (n: number) => String(n).padStart(2, "0");
export const keyOf = (y: number, m: number, d: number) => {
    const x = new Date(Date.UTC(y, m, d));
    return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
};

function make(y: number, m: number, d: number): string | null {
    if (y < 100) y += 2000;
    const x = new Date(Date.UTC(y, m, d));
    return x.getUTCFullYear() === y && x.getUTCMonth() === m && x.getUTCDate() === d ? keyOf(y, m, d) : null;
}

function monthIndex(word: string): number {
    const w = word.toLowerCase().slice(0, 3);
    return MONTHS.findIndex((m) => m.toLowerCase() === w);
}

/**
 * What people type: "2026-09-23", "23/9/2026", "23.9.26", "23/9" (this year), "Sep 23 2026", "23 September",
 * "sept 2026" (the 1st), "today", "yesterday", "tomorrow". "" for nothing typed, null for something unreadable.
 */
export function parseDateText(input: string, today = companyToday()): string | null {
    const s = input.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
    if (!s) return "";
    const [ty, tm, td] = today.split("-").map(Number);
    if (s === "today") return today;
    if (s === "yesterday") return keyOf(ty, tm - 1, td - 1);
    if (s === "tomorrow") return keyOf(ty, tm - 1, td + 1);
    let m = /^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})$/.exec(s);
    if (m) return make(+m[1], +m[2] - 1, +m[3]);
    m = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/.exec(s);
    if (m) return make(+m[3], +m[2] - 1, +m[1]);
    m = /^(\d{1,2})[-/.](\d{1,2})$/.exec(s);
    if (m) return make(ty, +m[2] - 1, +m[1]);

    let mon = -1;
    const nums: string[] = [];
    for (const part of s.split(" ")) {
        const t = part.replace(/(st|nd|rd|th)$/, "");
        if (/^\d+$/.test(t)) nums.push(t);
        else if (mon < 0 && monthIndex(t) >= 0) mon = monthIndex(t);
        else return null;
    }
    if (mon < 0 || !nums.length || nums.length > 2) return null;
    let day: number | null = null, year: number | null = null;
    for (const n of nums) {
        if (n.length === 4) year = +n;
        else if (day == null) day = +n;
        else year = +n;
    }
    return make(year ?? ty, mon, day ?? 1);
}
