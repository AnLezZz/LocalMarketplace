"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Icon from "../../components/Icon";

export default function SignIn() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("email", String(fd.get("email") ?? "").trim().toLowerCase());
    fd.set("flow", flow);
    try {
      await signIn("password", fd);
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

  function switchTo(next: "signIn" | "signUp") {
    setError(null);
    setFlow(next);
  }

  return (
    <div className="page page--auth">
      <div className="card auth">
        <h1 className="auth__title">{flow === "signIn" ? "Sign in" : "Create an account"}</h1>
        <p className="auth__sub">{flow === "signIn" ? "Welcome back to LocalHub." : "Book local pros, or apply to offer your services."}</p>
        <div className="segmented" role="group" aria-label="Sign in or create an account">
          <button type="button" className="segmented__btn" aria-pressed={flow === "signIn"} onClick={() => switchTo("signIn")}>Sign in</button>
          <button type="button" className="segmented__btn" aria-pressed={flow === "signUp"} onClick={() => switchTo("signUp")}>Create account</button>
        </div>
        {error && <div className="banner banner--error" role="alert"><Icon name="alert" size={20} className="banner__icon" /><div>{error}</div></div>}
        <form className="form" onSubmit={onSubmit}>
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
          <button className="btn btn--primary btn--block" disabled={busy}>{busy ? (flow === "signIn" ? "Signing in" : "Creating account") : flow === "signIn" ? "Sign in" : "Create account"}</button>
        </form>
      </div>
    </div>
  );
}
