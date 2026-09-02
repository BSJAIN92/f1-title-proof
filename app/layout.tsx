import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import "@fontsource/barlow-semi-condensed/500.css";
import "@fontsource/barlow-semi-condensed/600.css";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Title Proof — F1 Championship Scenarios",
  description: "Exact Formula 1 championship-winning conditions.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="carbon-root">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
