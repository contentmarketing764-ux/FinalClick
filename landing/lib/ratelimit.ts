import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

let redis: Redis | null = null;
let ipLimiter: Ratelimit | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

function getIpLimiter(): Ratelimit | null {
  if (ipLimiter) return ipLimiter;
  const r = getRedis();
  if (!r) return null;
  // §4.4: max 3 submissions per IP per hour.
  ipLimiter = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(3, "1 h"),
    analytics: false,
    prefix: "rl:lead:ip",
  });
  return ipLimiter;
}

export async function checkIpRate(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  const rl = getIpLimiter();
  if (!rl) {
    if (process.env.NODE_ENV === "production") {
      // In prod, missing Redis is a fail-closed situation.
      return { allowed: false, remaining: 0 };
    }
    return { allowed: true, remaining: 3 };
  }
  const res = await rl.limit(ip);
  return { allowed: res.success, remaining: res.remaining };
}

// §4.4: reject if same phone submitted in last 24h.
export async function claimPhoneDedupe(phoneE164: string): Promise<boolean> {
  const r = getRedis();
  if (!r) {
    if (process.env.NODE_ENV === "production") return false;
    return true;
  }
  const key = `dedupe:phone:${phoneE164}`;
  // SET key value NX EX 86400 → returns "OK" only on first claim.
  const res = await r.set(key, Date.now(), { nx: true, ex: 60 * 60 * 24 });
  return res === "OK";
}
