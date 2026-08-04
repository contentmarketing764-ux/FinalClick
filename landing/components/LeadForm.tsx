"use client";

import { useEffect, useRef, useState } from "react";
import { LeadSchema, type LeadInput } from "@/lib/schema";

type FieldName = keyof LeadInput;

const initial = {
  full_name: "",
  business_name: "",
  phone: "",
  website_url: "",
  email: "",
  consent: false,
};

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: string | HTMLElement,
        opts: { sitekey: string; callback: (t: string) => void; "error-callback"?: () => void; "expired-callback"?: () => void },
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function LeadForm({ consentText }: { consentText: string }) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const tokenRef = useRef<string>("");
  const widgetIdRef = useRef<string>("");
  const turnstileHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;
    const tryRender = () => {
      if (cancelled) return;
      if (!window.turnstile || !turnstileHostRef.current) {
        setTimeout(tryRender, 200);
        return;
      }
      widgetIdRef.current = window.turnstile.render(turnstileHostRef.current, {
        sitekey: SITE_KEY,
        callback: (t: string) => {
          tokenRef.current = t;
        },
        "expired-callback": () => {
          tokenRef.current = "";
        },
        "error-callback": () => {
          tokenRef.current = "";
        },
      });
    };
    tryRender();
    return () => {
      cancelled = true;
    };
  }, []);

  // Capture utm params on mount.
  const [utm, setUtm] = useState<{ utm_source?: string; utm_campaign?: string }>({});
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const src = q.get("utm_source") ?? undefined;
    const camp = q.get("utm_campaign") ?? undefined;
    if (src || camp) setUtm({ utm_source: src, utm_campaign: camp });
  }, []);

  const setField = <K extends keyof typeof initial>(k: K, v: (typeof initial)[K]) => {
    setValues((prev) => ({ ...prev, [k]: v }));
    if (errors[k as FieldName]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    const candidate = {
      ...values,
      email: values.email.trim() === "" ? undefined : values.email.trim(),
      utm_source: utm.utm_source,
      utm_campaign: utm.utm_campaign,
      turnstile_token: tokenRef.current || (SITE_KEY ? "" : "dev-bypass"),
    };

    const parsed = LeadSchema.safeParse(candidate);
    if (!parsed.success) {
      const errs: Partial<Record<FieldName, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as FieldName | undefined;
        if (key && !errs[key]) errs[key] = issue.message;
      }
      setErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await res.json()) as { ok: boolean; message: string };
      setResult(body);
      if (body.ok) setValues(initial);
      if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
      tokenRef.current = "";
    } catch {
      setResult({ ok: false, message: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.ok) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
        <div className="text-3xl">📞</div>
        <h3 className="mt-2 text-lg font-semibold text-emerald-300">Your phone will ring shortly</h3>
        <p className="mt-1 text-sm text-emerald-100/80">{result.message}</p>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <Field label="Your full name" name="full_name" error={errors.full_name}>
        <input
          type="text"
          required
          autoComplete="name"
          value={values.full_name}
          onChange={(e) => setField("full_name", e.target.value)}
          className={inputCls(errors.full_name)}
          placeholder="Jane Doe"
        />
      </Field>

      <Field label="Business name" name="business_name" error={errors.business_name}>
        <input
          type="text"
          required
          autoComplete="organization"
          value={values.business_name}
          onChange={(e) => setField("business_name", e.target.value)}
          className={inputCls(errors.business_name)}
          placeholder="Acme Roofing"
        />
      </Field>

      <Field
        label="Phone (US, Canada or UK)"
        name="phone"
        error={errors.phone}
        hint="E.164 format: +14155551234 (US/Canada) or +447700900123 (UK)"
      >
        <input
          type="tel"
          required
          autoComplete="tel"
          inputMode="tel"
          value={values.phone}
          onChange={(e) => setField("phone", e.target.value)}
          className={inputCls(errors.phone)}
          placeholder="+14155551234 or +447700900123"
        />
      </Field>

      <Field label="Your website" name="website_url" error={errors.website_url}>
        <input
          type="url"
          required
          autoComplete="url"
          value={values.website_url}
          onChange={(e) => setField("website_url", e.target.value)}
          className={inputCls(errors.website_url)}
          placeholder="https://acmeroofing.com"
        />
      </Field>

      <Field label="Email (optional)" name="email" error={errors.email} hint="Used only if the call fails.">
        <input
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(e) => setField("email", e.target.value)}
          className={inputCls(errors.email)}
          placeholder="jane@acmeroofing.com"
        />
      </Field>

      <label className="flex gap-3 rounded-lg border border-slate-700 bg-slate-950/40 p-3 text-sm text-slate-300">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-cyan-400"
          checked={values.consent}
          onChange={(e) => setField("consent", e.target.checked)}
          required
        />
        <span>{consentText}</span>
      </label>
      {errors.consent && <p className="text-xs text-rose-400">{errors.consent}</p>}

      {SITE_KEY && <div ref={turnstileHostRef} className="cf-turnstile" />}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-brand-accent px-4 py-3 font-semibold text-brand transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Scheduling your call…" : "Call me now"}
      </button>

      {result && !result.ok && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {result.message}
        </div>
      )}
    </form>
  );
}

function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-200">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
    </div>
  );
}

function inputCls(err?: string) {
  return [
    "w-full rounded-lg border bg-slate-950/40 px-3 py-2.5 text-slate-100 placeholder-slate-500 outline-none transition",
    err
      ? "border-rose-500/60 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/30"
      : "border-slate-700 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20",
  ].join(" ");
}
