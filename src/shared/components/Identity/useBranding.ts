import { useQuery } from "@tanstack/react-query";
import { anonymous } from "@/api/http";
import type { Schemas } from "@/api/types";

type Branding = Schemas["BrandingResponse"];

/** The company's name and whether it has a logo; public, so the sign-in page can show them too. */
export function useBranding() {
    return useQuery({
        queryKey: ["company", "branding"],
        queryFn: () => anonymous<Branding>("get", "/company/branding"),
        staleTime: 10 * 60_000,
    });
}
