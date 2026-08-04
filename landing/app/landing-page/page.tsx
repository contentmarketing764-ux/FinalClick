import Link from "next/link";
import LeadForm from "@/components/LeadForm";
import { CONSENT_TEXT } from "@/lib/schema";

const COMPANY = process.env.NEXT_PUBLIC_COMPANY_NAME ?? "FinalClick";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-16 px-6 py-16 md:py-24">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          <span className="text-brand-accent">●</span> {COMPANY}
        </Link>
        <div className="text-sm text-slate-400">US &amp; Canada · TCPA-compliant</div>
      </header>

      <section className="grid gap-12 md:grid-cols-2 md:items-center">
        <div className="space-y-6">
          <p className="inline-block rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs font-medium text-slate-300">
            AI voice callback · under 60 seconds
          </p>
          <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            Get a personalized sales call in{" "}
            <span className="text-brand-accent">60 seconds</span>.
          </h1>
          <p className="max-w-lg text-lg text-slate-300">
            Enter your details and our AI agent will read your website, learn your business,
            and phone you back — briefed and ready to talk.
          </p>
          <ul className="space-y-2 text-slate-300">
            <li>· Local US/Canada number, verified caller ID</li>
            <li>· Zero wait — the phone rings within a minute</li>
            <li>· One-click opt-out anytime during the call</li>
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-2xl md:p-8">
          <h2 className="text-xl font-semibold">Request your callback</h2>
          <p className="mt-1 text-sm text-slate-400">Takes 20 seconds. Your phone rings next.</p>
          <div className="mt-6">
            <LeadForm consentText={CONSENT_TEXT} />
          </div>
        </div>
      </section>

      <footer className="mt-auto border-t border-slate-800 pt-6 text-xs text-slate-500">
        © {new Date().getFullYear()} {COMPANY} · <a className="hover:text-slate-300" href="/privacy">Privacy</a> · <a className="hover:text-slate-300" href="/terms">Terms</a>
      </footer>
    </main>
  );
}
