/** The company's mark, as on the favicon and the logo sheet (two halves split by a slit). */
const MARK = "M638 2235C962.8 2185.6 1199.1 1901.5 1187.6 1573.8L1187.6 660.2C1199.1 332.5 962.8 48.4 638 0L638 395.6C736.1 404 808.6 489 801.5 586.5L801.5 1647.5C808.6 1745 736.1 1830 638 1838.4ZM549 2235C225.2 2185.6 -11.1 1901.5 0.4 1573.8L0.4 660.2C-11.1 332.5 225.2 48.4 549 0L549 395.6C452.9 404 380.4 489 387.5 586.5L387.5 1647.5C380.4 1745 452.9 1830 549 1838.4Z";

/** While the app loads and the session is restored: the company's mark, breathing, above what is happening. */
export default function BootScreen() {
    return (
        <div className="boot" aria-busy="true">
            <svg className="boot-logo" width="30" height="56" viewBox="-12 0 1212 2235" aria-hidden="true">
                <path fill="currentColor" d={MARK} />
            </svg>
            <p className="boot-text">Loading ID InDetails…</p>
        </div>
    );
}
