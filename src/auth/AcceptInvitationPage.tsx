import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { z } from "zod";
import { anonymous } from "@/api/http";
import type { AuthResponse, Schemas } from "@/api/types";
import { useSession } from "@/app/session/useSession";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import LoadError from "@/shared/components/Feedback/LoadError";
import Field, { FieldError } from "@/shared/components/Forms/Field";
import { useForm } from "@/shared/components/Forms/useForm";
import { fmtDateY } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import AuthLayout from "./AuthLayout";
import { newPassword, PASSWORD_HINT } from "./passwordRules";

type Preview = Schemas["InvitationPreviewResponse"];

const schema = z
    .object({
        firstName: z.string().trim().min(1, "Enter your first name.").max(100, "At most 100 characters."),
        lastName: z.string().trim().min(1, "Enter your last name.").max(100, "At most 100 characters."),
        phone: z.string().trim().refine((v) => v === "" || /^\+?[0-9 ()-]{6,32}$/.test(v), "Enter a phone number, e.g. +961 3 123 456."),
        password: newPassword,
        repeat: z.string(),
    })
    .refine((v) => v.password === v.repeat, { path: ["repeat"], message: "The two passwords don't match." });

const ROLE_LABEL: Record<string, string> = { super_admin: "super admin", admin: "admin", employee: "employee" };

/** Creates the account an invitation was sent for (?token=), and signs the person in. */
export default function AcceptInvitationPage() {
    const [params] = useSearchParams();
    const token = params.get("token") ?? "";
    const navigate = useNavigate();
    const { adopt } = useSession();
    const form = useForm({ firstName: "", lastName: "", phone: "", password: "", repeat: "" }, schema);
    const [busy, setBusy] = useState(false);

    const preview = useQuery({
        queryKey: ["invitation", token],
        queryFn: () => anonymous<Preview>("post", "/invitations/validate", { token }),
        enabled: token !== "",
        retry: false,
    });

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (!form.validate()) return;
        setBusy(true);
        try {
            const auth = await anonymous<AuthResponse>("post", "/invitations/accept", {
                token,
                firstName: form.values.firstName.trim(),
                lastName: form.values.lastName.trim(),
                phone: form.values.phone.trim() || null,
                password: form.values.password,
            });
            adopt(auth);
            navigate("/", { replace: true });
        } catch (error) {
            form.fail(error);
        } finally {
            setBusy(false);
        }
    }

    if (!token || preview.error) {
        const invalid = !token || (preview.error as { status?: number }).status === 404;
        return (
            <AuthLayout title={invalid ? "This invitation doesn't work any more" : "Your invitation"}>
                {invalid ? (
                    <div className="banner hold">
                        <Icon name="alert" />
                        <div className="grow">The link may have expired (invitations last 7 days), been used already, or been replaced by a newer one. Ask whoever invited you to send it again.</div>
                    </div>
                ) : (
                    <LoadError error={preview.error} retry={() => preview.refetch()} what="the invitation" />
                )}
                <Link className="btn btn-block" to="/login">Go to sign in</Link>
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
    const joining = [ROLE_LABEL[invite.role] ?? invite.role, invite.domain && `in ${invite.domain === "design" ? "Design" : "Execution"}`]
        .filter(Boolean)
        .join(" ");

    return (
        <AuthLayout
            title="Create your account"
            sub={<>You're joining as {joining}{invite.position ? `, ${invite.position}` : ""}{invite.team ? ` · ${invite.team}` : ""}.</>}
        >
            <form className="stack" onSubmit={submit} noValidate>
                <Field id="ai-email" label="Work email" hint={`The invitation is valid until ${fmtDateY(invite.expiresAt)}.`}>
                    <input id="ai-email" className="input" type="email" value={invite.email} readOnly />
                </Field>
                <div className="grid g-2">
                    <Field id="ai-first" label="First name" required error={form.errors.firstName}>
                        <input id="ai-first" className="input" autoComplete="given-name" autoFocus
                            value={form.values.firstName} onChange={(e) => form.set("firstName", e.target.value)} />
                    </Field>
                    <Field id="ai-last" label="Last name" required error={form.errors.lastName}>
                        <input id="ai-last" className="input" autoComplete="family-name"
                            value={form.values.lastName} onChange={(e) => form.set("lastName", e.target.value)} />
                    </Field>
                </div>
                <Field id="ai-phone" label="Phone" error={form.errors.phone}>
                    <input id="ai-phone" className="input" type="tel" autoComplete="tel" placeholder="Optional"
                        value={form.values.phone} onChange={(e) => form.set("phone", e.target.value)} />
                </Field>
                <Field id="ai-pass" label="Password" required error={form.errors.password} hint={PASSWORD_HINT}>
                    <input id="ai-pass" className="input" type="password" autoComplete="new-password"
                        value={form.values.password} onChange={(e) => form.set("password", e.target.value)} />
                </Field>
                <Field id="ai-repeat" label="Repeat the password" required error={form.errors.repeat}>
                    <input id="ai-repeat" className="input" type="password" autoComplete="new-password"
                        value={form.values.repeat} onChange={(e) => form.set("repeat", e.target.value)} />
                </Field>
                <FieldError message={form.errors.form} />
                <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
                    {busy ? "Creating your account…" : "Create account"}
                </button>
            </form>
        </AuthLayout>
    );
}
