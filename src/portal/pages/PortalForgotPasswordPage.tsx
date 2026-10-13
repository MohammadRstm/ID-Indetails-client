import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { z } from "zod";
import AuthLayout from "@/auth/AuthLayout";
import { email } from "@/auth/passwordRules";
import Field, { FieldError } from "@/shared/components/Forms/Field";
import { useForm } from "@/shared/components/Forms/useForm";
import Icon from "@/shared/icons/Icon";
import { portalAnonymous } from "../portalApi";

const schema = z.object({ email });

/** A client asks for a reset link. The answer is the same whether or not the address has an account. */
export default function PortalForgotPasswordPage() {
    const form = useForm({ email: "" }, schema);
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState(false);

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (!form.validate()) return;
        setBusy(true);
        try {
            await portalAnonymous("/auth/forgot-password", { email: form.values.email.trim() });
            setSent(true);
        } catch (error) {
            form.fail(error);
        } finally {
            setBusy(false);
        }
    }

    if (sent) {
        return (
            <AuthLayout title="Check your email">
                <div className="banner ok">
                    <Icon name="mail" />
                    <div className="grow">
                        If a client portal account uses <b>{form.values.email.trim()}</b>, a link to choose a new password is on its way.
                        It works once, for 30 minutes.
                    </div>
                </div>
                <Link className="btn btn-block" to="/portal/login">Back to sign in</Link>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout title="Reset your password" sub="We'll email you a link to choose a new one.">
            <form className="stack" onSubmit={submit} noValidate>
                <Field id="pf-email" label="Email" required error={form.errors.email}>
                    <input id="pf-email" className="input" type="email" autoComplete="username" autoFocus
                        value={form.values.email} onChange={(e) => form.set("email", e.target.value)} />
                </Field>
                <FieldError message={form.errors.form} />
                <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
                    {busy ? "Sending…" : "Send the link"}
                </button>
                <div className="spread" style={{ justifyContent: "flex-end" }}>
                    <Link className="link" style={{ fontSize: "11.5px" }} to="/portal/login">Back to sign in</Link>
                </div>
            </form>
        </AuthLayout>
    );
}
