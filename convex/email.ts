import { v } from "convex/values";
import { internalAction } from "./_generated/server";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Subject, plain text and HTML for a notification email. Pure, so it is easy to test. */
export function renderEmail(n: { title: string; body: string; href: string }, siteUrl: string) {
  const link = new URL(n.href, siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`).toString();
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#202320">
<p style="font-family:Georgia,serif;font-size:26px;margin:0 0 24px">Localo</p>
<h1 style="font-size:20px;margin:0 0 8px">${esc(n.title)}</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 24px;color:#40495E">${esc(n.body)}</p>
<a href="${esc(link)}" style="display:inline-block;background:#315C48;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Open in Localo</a>
<p style="font-size:12px;color:#5A6479;margin:32px 0 0">Localo does not collect, hold or guarantee payment. Pay your provider directly.</p>
</div>`;
  return { subject: n.title, text: `${n.title}\n\n${n.body}\n\n${link}`, html };
}

/**
 * Sends one email through Resend. Never throws: a failed email must not undo or retry the booking event that
 * caused it. Without RESEND_API_KEY it logs and skips, so local development works without an account.
 */
export const send = internalAction({
  args: { to: v.string(), title: v.string(), body: v.string(), href: v.string() },
  handler: async (_ctx, { to, ...n }) => {
    const key = process.env.RESEND_API_KEY;
    if (!key) { console.log(`[email skipped: RESEND_API_KEY not set] ${n.title} -> ${to}`); return { sent: false as const, reason: "no key" }; }
    const mail = renderEmail(n, process.env.SITE_URL ?? "http://localhost:3000");
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        // Resend's shared sender only delivers to the account owner; set EMAIL_FROM once a domain is verified.
        body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Localo <onboarding@resend.dev>", to: [to], ...mail }),
      });
      if (!res.ok) { console.error(`[email failed ${res.status}] ${await res.text().catch(() => "")}`); return { sent: false as const, reason: `status ${res.status}` }; }
      return { sent: true as const };
    } catch (e) {
      console.error("[email error]", e);
      return { sent: false as const, reason: "network" };
    }
  },
});
