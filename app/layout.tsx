import type {Metadata} from "next";
import {Bodoni_Moda, Hanken_Grotesk, JetBrains_Mono} from "next/font/google";
import "@/styles/globals.css";
import "@/styles/tokens.css";
import {siteUrl} from "@/lib/site";

/**
 * The three families, self-hosted by next/font so nothing shifts when they arrive. Each is
 * bound to a --font-face-* variable here and read only through tokens.css
 * (--font-display, --font-ui, --font-mono).
 *
 * Bodoni Moda is variable in weight and optical size: at 72px the hairlines thin out, at
 * 13px they hold up. Italic is loaded because the certificate's "This certifies that"
 * is set in it.
 */
const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-face-display",
});
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-face-ui",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-face-mono",
});

/** Every absolute URL the pages advertise (share cards above all) is built on this. */
const SITE_URL = siteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Warrant — give your team stock that vests",
  description:
    "Stock grants for teams paid in USDT. Bought on day one through OKX DEX and vesting every " +
    "second in an escrow nobody can spend, on X Layer.",
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${bodoni.variable} ${hanken.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
