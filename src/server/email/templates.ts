/** Branded transactional email templates (inline-styled, client-safe HTML). */

function layout(title: string, body: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F8FAFC;font-family:Inter,Segoe UI,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:40px 20px">
    <div style="background:#ffffff;border:1px solid #E2E8F0;border-radius:12px;padding:32px">
      <div style="font-size:18px;font-weight:700;color:#0F172A;margin-bottom:4px">PayFlow</div>
      <h1 style="font-size:16px;font-weight:600;color:#0F172A;margin:18px 0 12px">${title}</h1>
      <div style="font-size:14px;line-height:1.6;color:#475569">${body}</div>
    </div>
    <p style="font-size:12px;color:#94A3B8;text-align:center;margin-top:20px">PayFlow · Payroll built for African businesses</p>
  </div>
</body></html>`;
}

function button(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;background:#4F46E5;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px;margin:14px 0">${label}</a>
  <p style="font-size:12px;color:#94A3B8;word-break:break-all">Or paste this link: ${url}</p>`;
}

export function verificationEmail(name: string, url: string) {
  const body = `<p>Hi ${name},</p>
    <p>Welcome to PayFlow. Confirm your email address to activate your workspace:</p>
    ${button(url, "Verify my email")}
    <p>This link expires in 24 hours.</p>`;
  return {
    subject: "Verify your PayFlow email",
    html: layout("Confirm your email address", body),
    text: `Hi ${name},\n\nConfirm your PayFlow email:\n${url}\n\nThis link expires in 24 hours.`,
  };
}

export function passwordResetEmail(name: string, url: string) {
  const body = `<p>Hi ${name},</p>
    <p>We received a request to reset your PayFlow password:</p>
    ${button(url, "Reset my password")}
    <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`;
  return {
    subject: "Reset your PayFlow password",
    html: layout("Reset your password", body),
    text: `Hi ${name},\n\nReset your PayFlow password:\n${url}\n\nThis link expires in 1 hour.`,
  };
}

export function invitationEmail(params: {
  inviterName: string;
  companyName: string;
  roleLabel: string;
  url: string;
}) {
  const body = `<p>Hi,</p>
    <p><strong>${params.inviterName}</strong> invited you to join <strong>${params.companyName}</strong> on PayFlow as <strong>${params.roleLabel}</strong>.</p>
    ${button(params.url, "Accept invitation")}
    <p>This invitation expires in 7 days.</p>`;
  return {
    subject: `You're invited to ${params.companyName} on PayFlow`,
    html: layout(`Join ${params.companyName}`, body),
    text: `${params.inviterName} invited you to join ${params.companyName} on PayFlow as ${params.roleLabel}.\n\nAccept: ${params.url}\n\nExpires in 7 days.`,
  };
}
