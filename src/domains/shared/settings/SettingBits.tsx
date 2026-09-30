import type { ReactNode } from "react";
import Icon from "@/shared/icons/Icon";

/** A rule that isn't a setting: it always holds (the prototype's Always). */
export function Always({ children = "Always" }: { children?: ReactNode }) {
    return <span className="badge"><Icon name="check" />{children}</span>;
}

/** Why a setting can't be changed here, under its description. */
export function OnlyFor({ who }: { who: string }) {
    return <> Only {who} can change it.</>;
}
