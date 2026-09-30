import { errorMessage } from "@/api/errors";
import Icon from "@/shared/icons/Icon";

type LoadErrorProps = {
    error: unknown;
    /** Tries again; shown as a small link. */
    retry?: () => void;
    /** What couldn't be loaded, e.g. "the projects". */
    what?: string;
};

/**
 * A small inline note where something failed to load, in the prototype's .err style, with a retry.
 * Used instead of a toast, so the failure stays next to what it concerns.
 */
export default function LoadError({ error, retry, what }: LoadErrorProps) {
    return (
        <div className="err load-err" role="alert">
            <Icon name="alert" />
            <span>
                {what ? `Couldn't load ${what}. ` : ""}
                {errorMessage(error)}
                {retry && (
                    <>
                        {" "}
                        <button type="button" className="link" onClick={retry}>Try again</button>
                    </>
                )}
            </span>
        </div>
    );
}
