import { Link } from "react-router";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { DOMAIN_LABEL } from "@/shared/format/labels";
import Icon from "@/shared/icons/Icon";
import { useBillingSetupMissing } from "./billingApi";

/**
 * Said wherever an invoice would be issued while the domain's invoicing isn't set up: drafts are fine, but an
 * invoice can't be numbered and sent without the numbering and bank details. Links to where they are set.
 */
export default function BillingSetupNotice({ domain, className = "mt" }: { domain: string; className?: string }) {
    const permissions = usePermissions();
    if (!useBillingSetupMissing(domain)) return null;
    return (
        <div className={`banner hold ${className}`} role="status">
            <Icon name="alert" />
            <div className="grow">
                <b>Invoicing isn't set up for {DOMAIN_LABEL[domain] ?? domain} yet.</b> Invoices can be drafted, but none can be sent until the invoice numbering and bank details are set.{" "}
                {permissions.has(P.BILLING_SETTINGS_MANAGE)
                    ? <Link to={`/${domain}/settings?section=finance`}>Set up invoicing</Link>
                    : "Ask an admin who manages the billing settings to set it up."}
            </div>
        </div>
    );
}
