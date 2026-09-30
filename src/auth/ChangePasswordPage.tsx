import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { z } from "zod";
import { http } from "@/api/http";
import type { AuthResponse } from "@/api/types";
import { useSession } from "@/app/session/useSession";
import Field, { FieldError } from "@/shared/components/Forms/Field";
import { useForm } from "@/shared/components/Forms/useForm";
import Icon from "@/shared/icons/Icon";
import AuthLayout from "./AuthLayout";
import { newPassword, PASSWORD_HINT } from "./passwordRules";

const schema = z
    .object({ currentPassword: z.string().min(1, "Enter the password you signed in with."), newPassword, repeat: z.string() })
    .refine((v) => v.newPassword === v.repeat, { path: ["repeat"], message: "The two passwords don't match." })
    .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], message: "Choose a password different from the current one." });

/**
 * Changes the signed-in person's password. Someone with a temporary password lands here first: the API
 * refuses everything else until it is done. The answer carries a new access token.
 */
export default function ChangePasswordPage() {
    const { user, adopt, signOut } = useSession();
    const navigate = useNavigate();
    const form = useForm({ currentPassword: "", newPassword: "", repeat: "" }, schema);
    const [busy, setBusy] = useState(false);
    const required = user?.mustChangePassword ?? false;

    async function submit(e: FormEvent) {
        e.preventDefault();
        if (!form.validate()) return;
        setBusy(true);
        try {
            const { data } = await http.post<AuthResponse>("/auth/change-password", {
                currentPassword: form.values.currentPassword,
                newPassword: form.values.newPassword,
            });
            adopt(data);
            navigate("/", { replace: true });
        } catch (error) {
            form.fail(error);
        } finally {
            setBusy(false);
        }
    }

    return (
        <AuthLayout
            title={required ? "Choose your own password" : "Change your password"}
            sub={required ? "You signed in with a temporary password. Pick one of your own to carry on." : "Every other device you're signed in on is signed out."}
        >
            <form className="stack" onSubmit={submit} noValidate>
                <Field id="cp-current" label={required ? "Temporary password" : "Current password"} error={form.errors.currentPassword}>
                    <input id="cp-current" className="input" type="password" autoComplete="current-password" autoFocus
                        value={form.values.currentPassword} onChange={(e) => form.set("currentPassword", e.target.value)} />
                </Field>
                <Field id="cp-new" label="New password" error={form.errors.newPassword} hint={PASSWORD_HINT}>
                    <input id="cp-new" className="input" type="password" autoComplete="new-password"
                        value={form.values.newPassword} onChange={(e) => form.set("newPassword", e.target.value)} />
                </Field>
                <Field id="cp-repeat" label="Repeat it" error={form.errors.repeat}>
                    <input id="cp-repeat" className="input" type="password" autoComplete="new-password"
                        value={form.values.repeat} onChange={(e) => form.set("repeat", e.target.value)} />
                </Field>
                <FieldError message={form.errors.form} />
                <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
                    {busy ? "Saving…" : "Save password"}
                </button>
                <div className="spread" style={{ justifyContent: "flex-end" }}>
                    {required ? (
                        <button type="button" className="btn btn-quiet btn-sm" onClick={() => signOut()}>
                            <Icon name="logout" />Sign out
                        </button>
                    ) : (
                        <button type="button" className="btn btn-quiet btn-sm" onClick={() => navigate(-1)}>Cancel</button>
                    )}
                </div>
            </form>
        </AuthLayout>
    );
}
