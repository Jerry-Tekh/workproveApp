/**
 * layout.tsx — SERVER COMPONENT (no "use client")
 *
 * Next.js 15 rule: layouts that export `metadata` must be Server Components.
 * The Nav requires useState (client-side), so it lives in a separate
 * client component imported here.
 */
import type { Metadata, Viewport } from "next";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "WorkProof — AI-Verified Freelance Escrow",
  description:
    "Trustless freelance payments powered by GenLayer. AI verifies your work, not a middleman.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen antialiased overflow-x-hidden">
        <Nav />
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
          {children}
        </main>
        <footer className="border-t border-zinc-800 mt-16 py-6 text-center text-xs text-zinc-600 px-4">
          WorkProof — 2% fee · No middlemen · Powered by GenLayer Intelligent
          Contracts
        </footer>
      </body>
    </html>
  );
}
