import { toApiError } from "@/api/errors";
import FormFailure from "@/domains/shared/projects/FormFailure";
import Icon from "@/shared/icons/Icon";
import { boqErrorMessage } from "./boqRules";

/**
 * A BOQ call's failure, in the footer of the window that made it. A change the profit floor refused is the usual
 * force-it flow (agreeing or withdrawing lowers or raises what the client pays); anything else is said in words.
 */
export default function BoqFailure({ error, onForced }: { error: unknown; onForced: () => void }) {
    if (toApiError(error).code === "profit_floor") return <FormFailure error={error} onForced={onForced} />;
    return <span className="err"><Icon name="alert" />{boqErrorMessage(error)}</span>;
}
