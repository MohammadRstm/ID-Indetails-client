import type { CSSProperties, ReactNode } from "react";
import { cx } from "@/shared/utils/cx";

type PanelProps = {
    title?: ReactNode;
    sub?: ReactNode;
    tools?: ReactNode;
    foot?: ReactNode;
    /** The body without padding (tables, lists that run edge to edge). */
    flush?: boolean;
    className?: string;
    bodyClassName?: string;
    style?: CSSProperties;
    id?: string;
    children?: ReactNode;
};

/** A card with a head (title, sub-line, tools), a body and an optional foot: the prototype's .panel. */
export default function Panel({ title, sub, tools, foot, flush, className, bodyClassName, style, id, children }: PanelProps) {
    return (
        <div className={cx("panel", className)} style={style} id={id}>
            {(title || tools) && (
                <div className="panel-head">
                    <div className="grow" style={{ minWidth: 0 }}>
                        {title && <div className="panel-title">{title}</div>}
                        {sub && <div className="panel-sub">{sub}</div>}
                    </div>
                    {tools && <div className="panel-tools">{tools}</div>}
                </div>
            )}
            {children !== undefined && <div className={cx("panel-body", flush && "flush", bodyClassName)}>{children}</div>}
            {foot && <div className="panel-foot">{foot}</div>}
        </div>
    );
}

type PageHeadProps = {
    title: ReactNode;
    sub?: ReactNode;
    crumbs?: ReactNode;
    actions?: ReactNode;
};

/** A page's title, sub-line and actions: the prototype's .page-head. */
export function PageHead({ title, sub, crumbs, actions }: PageHeadProps) {
    return (
        <div className="page-head">
            <div className="grow" style={{ minWidth: 0 }}>
                {crumbs && <div className="crumbs">{crumbs}</div>}
                <h1 className="page-title">{title}</h1>
                {sub && <div className="page-sub">{sub}</div>}
            </div>
            {actions && <div className="page-actions">{actions}</div>}
        </div>
    );
}
