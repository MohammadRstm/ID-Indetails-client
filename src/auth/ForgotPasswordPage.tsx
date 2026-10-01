import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { z } from "zod";
import { anonymous } from "@/api/http";
import Field, { FieldError } from "@/shared/components/Forms/Field";
import { useForm } from "@/shared/components/Forms/useForm";
import Icon from "@/shared/icons/Icon";
import AuthLayout from "./AuthLayout";
import { email } from "./passwordRules";

const schema = z.object({ email });

/** Asks for a reset link. The API answers the same whether or not the address has an account. */
export default function ForgotPasswordPage() {
    const form = useForm({ email: "" }, schema);
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState(false);

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (!form.validate()) return;
        setBusy(true);
        try {
            await anonymous("post", "/auth/forgot-password", { email: form.values.email.trim() });
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
                        If an account uses <b>{form.values.email.trim()}</b>, a link to choose a new password is on its way.
                        It works once, for 30 minutes.
                    </div>
                </div>
                <Link className="btn btn-block" to="/login">Back to sign in</Link>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout title="Reset your password" sub="We'll email you a link to choose a new one.">
            <form className="stack" onSubmit={submit} noValidate>
                <Field id="fp-email" label="Work email" required error={form.errors.email}>
                    <input
                        id="fp-email"
                        className="input"
                        type="email"
                        autoComplete="username"
                        autoFocus
                        value={form.values.email}
                        onChange={(e) => form.set("email", e.target.value)}
                    />
                </Field>
                <FieldError message={form.errors.form} />
                <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
                    {busy ? "Sending…" : "Send the link"}
                </button>
                <div className="spread" style={{ justifyContent: "flex-end" }}>
                    <Link className="link" style={{ fontSize: "11.5px" }} to="/login">Back to sign in</Link>
                </div>
            </form>
        </AuthLayout>
    );
}
