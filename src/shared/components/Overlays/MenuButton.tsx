import type { ReactNode } from "react";
import type { IconName } from "@/shared/icons/icons";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import Popover from "./Popover";

type MenuButtonProps = {
    icon?: IconName;
    text?: ReactNode;
    label?: string;
    buttonClass?: string;
    align?: "left" | "right";
    width?: number;
    children: ReactNode | ((close: () => void) => ReactNode);
};

/** A button opening a menu of .pop-item actions (the prototype's UI.MenuButton). */
export default function MenuButton({ icon, text, label = "More", buttonClass = "icon-btn", align, width, children }: MenuButtonProps) {
    return (
        <Popover
            align={align}
            width={width}
            trigger={(open, toggle) => (
                <button className={cx(buttonClass, open && "on")} onClick={toggle} aria-label={label}>
                    {icon && <Icon name={icon} />}
                    {text}
                </button>
            )}
        >
            {children}
        </Popover>
    );
}
