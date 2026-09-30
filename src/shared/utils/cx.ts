type ClassValue = string | false | null | undefined | Record<string, boolean | null | undefined>;

/** Joins class names, skipping empty ones, like the prototype's HL.cx. */
export function cx(...values: ClassValue[]): string {
    const out: string[] = [];
    for (const value of values) {
        if (!value) continue;
        if (typeof value === "string") {
            out.push(value);
        } else {
            for (const key in value) {
                if (value[key]) out.push(key);
            }
        }
    }
    return out.join(" ");
}
