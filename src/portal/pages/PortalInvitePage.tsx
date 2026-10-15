import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { z } from "zod";
import { toApiError } from "@/api/errors";
import AuthLayout from "@/auth/AuthLayout";
import { newPassword, PASSWORD_HINT } from "@/auth/passwordRules";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import LoadError from "@/shared/components/Feedback/LoadError";
import Field, { FieldError } from "@/shared/components/Forms/Field";
import { useForm } from "@/shared/components/Forms/useForm";
import { fmtDateY, fmtTime } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { portalAnonymous, type PortalAuthResponse, type PortalInvitationPreview } from "../portalApi";
import { accountName, usePortalSession } from "../portalSession";

const schema = z
    .object({
        firstName: z.string().trim().min(1, "Enter your first name.").max(100, "At most 100 characters."),
        lastName: z.string().trim().min(1, "Enter your last name.").max(100, "At most 100 characters."),
        password: newPassword,
        repeat: z.string(),
    })
    .refine((v) => v.password === v.repeat, { path: ["repeat"], message: "The two passwords don't match." });

/** Why a link can't be used, in the client's words. */
const REFUSED: Record<string, { title: string; text: string; signIn?: boolean }> = {
    portal_invitation_invalid: {
        title: "This link isn't valid",
        text: "Check that you opened the whole link from the email. If it still doesn't work, ask your project contact for a new invitation.",
    },
    portal_invitation_expired: {
        title: "This invitation has expired",
        text: "Invitation links work for 24 hours. Ask your project contact to send you a new one.",
    },
    portal_invitation_revoked: {
        title: "This invitation was cancelled",
        text: "A newer invitation may have replaced it. Use the latest email, or ask your project contact.",
    },
    portal_invitation_used: {
        title: "You've already set up your account",
        text: "Sign in with your email address and the password you chose.",
        signIn: true,
    },
};

/** A client opens their invitation (?token=), enters their name, chooses their own password and is signed in. */
export default function PortalInvitePage() {
    const [params, setParams] = useSearchParams();
    // Read once, then taken out of the address bar and the history, so the link's token isn't left behind.
    const [token] = useState(() => params.get("token") ?? "");
    useEffect(() => {
        if (params.has("token")) setParams({}, { replace: true });
    }, [params, setParams]);
    const navigate = useNavigate();
    const { status, account, adopt, signOut } = usePortalSession();
    const form = useForm({ firstName: "", lastName: "", password: "", repeat: "" }, schema);
    const [busy, setBusy] = useState(false);
    // set up and signed in by this page: on the way to their projects
    const [accepted, setAccepted] = useState(false);
    const [refusedCode, setRefusedCode] = useState<string | null>(token ? null : "portal_invitation_invalid");

    const preview = useQuery({
        queryKey: ["portal", "invitation", token],
        queryFn: () => portalAnonymous<PortalInvitationPreview>("/invitations/validate", { token }),
        // asked once nobody is signed in to the portal here (see below)
        enabled: token !== "" && status === "signedOut",
        retry: false,
    });

    async function signOutFirst() {
        setBusy(true);
        // a failure says so itself, and leaves the client signed in
        await signOut();
        setBusy(false);
    }

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (!form.validate()) return;
        setBusy(true);
        try {
            const auth = await portalAnonymous<PortalAuthResponse>("/invitations/accept", {
                token,
                firstName: form.values.firstName.trim(),
                lastName: form.values.lastName.trim(),
                password: form.values.password,
            });
            setAccepted(true);
            adopt(auth);
            navigate("/portal", { replace: true });
        } catch (error) {
            const code = toApiError(error).code;
            if (code in REFUSED) setRefusedCode(code);
            else form.fail(error);
        } finally {
            setBusy(false);
        }
    }

    const code = refusedCode ?? (preview.error ? toApiError(preview.error).code : null);
    if (code && REFUSED[code]) {
        const refused = REFUSED[code];
        return (
            <AuthLayout title={refused.title}>
                <div className="banner hold">
                    <Icon name="alert" />
                    <div className="grow">{refused.text}</div>
                </div>
                <Link className={refused.signIn ? "btn btn-primary btn-lg btn-block" : "btn btn-block"} to="/portal/login">Go to sign in</Link>
            </AuthLayout>
        );
    }

    // Someone is signed in to the portal in this browser: accepting would put the new account in their place, so they sign
    // out first, knowingly.
    if (status === "signedIn" && account && !accepted) {
        return (
            <AuthLayout title="Your invitation">
                <div className="banner hold">
                    <Icon name="info" />
                    <div className="grow">You're signed in to the client portal as <b>{accountName(account)}</b>. Sign out to set up the account this invitation is for.</div>
                </div>
                <button type="button" className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => void signOutFirst()}>
                    {busy ? "Signing out…" : "Sign out and continue"}
                </button>
                <Link className="btn btn-block" to="/portal">Back to your projects</Link>
            </AuthLayout>
        );
    }

    if (preview.error) {
        return (
            <AuthLayout title="Your invitation">
                <LoadError error={preview.error} retry={() => preview.refetch()} what="the invitation" />
            </AuthLayout>
        );
    }

    if (!preview.data) {
        return (
            <AuthLayout title="Your invitation">
                <SkeletonLines lines={4} />
            </AuthLayout>
        );
    }

    const invite = preview.data;
    return (
        <AuthLayout title="Set up your account" sub={<>You're invited to follow <b>{invite.projectTitle}</b>.</>}>
            <form className="stack" onSubmit={submit} noValidate>
                <Field id="pi-email" label="Email" hint={`This link works until ${fmtDateY(invite.expiresAt)}, ${fmtTime(invite.expiresAt)}.`}>
                    <input id="pi-email" className="input" type="email" value={invite.email} readOnly autoComplete="username" />
                </Field>
                <div className="grid g-2">
                    <Field id="pi-first" label="First name" required error={form.error("firstName")}>
                        <input id="pi-first" className="input" autoComplete="given-name" autoFocus
                            value={form.values.firstName} onChange={(e) => form.set("firstName", e.target.value)} onBlur={form.touch("firstName")} />
                    </Field>
                    <Field id="pi-last" label="Last name" required error={form.error("lastName")}>
                        <input id="pi-last" className="input" autoComplete="family-name"
                            value={form.values.lastName} onChange={(e) => form.set("lastName", e.target.value)} onBlur={form.touch("lastName")} />
                    </Field>
                </div>
                <Field id="pi-pass" label="Choose a password" required error={form.error("password")} hint={PASSWORD_HINT}>
                    <input id="pi-pass" className="input" type="password" autoComplete="new-password"
                        value={form.values.password} onChange={(e) => form.set("password", e.target.value)} onBlur={form.touch("password")} />
                </Field>
                <Field id="pi-repeat" label="Repeat the password" required error={form.error("repeat")}>
                    <input id="pi-repeat" className="input" type="password" autoComplete="new-password"
                        value={form.values.repeat} onChange={(e) => form.set("repeat", e.target.value)} onBlur={form.touch("repeat")} />
                </Field>
                <FieldError message={form.errors.form} />
                <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
                    {busy ? "Setting up your account…" : "Set up my account"}
                </button>
            </form>
        </AuthLayout>
    );
}
