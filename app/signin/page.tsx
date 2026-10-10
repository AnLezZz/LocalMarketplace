"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../lib/convex";
import Icon from "../../components/Icon";

export default function SignIn() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Set when email verification is on and the account still needs its code.
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const features = useQuery(api.users.authFeatures) as { passwordReset: boolean; emailVerification: boolean } | undefined;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("email", String(fd.get("email") ?? "").trim().toLowerCase());
    fd.set("flow", flow);
    try {
      const r = await signIn("password", fd);
      if (!r.signingIn) { setVerifyEmail(String(fd.get("email"))); return; }
      router.push("/");
      router.refresh();
    } catch {
      setError(flow === "signIn"
        ? "Wrong email or password."
        : "Could not create that account. Try a different email, and use at least 8 characters for your password.");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn("password", { flow: "email-verification", email: verifyEmail!, code: String(new FormData(e.currentTarget).get("code") ?? "").trim() });
      router.push("/");
      router.refresh();
    } catch {
      setError("That code is wrong or has expired. Sign in again to get a new one.");
    } finally {
      setBusy(false);
    }
  }

  function switchTo(next: "signIn" | "signUp") {
    setError(null);
    setFlow(next);
  }

  if (verifyEmail) {
    return (
      <div className="page page--auth">
        <div className="card auth">
          <h1 className="auth__title">Check your email</h1>
          <p className="auth__sub">We sent an 8 digit code to {verifyEmail}. Enter it to finish signing in.</p>
          {error && <div className="banner banner--error" role="alert"><Icon name="alert" size={20} className="banner__icon" /><div>{error}</div></div>}
          <form className="form" method="post" onSubmit={onVerify}>
            <div className="field">
              <label htmlFor="code" className="field__label">Code</label>
              <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{8}" maxLength={8} required />
            </div>
            <button className="btn btn--primary btn--block" disabled={busy}>{busy ? "Checking" : "Verify and continue"}</button>
          </form>
          <button type="button" className="link-btn" onClick={() => { setVerifyEmail(null); setError(null); }}>Use a different email</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page page--auth">
      <div className="card auth">
        <h1 className="auth__title">{flow === "signIn" ? "Sign in" : "Create an account"}</h1>
        <p className="auth__sub">{flow === "signIn" ? "Welcome back to Localo." : "Book local pros, or apply to offer your services."}</p>
        <div className="segmented" role="group" aria-label="Sign in or create an account">
          <button type="button" className="segmented__btn" aria-pressed={flow === "signIn"} onClick={() => switchTo("signIn")}>Sign in</button>
          <button type="button" className="segmented__btn" aria-pressed={flow === "signUp"} onClick={() => switchTo("signUp")}>Create account</button>
        </div>
        {error && <div className="banner banner--error" role="alert"><Icon name="alert" size={20} className="banner__icon" /><div>{error}</div></div>}
        <form className="form" method="post" onSubmit={onSubmit}>
          {flow === "signUp" && (
            <div className="field">
              <label htmlFor="name" className="field__label">Your name</label>
              <input id="name" name="name" autoComplete="name" required />
            </div>
          )}
          <div className="field">
            <label htmlFor="email" className="field__label">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
          </div>
          <div className="field">
            <label htmlFor="password" className="field__label">Password</label>
            <input id="password" name="password" type="password" aria-describedby="password-hint" autoComplete={flow === "signIn" ? "current-password" : "new-password"} minLength={8} required />
            <p id="password-hint" className="field__hint">At least 8 characters.</p>
          </div>
          {flow === "signIn" && features?.passwordReset && <Link href="/signin/reset" className="link-btn">Forgot your password?</Link>}
          <button className="btn btn--primary btn--block" disabled={busy}>{busy ? (flow === "signIn" ? "Signing in" : "Creating account") : flow === "signIn" ? "Sign in" : "Create account"}</button>
        </form>
      </div>
    </div>
  );
}
