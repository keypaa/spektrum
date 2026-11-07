import type { Metadata } from "next";
import "./globals.css";
import { themeInitScript } from "@/components/theme-script";

export const metadata: Metadata = {
  title: "Spektrum",
  description: "An AI-powered LaTeX editor.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/CrixetSans/CrixetSans-Regular.woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/CrixetSans/CrixetSans-Medium.woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/CrixetSans/CrixetSans-Semibold.woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href="/fonts/CrixetSans/CrixetSans-Bold.woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}