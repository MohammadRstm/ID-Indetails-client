import { useState } from "react";
import { errorMessage, toApiError } from "@/api/errors";
import { ErrorMessage } from "@/shared/components/Feedback/ErrorText";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { toast } from "@/shared/components/Feedback/toast";
import Icon from "@/shared/icons/Icon";
import { useForceBlockedChange } from "./blockedChangesApi";

/**
 * A form's failure, in its footer. When the profit floor refused the change, whoever sees the project's money can
 * force it through here, after an are-you-sure; others are told who was asked to look. A held pay change is the super
 * admins' alone to force.
 */
export default function FormFailure({ error, onForced }: { error: unknown; onForced: () => void }) {
    const permissions = usePermissions();
    const force = useForceBlockedChange();
    const [sure, setSure] = useState(false);
    const failure = toApiError(error);
    const pay = failure.code === "pay_change_held";
    const id = failure.code === "profit_floor" || pay ? failure.blockedChangeId : null;
    const decides = pay ? permissions.role === "super_admin" : permissions.has(P.FINANCIAL_VIEW);

    if (id == null || !decides) {
        return <span className="err"><Icon name="alert" /><ErrorMessage error={error} /></span>;
    }

    if (!sure) {
        return (
            <span className="err">
                <Icon name="alert" />{pay ? "This pay change would take a project to zero profit or below." : "This would take the project to zero profit or below."}
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
