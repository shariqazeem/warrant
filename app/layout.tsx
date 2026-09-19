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

export const metadata: Metadata = {
  title: "Warrant — a company pays its people in ownership",
  description:
    "Upload a file of names and amounts, sign once, and every person is paid in a " +
    "tokenized stock in their own wallet, each with a receipt carrying the reason.",
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
