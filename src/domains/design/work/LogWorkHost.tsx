import { lazy, Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { errorMessage } from "@/api/errors";
import { load } from "@/app/routing/pages";
import { toast } from "@/shared/components/Feedback/toast";
import { closeLogWork, useLogWork } from "./logWorkStore";

// the form and its day timeline load the first time someone logs work (reloading once after an update)
const LogWorkModal = lazy(load(() => import("./LogWork")));

/** Shows the log-work form wherever it is opened from (the timer, a day, an entry, the palette). */
export function LogWorkHost() {
    const open = useLogWork();
    if (!open) return null;
    // a failure closes the form only, not the whole app around it
    return (
        <ErrorBoundary key={open.n} fallback={null} onError={(e) => { closeLogWork(); toast({ text: "Log work didn't open", sub: errorMessage(e), icon: "alert" }); }}>
            <Suspense fallback={null}><LogWorkModal options={open} /></Suspense>
        </ErrorBoundary>
    );
}
