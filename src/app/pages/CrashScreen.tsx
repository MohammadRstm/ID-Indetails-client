import type { FallbackProps } from "react-error-boundary";
import Empty from "@/shared/components/Feedback/Empty";

/** What a page that failed while drawing shows instead of going blank. */
export default function CrashScreen({ resetErrorBoundary }: FallbackProps) {
    return (
        <div className="page page-state">
            <Empty
                art="search"
                title="Something went wrong on this page"
                text="Try again. If it keeps happening, reload the app."
                action={
                    <div className="row" style={{ gap: 8, justifyContent: "center" }}>
                        <button className="btn btn-sm" onClick={resetErrorBoundary}>Try again</button>
                        <button className="btn btn-sm btn-quiet" onClick={() => window.location.reload()}>Reload</button>
                    </div>
                }
            />
        </div>
    );
}
