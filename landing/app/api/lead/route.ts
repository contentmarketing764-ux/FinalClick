import { NextRequest, NextResponse } from "next/server";

import { CONSENT_TEXT, CONSENT_VERSION, LeadSchema } from "@/lib/schema";
import { verifyTurnstile } from "@/lib/turnstile";
import { checkWebsiteUrl } from "@/lib/ssrf";
import { scrapeWebsite } from "@/lib/scrape";
import { checkIpRate, claimPhoneDedupe } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Multi-page site crawl runs synchronously inside this handler
// (see lib/scrape.ts CRAWL_BUDGET_MS) so the Vercel timeout must exceed it.
export const maxDuration = 60;

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "0.0.0.0";
}

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "bad-json", "Request body must be JSON.");
  }

  const parsed = LeadSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return fail(400, "validation", first?.message ?? "Invalid submission.");
  }
  const data = parsed.data;

  const ip = clientIp(req);

  const rate = await checkIpRate(ip);
  if (!rate.allowed) {
    return fail(429, "rate-limited", "Too many submissions from your network. Try again in an hour.");
  }

  const turnstile = await verifyTurnstile(data.turnstile_token, ip);
  if (!turnstile.success) {
    return fail(400, "bot-check", "Bot check failed. Refresh the page and try again.");
  }

  const urlCheck = await checkWebsiteUrl(data.website_url);
  if (!urlCheck.ok) {
    return fail(400, "url-unreachable", "We could not reach that website. Double-check the URL.");
  }

  const claimed = await claimPhoneDedupe(data.phone);
  if (!claimed) {
    return fail(409, "duplicate", "We already have a callback scheduled for that number. Please wait 24h before resubmitting.");
  }

  // Scrape the site content so the orchestrator can personalise outreach.
  // Never block a valid lead on scrape failure — record the reason instead.
  const scrape = await scrapeWebsite(urlCheck.finalUrl);
  const site_content = scrape.ok ? scrape.site_content : null;
  const site_content_error = scrape.ok ? null : scrape.reason;

  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const webhookSecret = process.env.N8N_SECRET;
  if (!webhookUrl || !webhookSecret) {
    console.error("[api/lead] N8N_WEBHOOK_URL or N8N_SECRET not configured");
    return fail(503, "orchestrator-unconfigured", "Service is not fully configured yet. Please try again shortly.");
  }

  // §10.1: capture consent record immutably. Consent text + IP + timestamp + version
  // are populated server-side so a tampered client cannot forge them.
  // Field names mirror the form 1:1 so n8n can map by form field name.
  const payload = {
    full_name: data.full_name,
    business_name: data.business_name,
    phone: data.phone,
    website_url: urlCheck.finalUrl,
    email: data.email ?? null,
    consent: true,
    utm_source: data.utm_source ?? null,
    utm_campaign: data.utm_campaign ?? null,
    consent_text: CONSENT_TEXT,
    consent_version: CONSENT_VERSION,
    consent_ip: ip,
    consent_at: new Date().toISOString(),
    user_agent: req.headers.get("user-agent") ?? null,
    submitted_at: new Date().toISOString(),
    site_content,
    site_content_error,
  };

  // Fire-and-forget with a short timeout — user should not wait on n8n.
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": webhookSecret,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("[api/lead] n8n webhook non-2xx", res.status);
      return fail(502, "orchestrator-error", "We hit a snag scheduling your call. Please try again.");
    }
  } catch (err) {
    console.error("[api/lead] n8n webhook fetch failed", err);
    return fail(502, "orchestrator-error", "We hit a snag scheduling your call. Please try again.");
  }

  return NextResponse.json({
    ok: true,
    message: "You will receive a call within 60 seconds.",
  });
}

// Reject other verbs explicitly so bots probing don't get confused signals.
export async function GET() {
  return fail(405, "method-not-allowed", "Use POST.");
}
export const HEAD = GET;
