import type { CSSProperties } from "react";
import { cx } from "@/shared/utils/cx";
import { icons, type IconName } from "./icons";

type IconProps = {
    name: IconName;
    className?: string;
    style?: CSSProperties;
};

/** One of the prototype's icons, drawn at 16px by the `.ic` class unless the caller sizes it. */
export default function Icon({ name, className, style }: IconProps) {
    return (
        <svg
            className={cx("ic", className)}
            viewBox="0 0 24 24"
            style={style}
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: Object.hasOwn(icons, name) ? icons[name] : "" }}
        />
    );
}
