"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createJob, parseGEN, waitForTx, extractErrorMessage, CONTRACT_ADDRESS,
} from "@/lib/genlayer";
import { useWallet } from "@/lib/useWallet";
import {
  Button, Card, Input, Textarea, TxStatus, WalletConnectButton, SectionHeader,
} from "@/components/ui";

const CRITERIA_EXAMPLES = [
  "Deliver a responsive React dashboard with authentication, dark mode, and charts for sales data",
  "Write a Python REST API with JWT auth, PostgreSQL integration, and Swagger docs",
  "Design a mobile-first landing page with animations, contact form, and SEO meta tags",
];

const JOB_ID_PATTERN = /^[a-z0-9_-]+$/;

export default function NewJobPage() {
  const router = useRouter();
  const { address, isConnecting, connect, isCorrectNetwork, switchNetwork } = useWallet();

  const [jobId,         setJobId]         = useState("");
  const [criteria,      setCriteria]      = useState("");
  const [paymentGEN,    setPaymentGEN]    = useState("");
  const [deadlineDate,  setDeadlineDate]  = useState("");
  const [revisionLimit, setRevisionLimit] = useState("2");
  const [fieldError,    setFieldError]    = useState<string | null>(null);
  const [txHash,        setTxHash]        = useState<string | null>(null);
  const [txError,       setTxError]       = useState<string | null>(null);
  const [submitting,    setSubmitting]    = useState(false);

  const validate = (): string | null => {
    if (!jobId.trim()) return "Job ID is required.";
    if (!JOB_ID_PATTERN.test(jobId.trim())) return "Job ID: lowercase letters, numbers, hyphens, underscores only.";
    if (criteria.trim().length < 20) return "Acceptance criteria must be at least 20 characters.";
    if (!paymentGEN || isNaN(Number(paymentGEN)) || Number(paymentGEN) <= 0) return "Enter a valid payment amount greater than 0.";
    if (!deadlineDate) return "Pick a deadline date and time.";
    const ms = new Date(deadlineDate).getTime();
    if (isNaN(ms)) return "Invalid deadline date.";
    if (ms <= Date.now()) return "Deadline must be in the future.";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null); setTxError(null); setTxHash(null);

    const err = validate();
    if (err) { setFieldError(err); return; }
    if (!CONTRACT_ADDRESS) { setTxError("Contract not configured. Deploy first and set NEXT_PUBLIC_CONTRACT_ADDRESS."); return; }
    if (!address) { await connect(); return; }
    if (!isCorrectNetwork) { setTxError('MetaMask is on the wrong network. Click "Switch network" above.'); return; }

    setSubmitting(true);
    try {
      const paymentWei = parseGEN(paymentGEN);
      const deadlineTs = Math.floor(new Date(deadlineDate).getTime() / 1000);
      const hash = await createJob(address, {
        jobId: jobId.trim(), criteria: criteria.trim(),
        paymentWei, deadlineTs, revisionLimit: Number(revisionLimit),
      });
      setTxHash(hash);
      await waitForTx(hash as `0x${string}`);
      router.push(`/jobs/${jobId.trim()}`);
    } catch (e) {
      setTxError(extractErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 sm:space-y-6">
      <SectionHeader
        title="Post a Job"
        subtitle="Your payment is escrowed on-chain until the AI approves the work."
        action={
          <WalletConnectButton
            address={address} isConnecting={isConnecting} onConnect={connect}
            isCorrectNetwork={isCorrectNetwork} onSwitchNetwork={switchNetwork}
          />
        }
      />

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="Job ID"
            hint="A unique slug (e.g. logo-design-2024) — lowercase letters, numbers, hyphens."
            placeholder="react-dashboard-q3"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            required
          />

          <div className="space-y-2">
            <Textarea
              label="Acceptance Criteria"
              hint="Plain English. Be specific — the AI verifies work against exactly this."
              placeholder={CRITERIA_EXAMPLES[0]}
              value={criteria}
              onChange={(e) => setCriteria(e.target.value)}
              rows={5}
              required
              minLength={20}
            />
            <div className="flex gap-2 flex-wrap">
              {CRITERIA_EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCriteria(ex)}
                  className="text-xs text-zinc-500 hover:text-emerald-400 active:text-emerald-300 transition bg-zinc-800 px-2.5 py-1.5 rounded-full"
                >
                  Example {i + 1}
                </button>
              ))}
            </div>
          </div>

          <Input
            label="Payment (GEN)"
            hint="Amount to escrow. 2% platform fee deducted on completion."
            placeholder="10"
            type="number"
            step="0.01"
            min="0.01"
            value={paymentGEN}
            onChange={(e) => setPaymentGEN(e.target.value)}
            required
          />

          {/* Fee breakdown — compact, mobile-friendly */}
          {paymentGEN && Number(paymentGEN) > 0 && (
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 space-y-1">
              <div className="flex justify-between text-xs text-zinc-500">
                <span>Platform fee (2%)</span>
                <span>{(parseFloat(paymentGEN) * 0.02).toFixed(4)} GEN</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-emerald-400">
                <span>Freelancer receives</span>
                <span>{(parseFloat(paymentGEN) * 0.98).toFixed(4)} GEN</span>
              </div>
            </div>
          )}

          {/* Deadline */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Deadline</label>
            <p className="text-xs text-zinc-500">When work must be submitted by.</p>
            <input
              type="datetime-local"
              value={deadlineDate}
              onChange={(e) => setDeadlineDate(e.target.value)}
              min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
              required
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition min-h-[44px]"
            />
            {/* Quick-pick buttons — scrollable on very small screens */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {[
                { label: "3 days",  ms: 3  * 24 * 3600_000 },
                { label: "1 week",  ms: 7  * 24 * 3600_000 },
                { label: "2 weeks", ms: 14 * 24 * 3600_000 },
                { label: "1 month", ms: 30 * 24 * 3600_000 },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setDeadlineDate(new Date(Date.now() + opt.ms).toISOString().slice(0, 16))}
                  className="text-xs text-zinc-500 hover:text-emerald-400 active:text-emerald-300 transition bg-zinc-800 px-2.5 py-1.5 rounded-full whitespace-nowrap flex-shrink-0"
                >
                  +{opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Max Revisions */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Max Revisions</label>
            <p className="text-xs text-zinc-500">
              Times the freelancer can resubmit before the job becomes disputed.
            </p>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRevisionLimit(String(n))}
                  className={`py-2.5 rounded-xl border text-sm font-semibold transition min-h-[44px] ${
                    revisionLimit === String(n)
                      ? "bg-emerald-500 border-emerald-400 text-white"
                      : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {fieldError && (
            <div className="text-sm text-red-400 bg-red-950 border border-red-800 rounded-xl px-4 py-3 break-words">
              {fieldError}
            </div>
          )}

          <TxStatus hash={txHash} error={txError} label="Job creation submitted" />

          <Button
            type="submit"
            size="lg"
            loading={submitting}
            disabled={!!address && !isCorrectNetwork}
            className="w-full"
          >
            {!address
              ? "Connect Wallet to Post"
              : !isCorrectNetwork
              ? "Switch network to continue"
              : "Post Job & Escrow Payment"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
