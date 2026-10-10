import { Email } from "@convex-dev/auth/providers/Email";

/** Codes are valid for 20 minutes. Convex Auth also rate-limits failed attempts per account. */
const MAX_AGE_SECONDS = 20 * 60;

/** Eight random digits, drawn without modulo bias. */
export function generateCode(): string {
  let out = "";
  while (out.length < 8) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < 250 && out.length < 8) out += String(byte % 10);
    }
  }
  return out;
}

/** Can this deployment deliver (or, in development, log) one-time codes? */
export const authEmailAvailable = () => !!process.env.RESEND_API_KEY || process.env.AUTH_LOG_CODES === "true";
export const verificationRequired = () => authEmailAvailable() && process.env.REQUIRE_EMAIL_VERIFICATION === "true";

export async function sendCode(to: string, subject: string, intro: string, code: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // Development only: set AUTH_LOG_CODES=true to read codes in the Convex logs. Never set it in production.
    if (process.env.AUTH_LOG_CODES === "true") { console.log(`[auth code] ${to} ${code}`); return; }
    throw new Error("Email sending is not configured");
  }
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#202320">
<p style="font-family:Georgia,serif;font-size:26px;margin:0 0 24px">Localo</p>
<p style="font-size:15px;line-height:1.5;margin:0 0 16px;color:#40495E">${intro}</p>
<p style="font-size:32px;letter-spacing:6px;font-weight:700;margin:0 0 16px">${code}</p>
<p style="font-size:13px;color:#5A6479;margin:0">This code expires in 20 minutes. If you didn't ask for it, you can ignore this email.</p>
</div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Localo <onboarding@resend.dev>", to: [to], subject, html, text: `${intro}\n\n${code}\n\nThis code expires in 20 minutes.` }),
  });
  if (!res.ok) throw new Error(`Could not send the email (${res.status})`);
}

/** A one-time-code email provider for Convex Auth. */
export const codeProvider = (id: string, subject: string, intro: string) =>
  Email({
    id,
    maxAge: MAX_AGE_SECONDS,
    generateVerificationToken: async () => generateCode(),
    sendVerificationRequest: async ({ identifier, token }) => sendCode(identifier, subject, intro, token),
  });
