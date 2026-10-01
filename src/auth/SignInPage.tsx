import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, type Location } from "react-router";
import { z } from "zod";
import { toApiError } from "@/api/errors";
import { useSession } from "@/app/session/useSession";
import Field, { FieldError } from "@/shared/components/Forms/Field";
import { useForm } from "@/shared/components/Forms/useForm";
import Icon from "@/shared/icons/Icon";
import AuthLayout from "./AuthLayout";
import { email } from "./passwordRules";

const schema = z.object({ email, password: z.string().min(1, "Enter your password.") });

/** Sign in with email and password. After it, the account decides what the person sees. */
export default function SignInPage() {
    const { signIn, notice } = useSession();
    const navigate = useNavigate();
    const location = useLocation();
    const form = useForm({ email: "", password: "" }, schema);
    const [busy, setBusy] = useState(false);

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (!form.validate()) return;
        setBusy(true);
        try {
            await signIn(form.values.email.trim(), form.values.password);
            const from = (location.state as { from?: Location } | null)?.from;
            navigate(from && from.pathname !== "/login" ? from : "/", { replace: true });
        } catch (error) {
            const apiError = toApiError(error);
            if (apiError.code === "invalid_credentials") form.setErrors({ form: "That email and password don't match an account." });
            else form.fail(error);
        } finally {
            setBusy(false);
        }
    }

    return (
        <AuthLayout title="Sign in" sub="Projects, work entries and the time behind them.">
            {notice && (
                <div className="banner hold">
                    <Icon name="info" />
                    <div className="grow">{notice}</div>
                </div>
            )}
            <form className="stack" onSubmit={submit} noValidate>
                <Field id="si-email" label="Work email" required error={form.errors.email}>
                    <input
                        id="si-email"
                        className="input"
                        type="email"
                        autoComplete="username"
                        autoFocus
                        value={form.values.email}
                        onChange={(e) => form.set("email", e.target.value)}
                    />
                </Field>
                <Field id="si-pass" label="Password" required error={form.errors.password}>
                    <input
                        id="si-pass"
                        className="input"
                        type="password"
                        autoComplete="current-password"
                        value={form.values.password}
                        onChange={(e) => form.set("password", e.target.value)}
                    />
                </Field>
                <FieldError message={form.errors.form} />
                <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
                    {busy ? "Signing in…" : "Sign in"}
                </button>
                <div className="spread" style={{ justifyContent: "flex-end" }}>
                    <Link className="link" style={{ fontSize: "11.5px" }} to="/forgot-password">Forgot password?</Link>
                </div>
            </form>
        </AuthLayout>
    );
}
