import { promises as dns, type LookupAddress } from "node:dns";
import net from "node:net";

export type UrlCheckResult =
  | { ok: true; finalUrl: string }
  | { ok: false; reason: string };

const HEAD_TIMEOUT_MS = 5000;

export async function checkWebsiteUrl(rawUrl: string): Promise<UrlCheckResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid-url" };
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: "non-https" };
  if (parsed.username || parsed.password) return { ok: false, reason: "url-contains-credentials" };

  const hostname = parsed.hostname;

  // Reject IP literals outright — legit business sites use hostnames.
  if (net.isIP(hostname)) return { ok: false, reason: "ip-literal-not-allowed" };

  // Resolve all A/AAAA records and reject if any lands in a private range.
  let addrs: LookupAddress[];
  try {
    addrs = await dns.lookup(hostname, { all: true });
  } catch {
    return { ok: false, reason: "dns-lookup-failed" };
  }
  if (addrs.length === 0) return { ok: false, reason: "no-dns-records" };
  for (const a of addrs) {
    if (isPrivateAddress(a.address)) {
      return { ok: false, reason: `private-address:${a.address}` };
    }
  }

  // HEAD request with strict timeout. Some sites reject HEAD — accept a 200-399
  // range or a 405 (method-not-allowed) as evidence the host exists.
  try {
    const res = await fetch(parsed.toString(), {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
    });
    if (res.status === 405 || (res.status >= 200 && res.status < 400)) {
      return { ok: true, finalUrl: parsed.toString() };
    }
    return { ok: false, reason: `head-status-${res.status}` };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "head-failed" };
  }
}

export function isPrivateAddress(addr: string): boolean {
  const v = net.isIP(addr);
  if (v === 4) return isPrivateV4(addr);
  if (v === 6) return isPrivateV6(addr);
  return true; // unknown → treat as unsafe
}

function isPrivateV4(addr: string): boolean {
  const [a, b] = addr.split(".").map((n) => Number.parseInt(n, 10));
  if ([a, b].some((n) => Number.isNaN(n))) return true;
  if (a === 10) return true;                          // 10.0.0.0/8
  if (a === 127) return true;                         // loopback
  if (a === 0) return true;                           // 0.0.0.0/8
  if (a === 169 && b === 254) return true;            // link-local (AWS/GCP metadata)
  if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
  if (a === 192 && b === 168) return true;            // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT 100.64.0.0/10
  if (a >= 224) return true;                          // multicast + reserved
  return false;
}

function isPrivateV6(addr: string): boolean {
  const lower = addr.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  // IPv4-mapped: ::ffff:a.b.c.d — extract and re-check as v4.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]);
  if (lower.startsWith("fe80:")) return true;         // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA fc00::/7
  if (lower.startsWith("ff")) return true;            // multicast
  return false;
}
