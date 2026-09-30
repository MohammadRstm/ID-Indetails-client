import { useBranding } from "./useBranding";

/** The company logo when one is uploaded, otherwise Hourline's mark. */
export default function Logo({ size = 27 }: { size?: number }) {
    const branding = useBranding();
    if (branding.data?.hasLogo) {
        return (
            <img
                className="logo-mark"
                // the file changes with every new logo, so a cached old one is never shown
                src={`/api/company/logo?v=${branding.data.logoFileId ?? ""}`}
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
