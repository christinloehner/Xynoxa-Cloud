/*
 * Copyright (C) 2025 Christin Löhner
 */

import "@/app/globals.css";
import type { Metadata } from "next";
import { ReactNode } from "react";
import Providers from "@/lib/providers";

export const metadata: Metadata = {
  title: "Xynoxa – Own your digital universe",
  description: "Private Personal Cloud for Files, Notes & Semantics. Your data, your flow, your world.",
  icons: {
    icon: "/images/favicon.png"
  }
};

import { Inter, Rajdhani, JetBrains_Mono } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const rajdhani = Rajdhani({ subsets: ["latin"], variable: "--font-display", weight: ["400", "500", "600", "700"] });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

// ... metadata ...

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning className={`${inter.variable} ${rajdhani.variable} ${jetbrains.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('xynoxa-theme') || localStorage.getItem('xynoxa-theme');
                  var theme = stored === 'light' || stored === 'dark'
                    ? stored
                    : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
                  document.documentElement.classList.add(theme);
                  document.body.classList.add('theme-' + theme);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen antialiased font-sans" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
