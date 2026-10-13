// Sends a WhatsApp OTP via Meta's Cloud API, using an approved
// "Authentication" category template (Meta requires OTP messages to use
// this specific template category — a generic Utility/Marketing template
// will be rejected). Needs three env vars, none of which exist yet for
// this app: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
// WHATSAPP_OTP_TEMPLATE_NAME (the exact name of that approved template).
//
// The component shape below (body param + a URL button param, both
// carrying the OTP) matches Meta's standard one-tap-autofill Authentication
// template layout — if the real approved template's variable structure
// differs, this will need adjusting to match it exactly.
export async function sendWhatsAppOtp(phone, otp) {
  const token        = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName  = process.env.WHATSAPP_OTP_TEMPLATE_NAME;
  if (!token || !phoneNumberId || !templateName) {
    return { sent: false, reason: "not_configured" };
  }

  const digits = String(phone).replace(/\D/g, "");
  // Defaults to India's country code when a bare 10-digit number is given —
  // same assumption the rest of this app makes about phone formats.
  const toPhone = digits.length === 10 ? `91${digits}` : digits;

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toPhone,
        type: "template",
        template: {
          name: templateName,
          language: { code: "en" },
          components: [
            { type: "body", parameters: [{ type: "text", text: otp }] },
            { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: otp }] },
          ],
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("WhatsApp OTP send failed:", data);
      return { sent: false, reason: data?.error?.message || "send_failed" };
    }
    return { sent: true };
  } catch (err) {
    console.error("WhatsApp OTP send error:", err);
    return { sent: false, reason: "network_error" };
  }
}
