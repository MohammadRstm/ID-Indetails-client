import { compactOrNull, fmtNumber, MINUS } from "./time";

/*
 * Money as the prototype writes it (hourline/js/15-finance.js). Amounts come from the API as numbers with
 * their currency; only USD and LBP exist. The client formats money and never calculates it.
 */

export type Currency = "USD" | "LBP" | string;

type ExactOptions = {
    /** Keep the cents (typed amounts, documents). */
    cents?: boolean;
    /** Negative amounts in brackets instead of a minus sign. */
    paren?: boolean;
};

function sign(negative: boolean, body: string, paren?: boolean): string {
    if (!negative) return body;
    return paren ? `(${body})` : MINUS + body;
}

/** Every digit: $12,500, $1,250.50 with cents, 2,500,000 LBP. */
export function exact(amount: number, currency: Currency = "USD", options: ExactOptions = {}): string {
    const value = Math.abs(amount);
    const body = currency === "LBP"
        ? `${fmtNumber(Math.round(value))} LBP`
        : `$${fmtNumber(options.cents ? Math.round(value * 100) / 100 : Math.round(value))}`;
    return sign(amount < 0, body, options.paren);
}

function wrapped(amount: number, currency: Currency, compact: string, paren?: boolean): string {
    const body = currency === "LBP" ? `${compact} LBP` : `$${compact}`;
    return sign(amount < 0, body, paren);
}

export const money = {
    /** On screen: short from 1,000 up ($9.6k, $1.25M, 2.6B LBP), every digit below. */
    fmt(amount: number, currency: Currency = "USD", options: ExactOptions & { exact?: boolean } = {}): string {
        if (options.exact) return exact(amount, currency, options);
        const c = compactOrNull(Math.abs(amount), true);
        return c == null ? exact(amount, currency, options) : wrapped(amount, currency, c, options.paren);
    },

    exact,

    /** Tighter still, for chart axes and small tiles. */
    short(amount: number, currency: Currency = "USD"): string {
        const c = compactOrNull(Math.abs(amount), false);
        return c == null ? exact(amount, currency) : wrapped(amount, currency, c);
    },

    /** A ratio as a percentage: 0.125 → 12.5%. */
    pct(ratio: number | null | undefined): string {
        return ratio == null ? "-" : `${(ratio * 100).toFixed(1)}%`;
    },
};
