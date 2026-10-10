"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "../../../lib/convex";
import Icon from "../../../components/Icon";

export default function ResetPassword() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const features = useQuery(api.users.authFeatures) as { passwordReset: boolean } | undefined;
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function request(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const address = String(new FormData(e.currentTarget).get("email") ?? "").trim().toLowerCase();
    // Same answer whether or not the address has an account, so this page cannot be used to find out who is registered.
    try { await signIn("password", { flow: "reset", email: address }); } catch { /* deliberately ignored */ }
    setEmail(address);
    setBusy(false);
  }

  async function choose(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await signIn("password", { flow: "reset-verification", email: email!, code: String(fd.get("code") ?? "").trim(), newPassword: String(fd.get("newPassword") ?? "") });
      router.push("/");
      router.refresh();
    } catch {
      setError("That code is wrong or has expired, or the password is shorter than 8 characters.");
    } finally {
      setBusy(false);
    }
  }

  if (features && !features.passwordReset) {
    return (
      <div className="page page--auth"><div className="card auth">
        <h1 className="auth__title">Password reset unavailable</h1>
        <p className="auth__sub">Email isn&apos;t set up for this site yet, so we can&apos;t send a reset code. Contact support to get back into your account.</p>
        <Link href="/signin" className="link-btn">Back to sign in</Link>
      </div></div>
    );
  }

  return (
    <div className="page page--auth">
      <div className="card auth">
        <h1 className="auth__title">{email ? "Choose a new password" : "Reset your password"}</h1>
        <p className="auth__sub">{email ? `If ${email} has an account, we've sent it an 8 digit code. It expires in 20 minutes.` : "Enter your email and we'll send you a code."}</p>
        {error && <div className="banner banner--error" role="alert"><Icon name="alert" size={20} className="banner__icon" /><div>{error}</div></div>}
        {!email ? (
          <form className="form" method="post" onSubmit={request}>
            <div className="field">
              <label htmlFor="email" className="field__label">Email</label>
              <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
            </div>
            <button className="btn btn--primary btn--block" disabled={busy}>{busy ? "Sending" : "Send code"}</button>
          </form>
        ) : (
          <form className="form" method="post" onSubmit={choose}>
            <div className="field">
              <label htmlFor="code" className="field__label">Code</label>
              <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{8}" maxLength={8} required />
            </div>
            <div className="field">
              <label htmlFor="newPassword" className="field__label">New password</label>
              <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
              <p className="field__hint">At least 8 characters. Your other devices are signed out within the hour.</p>
            </div>
            <button className="btn btn--primary btn--block" disabled={busy}>{busy ? "Saving" : "Set password and sign in"}</button>
          </form>
        )}
        <Link href="/signin" className="link-btn">Back to sign in</Link>
      </div>
    </div>
  );
}
