// Mail goes out through Resend's HTTP API when RESEND_API_KEY and MAIL_FROM
// are set, and FLYPRINT_ORIGIN pins the address links in it point to (never
// a Host header someone else sent). Without them the site sends nothing, and
// what needs mail (a forgotten password) does not offer itself.
export const mailConfigured = () => !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM && !!process.env.FLYPRINT_ORIGIN;

export async function sendMail(message: { to: string; subject: string; text: string }) {
  if (!mailConfigured()) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [message.to], subject: message.subject, text: message.text }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!response?.ok) console.error("mail failed", response?.status ?? "network");
  return !!response?.ok;
}
