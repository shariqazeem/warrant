import type {Metadata} from "next";
import {Fraunces, IBM_Plex_Mono, Instrument_Sans} from "next/font/google";
import "@/styles/globals.css";
import "@/styles/tokens.css";

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

/**
 * THE PUBLIC ADDRESS, FOR EVERY ABSOLUTE URL THE PAGES ADVERTISE.
 *
 * Without it Next.js falls back to http://localhost:3000, so every share card on the live
 * site pointed at localhost — a receipt posted anywhere unfurled into a broken image,
 * which quietly throws away the one piece of growth this product has built in. Set it to
 * whatever domain the site is served on; it is read at build time on the server.
 */
const SITE_URL = process.env.SITE_URL?.trim() || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Warrant — pay your team in stocks",
  description:
    "Payroll paid in tokenized stocks. Send USDT; each person receives stock like the " +
    "S&P 500 in their own wallet, with a receipt for every payment. On X Layer.",
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
