const UNITS = ["B", "KB", "MB", "GB", "TB"];

/** A file's size in units of 1024: 512 B, 38 KB, 1.5 MB, 640 MB. Whole numbers up to KB, one decimal above (1.0 is written 1). */
export function fmtBytes(bytes: number): string {
    let value = Math.max(0, bytes);
    let unit = 0;
    for (;;) {
        const shown = unit < 2 ? Math.round(value) : Math.round(value * 10) / 10;
        // 1,023.97 KB rounds to 1,024: that is 1 MB
        if (shown < 1024 || unit === UNITS.length - 1) return `${shown.toLocaleString("en-US")} ${UNITS[unit]}`;
        value /= 1024;
        unit++;
    }
}
