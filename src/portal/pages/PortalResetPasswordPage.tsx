import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { z } from "zod";
import { toApiError } from "@/api/errors";
import AuthLayout from "@/auth/AuthLayout";
import { newPassword, PASSWORD_HINT } from "@/auth/passwordRules";
import Field, { FieldError } from "@/shared/components/Forms/Field";
import { useForm } from "@/shared/components/Forms/useForm";
import Icon from "@/shared/icons/Icon";
import { portalAnonymous } from "../portalApi";

const schema = z
    .object({ password: newPassword, repeat: z.string() })
    .refine((v) => v.password === v.repeat, { path: ["repeat"], message: "The two passwords don't match." });

/** A client chooses a new password from the emailed link (?token=). */
export default function PortalResetPasswordPage() {
    const [params, setParams] = useSearchParams();
    const [token] = useState(() => params.get("token") ?? "");
    useEffect(() => {
        if (params.has("token")) setParams({}, { replace: true });
    }, [params, setParams]);
    const form = useForm({ password: "", repeat: "" }, schema);
    const [busy, setBusy] = useState(false);
    const [state, setState] = useState<"form" | "done" | "invalid">(token ? "form" : "invalid");

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (!form.validate()) return;
        setBusy(true);
        try {
            await portalAnonymous("/auth/reset-password", { token, password: form.values.password });
            setState("done");
        } catch (error) {
            if (toApiError(error).code === "password_reset_invalid") setState("invalid");
            else form.fail(error);
        } finally {
            setBusy(false);
        }
    }

    if (state === "done") {
        return (
            <AuthLayout title="Your password is changed">
                <div className="banner ok">
                    <Icon name="checkCircle" />
                    <div className="grow">You're signed out everywhere. Sign in with your new password.</div>
                </div>
                <Link className="btn btn-primary btn-lg btn-block" to="/portal/login">Sign in</Link>
            </AuthLayout>
        );
    }

    if (state === "invalid") {
        return (
            <AuthLayout title="This link doesn't work any more">
                <div className="banner hold">
                    <Icon name="alert" />
                    <div className="grow">Reset links work once, for 30 minutes, and a newer one cancels older ones. Ask for a fresh link.</div>
                </div>
                <Link className="btn btn-primary btn-lg btn-block" to="/portal/forgot-password">Send a new link</Link>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout title="Choose a new password">
            <form className="stack" onSubmit={submit} noValidate>
                <Field id="pr-pass" label="New password" required error={form.error("password")} hint={PASSWORD_HINT}>
                    <input id="pr-pass" className="input" type="password" autoComplete="new-password" autoFocus
                        value={form.values.password} onChange={(e) => form.set("password", e.target.value)} onBlur={form.touch("password")} />
                </Field>
                <Field id="pr-repeat" label="Repeat it" required error={form.error("repeat")}>
                    <input id="pr-repeat" className="input" type="password" autoComplete="new-password"
                        value={form.values.repeat} onChange={(e) => form.set("repeat", e.target.value)} onBlur={form.touch("repeat")} />
                </Field>
                <FieldError message={form.errors.form} />
                <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
                    {busy ? "Saving…" : "Save the new password"}
                </button>
            </form>
        </AuthLayout>
    );
}
