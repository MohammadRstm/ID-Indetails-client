import { useSearchParams } from "react-router";

/**
 * The flags a page may keep in its link to say a window is open (?details=1, ?new=1). One list for the whole app, so
 * two windows never claim the same key on one page: "edit" is already the billing windows' (billingLinks.ts).
 */
export type UrlFlag = "details" | "new";

/**
 * A window that opens from its link: opening adds the flag (so the back button closes it, and Proton or a shared
 * link can open it), closing removes it without a history entry.
 */
export function useUrlFlag(flag: UrlFlag): [boolean, (open: boolean) => void] {
    const [params, setParams] = useSearchParams();
    const set = (open: boolean) => {
        if (open) params.set(flag, "1");
        else params.delete(flag);
        setParams(params, { replace: !open });
    };
    return [params.get(flag) === "1", set];
}
