import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/*
 * Emails the studio about a new inquiry or booking, through Cloudflare Email Service (the
 * `send_email` binding in wrangler.jsonc; no third party). Cloudflare only delivers to a
 * verified destination, and only from an address on a domain onboarded to Email Service:
 * docs/form-email-setup.md lists the one-time dashboard steps.
 */

/** Where submissions arrive (the binding is also locked to this address). */
export const STUDIO_INBOX = "drimindesign@gmail.com";
/** The sender: any address on the onboarded domain; it doesn't need a mailbox. */
const SENDER = { email: "forms@drimindesigns.co.in", name: "Drimindesign website" };

interface SendEmailBinding {
  send(message: {
    to: string;
    from: { email: string; name: string };
    replyTo?: { email: string; name?: string };
    subject: string;
    text: string;
  }): Promise<{ messageId: string }>;
}

declare global {
  interface CloudflareEnv {
    STUDIO_EMAIL?: SendEmailBinding;
  }
}

export interface StudioEmail {
  subject: string;
  /** Plain-text body: one "Label: value" line per field. */
  lines: readonly (readonly [string, string])[];
  /** The visitor, so "Reply" in the inbox answers them directly. */
  replyTo: { email: string; name: string };
}

/** Throws if the email couldn't be sent, so the form can tell the visitor to try again. */
export async function sendStudioEmail({ subject, lines, replyTo }: StudioEmail): Promise<void> {
  const text = `${lines.map(([label, value]) => `${label}: ${value || "-"}`).join("\n")}\n\nReply to this email to answer ${replyTo.name} directly.\n`;
  const { env } = await getCloudflareContext({ async: true });
  if (!env.STUDIO_EMAIL) {
    // `next dev` without the binding: show the email in the terminal instead of failing the form.
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[studio email, not sent in development]\nSubject: ${subject}\n${text}`);
      return;
    }
    throw new Error("STUDIO_EMAIL binding is missing");
  }
  await env.STUDIO_EMAIL.send({ to: STUDIO_INBOX, from: SENDER, replyTo, subject, text });
}
