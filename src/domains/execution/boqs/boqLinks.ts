import { useSearchParams } from "react-router";

/** Opens a BOQ through the link (?boq=12), so one can be linked to and the back button closes it. */
export function useBoqLinks() {
    const [params, setParams] = useSearchParams();
    const id = Number(params.get("boq"));
    return {
        /** The BOQ the link asks for, if it names one. */
        id: Number.isInteger(id) && id > 0 ? id : null,
        open: (boqId: number) => { params.set("boq", String(boqId)); setParams(params); },
        close: () => { params.delete("boq"); setParams(params, { replace: true }); },
    };
}
