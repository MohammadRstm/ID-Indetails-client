import { lazy, Suspense } from "react";
import { useLogWork } from "./logWorkStore";

// the form and its day timeline load the first time someone logs work
const LogWorkModal = lazy(() => import("./LogWork"));

/** Shows the log-work form wherever it is opened from (the timer, a day, an entry, the palette). */
export function LogWorkHost() {
    const open = useLogWork();
    return open ? <Suspense fallback={null}><LogWorkModal key={open.n} options={open} /></Suspense> : null;
}
