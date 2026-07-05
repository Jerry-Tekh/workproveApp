"use client";

import { clsx } from "clsx";
import type { ReactNode } from "react";

// ─── Button ───────────────────────────────────────────────

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        // Base — touch-friendly min height on mobile
        "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-150",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
        "active:scale-[0.97] select-none",
        // Sizes — larger tap targets on mobile
        size === "sm" && "px-3 py-2 text-sm min-h-[36px]",
        size === "md" && "px-5 py-2.5 text-sm min-h-[40px]",
        size === "lg" && "px-6 py-3 text-base min-h-[48px]",
        // Variants
        variant === "primary" &&
          "bg-emerald-500 text-white hover:bg-emerald-400 focus-visible:ring-emerald-500 disabled:bg-emerald-800 disabled:text-emerald-400",
        variant === "secondary" &&
          "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 focus-visible:ring-zinc-500 border border-zinc-700 disabled:opacity-40",
        variant === "danger" &&
          "bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-500 disabled:opacity-40",
        variant === "ghost" &&
          "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 focus-visible:ring-zinc-500 disabled:opacity-40",
        (disabled || loading) && "cursor-not-allowed active:scale-100",
        className
      )}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}

// ─── Card ─────────────────────────────────────────────────

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-6",
        className
      )}
    >
      {children}
    </div>
  );
}

// ─── StatusBadge ──────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  open:        "bg-emerald-900/60 text-emerald-300 border-emerald-700",
  in_progress: "bg-blue-900/60 text-blue-300 border-blue-700",
  completed:   "bg-violet-900/60 text-violet-300 border-violet-700",
  disputed:    "bg-amber-900/60 text-amber-300 border-amber-700",
  cancelled:   "bg-zinc-800 text-zinc-500 border-zinc-700",
  expired:     "bg-rose-950 text-rose-400 border-rose-800",
};

const STATUS_LABELS: Record<string, string> = {
  open:        "Open",
  in_progress: "In Progress",
  completed:   "Completed",
  disputed:    "Disputed",
  cancelled:   "Cancelled",
  expired:     "Expired",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap flex-shrink-0",
        STATUS_STYLES[status] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ─── TxStatus ─────────────────────────────────────────────

export function TxStatus({
  hash,
  label,
  error,
}: {
  hash?: string | null;
  label?: string;
  error?: string | null;
}) {
  if (error) {
    return (
      <div className="bg-red-950 border border-red-800 text-red-300 rounded-xl px-4 py-3 text-sm break-words">
        <span className="font-semibold">Error: </span>
        {error}
      </div>
    );
  }
  if (!hash) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm">
      <p className="text-zinc-400 text-xs mb-1">
        {label ?? "Transaction submitted"}
      </p>
      <code className="text-emerald-400 break-all text-xs leading-relaxed block">
        {hash}
      </code>
      <p className="text-zinc-500 text-xs mt-1">
        Waiting for GenLayer validator consensus…
      </p>
    </div>
  );
}

// ─── ScoreRing ────────────────────────────────────────────

export function ScoreRing({ score }: { score: number }) {
  const radius = 28;
  const circ = 2 * Math.PI * radius;
  const pct = Math.min(Math.max(score, 0), 100) / 100;
  const color = score >= 70 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative w-16 h-16 flex-shrink-0">
      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#27272a" strokeWidth="6" />
        <circle
          cx="32" cy="32" r={radius}
          fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          strokeLinecap="round"
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-sm font-bold"
        style={{ color }}
      >
        {score}
      </span>
    </div>
  );
}

// ─── Input ────────────────────────────────────────────────

export function Input({
  label,
  hint,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-zinc-300">{label}</label>
      {hint && <p className="text-xs text-zinc-500 leading-relaxed">{hint}</p>}
      <input
        className={clsx(
          "w-full bg-zinc-800 border rounded-xl px-4 py-3 text-sm text-zinc-100",
          "placeholder-zinc-600 focus:outline-none focus:ring-2 transition",
          // min-h for comfortable mobile tap
          "min-h-[44px]",
          error
            ? "border-red-600 focus:ring-red-600"
            : "border-zinc-700 focus:ring-emerald-500"
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ─── Textarea ─────────────────────────────────────────────

export function Textarea({
  label,
  hint,
  error,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-zinc-300">{label}</label>
      {hint && <p className="text-xs text-zinc-500 leading-relaxed">{hint}</p>}
      <textarea
        className={clsx(
          "w-full bg-zinc-800 border rounded-xl px-4 py-3 text-sm text-zinc-100",
          "placeholder-zinc-600 focus:outline-none focus:ring-2 transition resize-none",
          error
            ? "border-red-600 focus:ring-red-600"
            : "border-zinc-700 focus:ring-emerald-500"
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ─── WalletConnectButton ──────────────────────────────────

export function WalletConnectButton({
  address,
  isConnecting,
  onConnect,
  isCorrectNetwork = true,
  onSwitchNetwork,
}: {
  address: string | null;
  isConnecting: boolean;
  onConnect: () => void;
  isCorrectNetwork?: boolean;
  onSwitchNetwork?: () => void;
}) {
  if (address && !isCorrectNetwork && onSwitchNetwork) {
    return (
      <button
        onClick={onSwitchNetwork}
        className="flex items-center gap-1.5 bg-amber-950 border border-amber-800 text-amber-300 rounded-xl px-3 py-2 text-xs font-semibold hover:bg-amber-900 active:bg-amber-950 transition min-h-[36px]"
      >
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
        <span className="hidden sm:inline">Wrong network — switch</span>
        <span className="sm:hidden">Switch network</span>
      </button>
    );
  }
  if (address) {
    return (
      <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 min-h-[36px]">
        <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
        <span className="text-xs font-mono text-zinc-300">
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
      </div>
    );
  }
  return (
    <Button size="sm" onClick={onConnect} loading={isConnecting}>
      Connect Wallet
    </Button>
  );
}

// ─── EmptyState ───────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  action,
}: {
  icon: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <Card className="text-center py-12 sm:py-16 space-y-3">
      <p className="text-4xl">{icon}</p>
      <p className="text-zinc-400 text-sm sm:text-base px-4">{title}</p>
      {action}
    </Card>
  );
}

// ─── SectionHeader ────────────────────────────────────────

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-black truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="text-zinc-400 text-sm mt-1 leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
