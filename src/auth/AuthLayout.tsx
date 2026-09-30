import type { ReactNode } from "react";
import Logo from "@/shared/components/Identity/Logo";
import { useBranding } from "@/shared/components/Identity/useBranding";

type AuthLayoutProps = {
    title: string;
    sub?: ReactNode;
    children: ReactNode;
};

/** The prototype's sign-in card: logo, a heading, and the form under it. */
export default function AuthLayout({ title, sub, children }: AuthLayoutProps) {
    const branding = useBranding();
    return (
        <div className="auth auth-solo">
            <div className="auth-pane">
                <div className="auth-card">
                    <div className="row" style={{ gap: 10 }}>
                        <Logo size={34} />
                        <div>
                            <div className="logo-name" style={{ fontSize: 16 }}>Hourline</div>
                            <div className="logo-sub">{branding.data?.name ?? ""}</div>
                        </div>
                    </div>
                    <div>
                        <h1 className="auth-h">{title}</h1>
                        {sub && <p className="muted" style={{ marginTop: 4 }}>{sub}</p>}
                    </div>
                    {children}
                </div>
            </div>
        </div>
    );
}
