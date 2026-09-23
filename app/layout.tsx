import type {Metadata} from "next";
import {Fraunces, IBM_Plex_Mono, Instrument_Sans} from "next/font/google";
import "@/styles/globals.css";
import "@/styles/tokens.css";
import {siteUrl} from "@/lib/site";

/**
 * Words: Instrument Sans. Figures: IBM Plex Mono, tabular, at every size. The wordmark and
 * a receipt's title line: Fraunces, and nowhere else. The families are bound to CSS
 * variables here and read only through tokens.css.
 */
const instrument = Instrument_Sans({subsets: ["latin"], variable: "--font-instrument"});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});
const fraunces = Fraunces({subsets: ["latin"], variable: "--font-fraunces"});

/** Every absolute URL the pages advertise (share cards above all) is built on this. */
const SITE_URL = siteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Warrant — pay your team, they choose the stock",
  description:
    "Payroll where each person chooses how much of their pay becomes stock. You pay in USDT " +
    "with one signature; each person gets their choice — like the S&P 500 — in their own " +
    "wallet, with a receipt for every payment. On X Layer.",
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html
      lang="en"
      className={`${instrument.variable} ${plexMono.variable} ${fraunces.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
