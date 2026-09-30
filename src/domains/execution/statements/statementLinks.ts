import { useSearchParams } from "react-router";

/** Opens a site's statements through the link, so one can be linked to: ?statement=new, or ?statement=12. */
export function useStatementLinks() {
    const [params, setParams] = useSearchParams();
    const set = (value: string | null, replace: boolean) => {
        if (value) params.set("statement", value);
        else params.delete("statement");
        setParams(params, { replace });
    };
    return {
        newStatement: () => set("new", false),
        open: (id: number) => set(String(id), false),
        /** A new statement once it is made: the window shows it in its place. */
        made: (id: number) => set(String(id), true),
        close: () => set(null, true),
    };
}
