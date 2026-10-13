// Sends a plain SMS OTP via MSG91's Flow API. Needs two env vars, neither
// of which exist yet for this app: MSG91_AUTH_KEY (from the MSG91
// dashboard) and MSG91_TEMPLATE_ID (a DLT-registered transactional
// template — mandatory in India for OTP/transactional SMS; MSG91's
// dashboard walks through DLT registration when you create the template).
// The template's registered variable name must be "OTP" for the payload
// below to fill in correctly — if it was registered under a different
// variable name, change the key inside `recipients[0]` to match.
export async function sendSmsOtp(phone, otp) {
  const authKey    = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;
  if (!authKey || !templateId) {
    return { sent: false, reason: "not_configured" };
  }

  const digits = String(phone).replace(/\D/g, "");
  const toPhone = digits.length === 10 ? `91${digits}` : digits;

  try {
    const res = await fetch("https://control.msg91.com/api/v5/flow", {
      method: "POST",
      headers: { authkey: authKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: templateId,
        short_url: "0",
        recipients: [{ mobiles: toPhone, OTP: otp }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.type === "error") {
      console.error("SMS OTP send failed:", data);
      return { sent: false, reason: data?.message || "send_failed" };
    }
    return { sent: true };
  } catch (err) {
    console.error("SMS OTP send error:", err);
    return { sent: false, reason: "network_error" };
  }
}
