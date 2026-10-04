/**
 * kirimi.id WhatsApp gateway client. Endpoint/fields verified against
 * https://kirimi.id/docs; response shape confirmed by a real send 2026-07-12
 * (docs summary had guessed `data.message_id`, actual field is `data.messageId`).
 * Requires KIRIMI_USER_CODE / KIRIMI_SECRET / KIRIMI_DEVICE_ID in .env.local —
 * device_id is a separate value from the API Key page's user_code/secret;
 * find it under the device/WhatsApp-connection section of the kirimi.id dashboard.
 * Until all three are set, sendWhatsApp() returns a clear "not configured"
 * result instead of throwing, so callers (e.g. the late-incident form) can
 * save the underlying record either way and just skip the notification.
 */

type SendResult = { ok: true; messageId: string } | { ok: false; reason: string };

export async function sendWhatsApp(to: string, message: string): Promise<SendResult> {
  const userCode = process.env.KIRIMI_USER_CODE;
  const secret = process.env.KIRIMI_SECRET;
  const deviceId = process.env.KIRIMI_DEVICE_ID;

  if (!userCode || !secret || !deviceId) {
    return { ok: false, reason: "kirimi.id credentials not configured in .env.local" };
  }

  try {
    const res = await fetch("https://api.kirimi.id/v1/send-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_code: userCode,
        secret,
        device_id: deviceId,
        receiver: to,
        message,
      }),
    });

    const body = await res.json();
    if (!res.ok || body.success === false) {
      return { ok: false, reason: body.message ?? `kirimi.id returned HTTP ${res.status}` };
    }
    return { ok: true, messageId: body.data?.messageId ?? "unknown" };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "unknown fetch error" };
  }
}
