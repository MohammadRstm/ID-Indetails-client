import type { FallbackProps } from "react-error-boundary";
import { aboutCrash } from "@/app/contact/contact";
import Empty from "@/shared/components/Feedback/Empty";
import { ContactLink } from "@/shared/components/Feedback/ErrorText";

/**
 * What a page that failed while drawing shows instead of going blank. Nothing reached the server, so Contact the
 * developer takes the browser's own message and the time.
 */
export default function CrashScreen({ error, resetErrorBoundary }: FallbackProps) {
    return (
        <div className="page page-state">
            <Empty
                art="search"
                title="Something went wrong on this page"
                text={<>Try again. If it keeps happening, reload the app, or <ContactLink about={() => aboutCrash(error)} />.</>}
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
