"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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

  return (
    <>
      <h1>{flow === "signIn" ? "Sign in" : "Create an account"}</h1>
      {error && <p className="msg" role="alert">{error}</p>}
      <form className="stack" onSubmit={onSubmit}>
        {flow === "signUp" && <input name="name" placeholder="Your name" autoComplete="name" required />}
        <input name="email" type="email" placeholder="Email" autoComplete="email" required />
        <input name="password" type="password" placeholder="Password (8+ characters)" autoComplete={flow === "signIn" ? "current-password" : "new-password"} minLength={8} required />
        <button disabled={busy}>{flow === "signIn" ? "Sign in" : "Create account"}</button>
      </form>
      <p className="muted">
        {flow === "signIn" ? "New here? " : "Already have an account? "}
        <a href="#" onClick={(e) => { e.preventDefault(); setError(null); setFlow(flow === "signIn" ? "signUp" : "signIn"); }}>
          {flow === "signIn" ? "Create an account" : "Sign in"}
        </a>
      </p>
    </>
  );
}
