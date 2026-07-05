"use client";

import Link from "next/link";
import { useState } from "react";

const LINKS = [
  { href: "/jobs",     label: "Browse Jobs" },
  { href: "/jobs/new", label: "Post Job"    },
  { href: "/dashboard",label: "Dashboard"   },
];

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur border-b border-zinc-800">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 flex-shrink-0">
          <span className="text-emerald-400 text-lg sm:text-xl font-bold tracking-tight">
            Work<span className="text-white">Proof</span>
          </span>
          <span className="hidden sm:block text-xs bg-emerald-900/60 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded-full font-medium">
            GenLayer
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6 text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-zinc-400 hover:text-zinc-100 transition font-medium"
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Mobile hamburger button */}
        <button
          onClick={() => setOpen((prev) => !prev)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="md:hidden flex flex-col justify-center items-center w-10 h-10 gap-1.5 rounded-lg hover:bg-zinc-800 active:bg-zinc-700 transition"
        >
          <span
            className={`block w-5 h-0.5 bg-zinc-400 transition-all duration-200 origin-center ${
              open ? "rotate-45 translate-y-2" : ""
            }`}
          />
          <span
            className={`block w-5 h-0.5 bg-zinc-400 transition-all duration-200 ${
              open ? "opacity-0 scale-x-0" : ""
            }`}
          />
          <span
            className={`block w-5 h-0.5 bg-zinc-400 transition-all duration-200 origin-center ${
              open ? "-rotate-45 -translate-y-2" : ""
            }`}
          />
        </button>
      </div>

      {/* Mobile dropdown */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-200 ${
          open ? "max-h-48 border-t border-zinc-800" : "max-h-0"
        } bg-zinc-950/98 backdrop-blur`}
      >
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={() => setOpen(false)}
            className="flex items-center px-6 h-12 text-sm font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900 active:bg-zinc-800 transition border-b border-zinc-800/50 last:border-0"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
