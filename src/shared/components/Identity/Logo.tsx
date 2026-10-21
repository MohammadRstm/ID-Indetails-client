import { COMPANY_MARK, COMPANY_MARK_BOX } from "./companyMark";
import { useBranding } from "./useBranding";

/** The company logo when one is uploaded, otherwise the company's mark on a tile, as on the favicon. */
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
            {/* black on white in light mode, white on black in dark: the logo sheet's two ways */}
            <rect x="0.6" y="0.6" width="26.8" height="26.8" rx="8" fill="var(--ink)" />
            <svg x="7.5" y="2.6" width="13" height="22.8" viewBox={COMPANY_MARK_BOX}>
                <path fill="var(--surface)" d={COMPANY_MARK} />
            </svg>
        </svg>
    );
}
