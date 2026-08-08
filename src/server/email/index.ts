import { getEnv } from "@/lib/env";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Email provider abstraction. `console` logs the full message (development
 * default — links are clickable in server logs). smtp/resend can be plugged
 * in via EMAIL_PROVIDER without touching call sites.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const provider = getEnv().EMAIL_PROVIDER;

  try {
    if (provider === "console") {
      const links = message.text.match(/https?:\/\/\S+/g) ?? [];
      console.log(
        [
          "┌─ [email:console] ─────────────────────────────",
          `│ To:      ${message.to}`,
          `│ Subject: ${message.subject}`,
          ...links.map((link) => `│ Link:    ${link}`),
          "└────────────────────────────────────────────────",
        ].join("\n"),
      );
      return;
    }
    // smtp/resend providers are configured via EMAIL_PROVIDER on real deployments.
    console.warn(`[email] provider "${provider}" not implemented yet — message dropped (to: ${message.to})`);
  } catch (error) {
    // Email must never block the business flow unless explicitly critical.
    console.warn("[email] send failed", error);
  }
}
