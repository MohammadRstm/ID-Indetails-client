import type { ReactNode } from "react";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useArea } from "@/app/shell/useArea";
import HelpTip from "@/shared/components/Feedback/HelpTip";
import { ARTICLE_BY_ID } from "./content";
import { helpPath } from "./helpLinks";

type Props = {
    /** The Help article that explains it in full. */
    article: string;
    /** What it explains, for the button's name: "What is {label}?". */
    label: string;
    /** A sentence or two, shown in the bubble. */
    children: ReactNode;
};

/** A "?" that explains a figure or a field on the spot, with a link to its Help article when the reader may read it. */
export default function HelpHint({ article, label, children }: Props) {
    const p = usePermissions();
    const area = useArea();
    const found = ARTICLE_BY_ID.get(article);
    const more = found?.who({ p, area }) ? { to: helpPath({ area }, article) } : undefined;
    return <HelpTip label={label} more={more}>{children}</HelpTip>;
}
