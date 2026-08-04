import { z } from "zod";

export const COMPANY_NAME = process.env.NEXT_PUBLIC_COMPANY_NAME ?? "FinalClick";

// Verbatim consent text stored per-lead per TCPA §10.1. Server-side canonical
// copy — never trust a client-supplied version. Bump CONSENT_VERSION whenever
// this string changes so audit trails distinguish revisions.
export const CONSENT_VERSION = "2026-07-29.v1";
export const CONSENT_TEXT =
  `By checking this box and submitting, I expressly consent to receive an automated ` +
  `or artificial-voice phone call from ${COMPANY_NAME} at the number provided, even if it is ` +
  `on any Do-Not-Call list. Consent is not a condition of purchase. Message and data rates ` +
  `may apply. See our Privacy Policy and Terms.`;

// US/Canada: +1 followed by 10 digits.
// UK:        +44 followed by 9 or 10 digits (mobiles and landlines, national
//            leading 0 dropped per E.164).
const E164_ALLOWED = /^(?:\+1[0-9]{10}|\+44[0-9]{9,10})$/;

export const LeadSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name").max(80),
  business_name: z.string().trim().min(2, "Enter your business name").max(120),
  phone: z
    .string()
    .trim()
    .regex(
      E164_ALLOWED,
      "Enter a US/Canada (+1…) or UK (+44…) phone in E.164 format, e.g. +14155551234 or +447700900123",
    ),
  website_url: z
    .string()
    .trim()
    .max(2048)
    .url("Enter a valid URL")
    .refine((u) => u.startsWith("https://"), "URL must start with https://"),
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .max(254)
    .optional(),
  consent: z.literal(true, {
    errorMap: () => ({ message: "You must consent to receive an AI phone call" }),
  }),
  utm_source: z.string().trim().max(100).optional(),
  utm_campaign: z.string().trim().max(100).optional(),
  turnstile_token: z.string().min(1, "Bot check failed. Refresh and try again."),
});

export type LeadInput = z.infer<typeof LeadSchema>;
