const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult = { success: boolean; reason?: string };

export async function verifyTurnstile(
  token: string,
  remoteip?: string,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Dev/local: allow through so the form is usable without Cloudflare setup.
    // Production deploy must set TURNSTILE_SECRET_KEY (gate in CI).
    if (process.env.NODE_ENV === "production") {
      return { success: false, reason: "turnstile-not-configured" };
    }
    console.warn("[turnstile] TURNSTILE_SECRET_KEY not set — allowing in non-production");
    return { success: true };
  }

  const body = new URLSearchParams({ secret, response: token });
  if (remoteip) body.append("remoteip", remoteip);

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { success: false, reason: `siteverify-${res.status}` };
    const json = (await res.json()) as { success: boolean; "error-codes"?: string[] };
    if (json.success) return { success: true };
    return { success: false, reason: (json["error-codes"] ?? []).join(",") || "unknown" };
  } catch (err) {
    return { success: false, reason: err instanceof Error ? err.message : "fetch-failed" };
  }
}
