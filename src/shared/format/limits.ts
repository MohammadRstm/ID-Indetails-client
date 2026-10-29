/*
 * The largest numbers that can be typed, so nothing sent is ever too large for the API to keep. The API holds
 * amounts to the cent in 18 digits, but the browser's numbers are exact to 15 digits only, so an amount stops just
 * under ten trillion: room for any project, in US dollars or in Lebanese pounds.
 */

/** How many digits a number may have before and after the point, and a maximum when it is lower than that. */
export type NumberShape = { digits: number; decimals: number; max?: number };

/** An amount of money: 13 digits and 2 decimals. */
export const AMOUNT: NumberShape = { digits: 13, decimals: 2 };
/** A material's quantity: 11 digits and 3 decimals, as the API keeps it. */
export const QUANTITY: NumberShape = { digits: 11, decimals: 3 };
/** A material's unit cost: 11 digits and 4 decimals (15 digits, as exact as the browser's numbers go). */
export const UNIT_COST: NumberShape = { digits: 11, decimals: 4 };
/** Lebanese pounds to the dollar: under a trillion, as the API keeps a rate. */
export const RATE: NumberShape = { digits: 12, decimals: 6 };
/** Ground workers on a site in a day, as the API allows. */
export const WORKERS: NumberShape = { digits: 5, decimals: 0, max: 10_000 };
/** A material profit, in percent: up to 500%, as the API allows. */
export const MARKUP_PERCENT: NumberShape = { digits: 3, decimals: 2, max: 500 };
/** A project's TVA, as a percentage: 0 to 100. */
export const TVA_PERCENT: NumberShape = { digits: 3, decimals: 2, max: 100 };
/** Hours excused in a month: at most the month itself. */
export const MONTH_HOURS: NumberShape = { digits: 3, decimals: 2, max: 744 };

const nines = (shape: NumberShape) => `${"9".repeat(shape.digits)}${shape.decimals ? `.${"9".repeat(shape.decimals)}` : ""}`;

/** The largest number of a shape. */
export const largest = (shape: NumberShape) => shape.max ?? Number(nines(shape));

/**
 * A number as it is being typed, kept to its shape: the digits and one point, or null when the last key would
 * take it past the digits, decimals or maximum it may have (that key is refused). Taking characters away is
 * always allowed, so a number given from elsewhere with more decimals can still be corrected.
 */
export function fitNumber(raw: string, shape: NumberShape, before = ""): string | null {
    const text = raw.replace(/[^0-9.]/g, "");
    const [whole, fraction, extra] = text.split(".");
    const fits = extra === undefined && whole.replace(/^0+(?=\d)/, "").length <= shape.digits
        && (shape.decimals > 0 ? (fraction?.length ?? 0) <= shape.decimals : fraction === undefined)
        && !(shape.max != null && Number(text) > shape.max);
    return fits || text.length < before.length ? text : null;
}

/** "Up to 9,999,999,999,999.99, with at most 2 decimals.": the line under a field that refused a key. */
export function upTo(shape: NumberShape): string {
    const [whole, fraction] = (shape.max != null ? String(shape.max) : nines(shape)).split(".");
    const max = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction ? `.${fraction}` : "");
    return `Up to ${max}${shape.decimals ? `, with at most ${shape.decimals} decimals` : ""}.`;
}
