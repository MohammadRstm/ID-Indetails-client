import { useState } from "react";
import { errorMessage, toApiError } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { toast } from "@/shared/components/Feedback/toast";
import Icon from "@/shared/icons/Icon";
import { useForceBlockedChange } from "./blockedChangesApi";

/**
 * A form's failure, in its footer. When the profit floor refused the change, whoever sees the project's money can
 * force it through here, after an are-you-sure; others are told who was asked to look.
 */
export default function FormFailure({ error, onForced }: { error: unknown; onForced: () => void }) {
    const permissions = usePermissions();
    const force = useForceBlockedChange();
    const [sure, setSure] = useState(false);
    const failure = toApiError(error);
    const id = failure.code === "profit_floor" ? failure.blockedChangeId : null;

    if (id == null || !permissions.has(P.FINANCIAL_VIEW)) {
        return <span className="err"><Icon name="alert" />{errorMessage(error)}</span>;
    }

    if (!sure) {
        return (
            <span className="err">
                <Icon name="alert" />This would take the project to zero profit or below.
                <button className="btn btn-sm" onClick={() => setSure(true)}>Force it</button>
            </span>
        );
    }

    return (
        <span className="err">
            <Icon name="alert" />{force.error ? errorMessage(force.error) : "Save it anyway, at zero profit or below?"}
            <button className="btn btn-sm" disabled={force.isPending} onClick={() => setSure(false)}>Cancel</button>
            <button className="btn btn-sm btn-danger" disabled={force.isPending} onClick={() => force.mutate(id, {
                onSuccess: (change) => {
                    toast({ text: "Saved past the profit floor", sub: change.summary, icon: "alert" });
                    onForced();
                },
            })}>Force</button>
        </span>
    );
}
