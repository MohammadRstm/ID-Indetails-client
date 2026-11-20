import { lazy, Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { errorMessage } from "@/api/errors";
import { load } from "@/app/routing/pages";
import { toast } from "@/shared/components/Feedback/toast";
import type { ShellArea } from "./useArea";

// opened with ⌘K or the Search button, so it loads then
const CommandPalette = lazy(load(() => import("./CommandPalette")));

/** The search window, loaded when first opened. A failure closes it with a note, not the whole app around it. */
export default function SearchPalette({ area, onClose }: { area: ShellArea; onClose: () => void }) {
    return (
        <ErrorBoundary fallback={null} onError={(e) => { onClose(); toast({ text: "Search didn't open", sub: errorMessage(e), icon: "alert" }); }}>
            <Suspense fallback={null}><CommandPalette area={area} onClose={onClose} /></Suspense>
        </ErrorBoundary>
    );
}
