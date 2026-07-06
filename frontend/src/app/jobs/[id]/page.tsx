"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  getJob, acceptJob, submitWork, cancelJob, reclaimExpiredJob,
  waitForTx, formatGEN, extractErrorMessage, getDisplayStatus, CONTRACT_ADDRESS,
  type Job,
} from "@/lib/genlayer";
import { useWallet } from "@/lib/useWallet";
import {
  Button, Card, Input, Textarea, StatusBadge, TxStatus,
  ScoreRing, WalletConnectButton, SectionHeader,
} from "@/components/ui";

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const { address, isConnecting, connect, isCorrectNetwork, switchNetwork } = useWallet();

  const [job, setJob]               = useState<Job | null>(null);
  const [loadError, setLoadError]   = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [workUrl, setWorkUrl]       = useState("");
  const [notes, setNotes]           = useState("");
  const [txHash, setTxHash]         = useState<string | null>(null);
  const [txError, setTxError]       = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastSubmitTxHash, setLastSubmitTxHash] = useState<string | null>(null);

  const loadJob = () => {
    if (!CONTRACT_ADDRESS) {
      setLoadError("Contract not configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local.");
      setLoading(false);
      return;
    }
    setLoading(true);
    getJob(id)
      .then(setJob)
      .catch((e) => setLoadError(extractErrorMessage(e) || "Job not found"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadJob();
    if (typeof window !== "undefined") {
      try {
        const saved = window.sessionStorage.getItem(`workproof:lastsubmit:${id}`);
        if (saved) setLastSubmitTxHash(saved);
      } catch { /* private browsing */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const guard = () => {
    if (!address) { connect(); return false; }
    if (!isCorrectNetwork) { setTxError("MetaMask is on the wrong network. Switch network first."); return false; }
    return true;
  };

  const handleAccept = async () => {
    if (!guard()) return;
    setTxError(null); setSubmitting(true);
    try {
      const hash = await acceptJob(address!, id);
      setTxHash(hash);
      await waitForTx(hash as `0x${string}`);
      loadJob();
    } catch (e) { setTxError(extractErrorMessage(e)); }
    finally     { setSubmitting(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = workUrl.trim();
    if (!trimmedUrl) { setTxError("Work URL is required."); return; }
    try {
      const p = new URL(trimmedUrl);
      if (!["http:", "https:"].includes(p.protocol)) { setTxError("Work URL must start with https://"); return; }
    } catch { setTxError("That doesn't look like a valid URL. Include https:// at the start."); return; }
    if (!notes.trim()) { setTxError("Submission notes are required."); return; }
    if (!guard()) return;

    setTxError(null); setTxHash(null); setSubmitting(true);
    try {
      const hash = await submitWork(address!, { jobId: id, workUrl: trimmedUrl, submissionNotes: notes.trim() });
      setTxHash(hash);
      setLastSubmitTxHash(hash);
      try { window.sessionStorage.setItem(`workproof:lastsubmit:${id}`, hash); } catch {}
      await waitForTx(hash as `0x${string}`);
      loadJob();
    } catch (e) { setTxError(extractErrorMessage(e)); }
    finally     { setSubmitting(false); }
  };

  const handleCancel = async () => {
    if (!guard()) return;
    if (!confirm("Refund escrow and cancel this job?")) return;
    setTxError(null); setSubmitting(true);
    try {
      const hash = await cancelJob(address!, id);
      setTxHash(hash);
      await waitForTx(hash as `0x${string}`);
      loadJob();
    } catch (e) { setTxError(extractErrorMessage(e)); }
    finally     { setSubmitting(false); }
  };

  const handleReclaim = async () => {
    if (!guard()) return;
    if (!confirm("Reclaim your escrow? Marks the job expired and refunds you.")) return;
    setTxError(null); setSubmitting(true);
    try {
      const hash = await reclaimExpiredJob(address!, id);
      setTxHash(hash);
      await waitForTx(hash as `0x${string}`);
      loadJob();
    } catch (e) { setTxError(extractErrorMessage(e)); }
    finally     { setSubmitting(false); }
  };

  if (loading) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto animate-pulse">
        <div className="h-8 bg-zinc-800 rounded-xl w-2/3" />
        <div className="h-36 bg-zinc-900 border border-zinc-800 rounded-2xl" />
        <div className="h-36 bg-zinc-900 border border-zinc-800 rounded-2xl" />
      </div>
    );
  }

  if (loadError || !job) {
    return (
      <div className="text-center py-20 space-y-3 px-4">
        <p className="text-4xl">🔍</p>
        <p className="text-zinc-400">{loadError || "Job not found"}</p>
      </div>
    );
  }

  const isClient     = !!address && address.toLowerCase() === job.client.toLowerCase();
  const isFreelancer = !!address && !!job.freelancer && address.toLowerCase() === job.freelancer.toLowerCase();
  const deadlineDate = new Date(job.deadline_ts * 1000);
  const isPastDeadline = Date.now() / 1000 > job.deadline_ts;
  const displayStatus = getDisplayStatus(job);

  return (
    <div className="max-w-2xl mx-auto space-y-5 sm:space-y-6">
      {/* Header */}
      <SectionHeader
        title={job.job_id}
        subtitle={`Client: ${job.client.slice(0, 10)}…${job.client.slice(-6)}`}
        action={
          <WalletConnectButton
            address={address} isConnecting={isConnecting} onConnect={connect}
            isCorrectNetwork={isCorrectNetwork} onSwitchNetwork={switchNetwork}
          />
        }
      />

      {/* Status badge row */}
      <div className="flex items-center gap-3 flex-wrap">
        <StatusBadge status={displayStatus} />
        {job.score >= 0 && (
          <span className="text-xs text-zinc-500">Score: {job.score}/100</span>
        )}
      </div>

      {/* Job info card */}
      <Card className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            Acceptance Criteria
          </p>
          <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap break-words">
            {job.criteria}
          </p>
        </div>

        {/* Key metadata — 2-col grid on mobile, 4-col on larger */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-zinc-800">
          <div>
            <p className="text-xs text-zinc-500 mb-0.5">Payment</p>
            <p className="text-sm font-semibold text-emerald-400 break-all">
              {formatGEN(BigInt(job.payment_wei))}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-0.5">Revisions left</p>
            <p className="text-sm font-semibold text-zinc-100">{job.revisions_left}</p>
          </div>
          <div className="col-span-2 sm:col-span-2">
            <p className="text-xs text-zinc-500 mb-0.5">Deadline</p>
            <p className={`text-sm font-semibold ${isPastDeadline ? "text-rose-400" : "text-zinc-100"}`}>
              {deadlineDate.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
              {" · "}
              {deadlineDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              {isPastDeadline && <span className="ml-1 text-rose-400">(Expired)</span>}
            </p>
          </div>
          {!!job.freelancer && (
            <div className="col-span-2">
              <p className="text-xs text-zinc-500 mb-0.5">Freelancer</p>
              <p className="text-xs font-mono text-zinc-300 break-all">
                {job.freelancer.slice(0, 14)}…
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* AI Evaluation Result */}
      {job.score >= 0 && (
        <Card className="space-y-4">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            AI Evaluation Result
          </p>
          <div className="flex items-start gap-4">
            <ScoreRing score={job.score} />
            <div className="space-y-1 flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-100">
                {job.last_review_pass ? "✅ Passed" : "❌ Did not pass"}
              </p>
              <p className="text-sm text-zinc-400 leading-relaxed break-words">
                {job.last_review_summary}
              </p>
            </div>
          </div>
          {job.met_criteria.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-emerald-500">Met criteria</p>
              <ul className="space-y-1.5">
                {job.met_criteria.map((c, i) => (
                  <li key={i} className="text-xs text-zinc-300 flex gap-2 leading-relaxed">
                    <span className="text-emerald-500 flex-shrink-0 mt-0.5">✓</span>
                    <span className="break-words">{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {job.unmet_criteria.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-amber-500">Unmet criteria</p>
              <ul className="space-y-1.5">
                {job.unmet_criteria.map((c, i) => (
                  <li key={i} className="text-xs text-zinc-300 flex gap-2 leading-relaxed">
                    <span className="text-amber-500 flex-shrink-0 mt-0.5">✗</span>
                    <span className="break-words">{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <TxStatus hash={txHash} error={txError} />

      {/* Client: cancel open job */}
      {isClient && job.status === "open" && (
        <Card>
          <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-zinc-100">Cancel & refund</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                No freelancer has accepted yet. You&apos;ll get your escrow back.
              </p>
            </div>
            <Button variant="danger" size="sm" onClick={handleCancel} loading={submitting} className="w-full sm:w-auto">
              Cancel Job
            </Button>
          </div>
        </Card>
      )}

      {/* Freelancer: accept open job */}
      {!isClient && job.status === "open" && (
        <Card className="space-y-3">
          <p className="font-semibold text-zinc-100">Accept this job</p>
          <p className="text-sm text-zinc-400">
            You&apos;ll be the assigned freelancer. Submit a URL for AI evaluation once done.
          </p>
          {isPastDeadline ? (
            <div className="text-sm text-rose-400 bg-rose-950 border border-rose-800 rounded-xl px-4 py-3">
              This job&apos;s deadline has passed and can no longer be accepted.
            </div>
          ) : (
            <Button onClick={handleAccept} loading={submitting} className="w-full sm:w-auto">
              {address ? "Accept Job" : "Connect Wallet to Accept"}
            </Button>
          )}
        </Card>
      )}

      {/* Freelancer: submit work */}
      {isFreelancer && job.status === "in_progress" && (
        <Card className="space-y-4">
          <p className="font-semibold text-zinc-100">Submit your work</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Work URL"
              hint="GitHub repo, deployed site, Notion doc, or any public URL the AI can read."
              placeholder="https://github.com/you/project"
              type="url"
              value={workUrl}
              onChange={(e) => setWorkUrl(e.target.value)}
              required
            />
            <Textarea
              label="Submission Notes"
              hint="Describe what you built and how it meets each criterion."
              placeholder="I built a responsive React dashboard with JWT auth, dark mode, and Recharts for sales data..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              required
            />
            <div className="bg-zinc-800/60 border border-zinc-700 rounded-xl px-4 py-3 text-xs text-zinc-400 leading-relaxed">
              ⚡ GenLayer validators will independently fetch your URL, run an LLM evaluation, and reach consensus. If ≥70 score and pass, payment releases automatically.
            </div>
            <Button type="submit" size="lg" loading={submitting} className="w-full">
              Submit for AI Review
            </Button>
          </form>
        </Card>
      )}

      {/* Client: reclaim if freelancer went silent */}
      {isClient && job.status === "in_progress" && (
        <Card className="space-y-2">
          <p className="text-sm font-semibold text-zinc-100">Freelancer not delivering?</p>
          <p className="text-xs text-zinc-500">
            {isPastDeadline
              ? "The deadline has passed — you can reclaim your escrow now."
              : `Reclaim available after ${deadlineDate.toLocaleDateString()}.`}
          </p>
          <Button
            variant="danger"
            size="sm"
            onClick={handleReclaim}
            loading={submitting}
            disabled={!isPastDeadline}
            className="w-full sm:w-auto"
          >
            Reclaim Escrow
          </Button>
        </Card>
      )}

      {/* Status cards */}
      {displayStatus === "expired" && (
        <Card className="border-rose-800 bg-rose-950/20 space-y-2">
          <p className="font-semibold text-rose-300">Job Expired</p>
          <p className="text-sm text-rose-400/80">
            {job.freelancer
              ? "Deadline passed while in progress. Escrow was reclaimed by the client."
              : "Deadline passed before any freelancer accepted."}
          </p>
        </Card>
      )}

      {job.status === "disputed" && (
        <Card className="border-amber-800 bg-amber-950/20 space-y-3">
          <p className="font-semibold text-amber-300">Job Disputed</p>
          <p className="text-sm text-amber-400/80">
            All revisions have been used. Either party can appeal through the GenLayer CLI.
          </p>
          {lastSubmitTxHash ? (
            <div className="space-y-1">
              <p className="text-xs text-amber-400/60">Submission tx (captured this session):</p>
              <code className="block bg-zinc-900 px-3 py-2 rounded-lg text-xs text-zinc-300 font-mono break-all leading-relaxed">
                genlayer transactions appeal --tx {lastSubmitTxHash}
              </code>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-amber-400/60">Find the tx hash in your wallet history, then run:</p>
              <code className="block bg-zinc-900 px-3 py-2 rounded-lg text-xs text-zinc-300 font-mono break-all">
                genlayer transactions appeal --tx &lt;your-tx-hash&gt;
              </code>
            </div>
          )}
        </Card>
      )}

      {job.status === "completed" && (
        <Card className="border-violet-800 bg-violet-950/20 space-y-2">
          <p className="font-semibold text-violet-300">✅ Job Completed</p>
          <p className="text-sm text-violet-400/80">
            Payment released to the freelancer. 2% platform fee sent to the WorkProof DAO treasury.
          </p>
        </Card>
      )}

      {job.status === "cancelled" && (
        <Card className="border-zinc-700 bg-zinc-900/40 space-y-2">
          <p className="font-semibold text-zinc-300">Job Cancelled</p>
          <p className="text-sm text-zinc-500">Cancelled before being accepted. Escrow refunded to the client.</p>
        </Card>
      )}
    </div>
  );
}
