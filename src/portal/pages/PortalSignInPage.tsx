import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { z } from "zod";
import { toApiError } from "@/api/errors";
import AuthLayout from "@/auth/AuthLayout";
import { email } from "@/auth/passwordRules";
import Field, { FieldError } from "@/shared/components/Forms/Field";
import { useForm } from "@/shared/components/Forms/useForm";
import Icon from "@/shared/icons/Icon";
import { usePortalSession } from "../portalSession";

const schema = z.object({ email, password: z.string().min(1, "Enter your password.") });

/** A client signs in to follow their projects. */
export default function PortalSignInPage() {
    const { status, signIn, notice } = usePortalSession();
    const navigate = useNavigate();
    const form = useForm({ email: "", password: "" }, schema);
    const [busy, setBusy] = useState(false);

    if (status === "signedIn") return <Navigate to="/portal" replace />;

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (!form.validate()) return;
        setBusy(true);
        try {
            await signIn(form.values.email.trim(), form.values.password);
            navigate("/portal", { replace: true });
        } catch (error) {
            const apiError = toApiError(error);
            if (apiError.code === "invalid_credentials") {
                form.setErrors({ form: "That email and password don't match. After several wrong attempts, sign-in pauses for a few minutes." });
            } else form.fail(error);
        } finally {
            setBusy(false);
        }
    }

    return (
        <AuthLayout title="Client portal" sub="Sign in to follow your project.">
            {notice && (
                <div className="banner hold">
                    <Icon name="info" />
                    <div className="grow">{notice}</div>
                </div>
            )}
            <form className="stack" onSubmit={submit} noValidate>
                <Field id="ps-email" label="Email" required error={form.errors.email}>
                    <input id="ps-email" className="input" type="email" autoComplete="username" autoFocus
                        value={form.values.email} onChange={(e) => form.set("email", e.target.value)} />
                </Field>
                <Field id="ps-pass" label="Password" required error={form.errors.password}>
                    <input id="ps-pass" className="input" type="password" autoComplete="current-password"
                        value={form.values.password} onChange={(e) => form.set("password", e.target.value)} />
                </Field>
                <FieldError message={form.errors.form} />
                <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
                    {busy ? "Signing in…" : "Sign in"}
                </button>
                <div className="spread" style={{ justifyContent: "flex-end" }}>
                    <Link className="link" style={{ fontSize: "11.5px" }} to="/portal/forgot-password">Forgot password?</Link>
                </div>
            </form>
            <p className="hint">Accounts are created by invitation from your project team.</p>
        </AuthLayout>
    );
}
