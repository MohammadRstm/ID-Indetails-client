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

/** The company logo when one is uploaded, otherwise Hourline's mark. */
export default function Logo({ size = 27 }: { size?: number }) {
    const branding = useBranding();
    if (branding.data?.hasLogo) {
        return (
            <img
                className="logo-mark"
                src="/api/company/logo"
                width={size}
                height={size}
                alt=""
                style={{ width: size, height: size, borderRadius: 8, objectFit: "cover" }}
            />
        );
    }

    return (
        <svg className="logo-mark" viewBox="0 0 28 28" width={size} height={size} aria-hidden="true">
            <rect x="0.6" y="0.6" width="26.8" height="26.8" rx="8" fill="var(--accent)" />
            <circle cx="14" cy="14" r="7.6" fill="none" stroke="var(--on-accent)" strokeWidth="1.7" opacity="0.55" />
            <path d="M14 8.6V14h5.2" fill="none" stroke="var(--on-accent)" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}
