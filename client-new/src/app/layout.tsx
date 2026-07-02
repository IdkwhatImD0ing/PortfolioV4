import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#07060d",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://art3m1s.me"),
  manifest: "/manifest.json",
  title: "Bill Zhang | Voice-Driven Portfolio v2026",
  description:
    "Bill Zhang is an Applied AI Engineer at Scale AI building voice-first and multi-agent systems. Talk to this portfolio.",
  keywords: [
    "AI Engineer",
    "Bill Zhang",
    "Portfolio",
    "Voice AI",
    "Conversational AI",
    "Retell",
    "Hackathon",
  ],
  authors: [{ name: "Bill Zhang" }],
  creator: "Bill Zhang",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "https://art3m1s.me",
    siteName: "Bill Zhang — art3m1s.me",
    title: "Bill Zhang — Voice-driven AI portfolio",
    description:
      "Applied AI Engineer at Scale AI. Voice-first, agent-shaped systems. Talk to this portfolio.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bill Zhang — Voice-driven AI portfolio",
    description:
      "Applied AI Engineer at Scale AI. Voice-first, agent-shaped systems. Talk to this portfolio.",
  },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon.ico", rel: "icon" },
    ],
    shortcut: "/icon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning style={{ colorScheme: "dark" }}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Person",
              name: "Bill Zhang",
              jobTitle: "Applied AI Engineer",
              worksFor: {
                "@type": "Organization",
                name: "Scale AI",
              },
              alumniOf: [
                {
                  "@type": "EducationalOrganization",
                  name: "University of Southern California",
                },
                {
                  "@type": "EducationalOrganization",
                  name: "University of California, Santa Cruz",
                },
              ],
              url: "https://art3m1s.me",
              knowsAbout: [
                "Artificial Intelligence",
                "Machine Learning",
                "Conversational AI",
                "Voice Agents",
              ],
            }),
          }}
        />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
