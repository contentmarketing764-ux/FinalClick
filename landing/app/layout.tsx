import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

const COMPANY = process.env.NEXT_PUBLIC_COMPANY_NAME ?? "FinalClick";

export const metadata: Metadata = {
  title: `${COMPANY} — AI phone callback in 60 seconds`,
  description:
    "Request a callback and our AI sales agent will call you within 60 seconds — already briefed on your business.",
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
          async
          defer
        />
      </body>
    </html>
  );
}
