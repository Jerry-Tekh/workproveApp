"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listJobs, formatGEN, extractErrorMessage, CONTRACT_ADDRESS, type JobSummary,
} from "@/lib/genlayer";
import { useWallet } from "@/lib/useWallet";
import {
  Card, StatusBadge, WalletConnectButton, EmptyState, Button, SectionHeader,
} from "@/components/ui";

export default function DashboardPage() {
  const { address, isConnecting, connect, isCorrectNetwork, switchNetwork } = useWallet();
  const [allJobs, setAllJobs]   = useState<JobSummary[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    if (!CONTRACT_ADDRESS) {
      setError("Contract not configured.");
      setLoading(false);
      return;
    }
    const PAGE_SIZE = 50;
    const HARD_CAP  = 1000;
    let cancelled   = false;

    async function loadAll() {
      const collected: JobSummary[] = [];
      let offset = 0;
      for (;;) {
        const page = await listJobs(offset, PAGE_SIZE);
        if (cancelled) return;
        collected.push(...page);
        if (page.length < PAGE_SIZE || collected.length >= HARD_CAP) break;
        offset += PAGE_SIZE;
      }
      if (cancelled) return;
      setAllJobs(collected);
      setTruncated(collected.length >= HARD_CAP);
    }

    loadAll()
      .catch((e) => !cancelled && setError(extractErrorMessage(e)))
      .finally(() => !cancelled && setLoading(false));

    return () => { cancelled = true; };
  }, []);

  if (!address) {
    return (
      <div className="max-w-sm mx-auto text-center py-16 sm:py-24 space-y-5 px-4">
        <p className="text-5xl">🔐</p>
        <h1 className="text-xl sm:text-2xl font-bold">Connect your wallet</h1>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Connect MetaMask to see jobs you&apos;ve posted or accepted.
        </p>
        <Button onClick={connect} loading={isConnecting} size="lg" className="w-full sm:w-auto">
          Connect Wallet
        </Button>
      </div>
    );
  }

  const myAddr       = address.toLowerCase();
  const asClient     = allJobs.filter((j) => j.client.toLowerCase() === myAddr);
  const asFreelancer = allJobs.filter((j) => (j.freelancer || "").toLowerCase() === myAddr);

  return (
    <div className="space-y-8 sm:space-y-10">
      <SectionHeader
        title="My Dashboard"
        subtitle="Jobs you've posted as a client, and jobs you're working on as a freelancer."
        action={
          <WalletConnectButton
            address={address} isConnecting={isConnecting} onConnect={connect}
            isCorrectNetwork={isCorrectNetwork} onSwitchNetwork={switchNetwork}
          />
        }
      />

      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 bg-zinc-900 border border-zinc-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-950 border border-red-800 text-red-300 rounded-xl px-4 py-3 text-sm break-words">
          {error}
        </div>
      )}

      {!loading && truncated && (
        <div className="bg-amber-950 border border-amber-800 text-amber-300 rounded-xl px-4 py-3 text-xs leading-relaxed">
          Platform has 1000+ jobs. Some of your jobs may not appear — a subgraph
          index is needed at this scale.
        </div>
      )}

      {!loading && !error && (
        <>
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-bold text-zinc-200">
                Posted by you
              </h2>
              <span className="text-xs text-zinc-500 bg-zinc-800 px-2.5 py-1 rounded-full">
                {asClient.length}
              </span>
            </div>
            {asClient.length === 0 ? (
              <EmptyState
                icon="📭"
                title="You haven't posted any jobs yet."
                action={
                  <Link href="/jobs/new" className="inline-block mt-2 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm">
                    Post your first job
                  </Link>
                }
              />
            ) : (
              <div className="space-y-3">
                {asClient.map((job) => <JobRow key={job.job_id} job={job} />)}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-bold text-zinc-200">
                Accepted by you
              </h2>
              <span className="text-xs text-zinc-500 bg-zinc-800 px-2.5 py-1 rounded-full">
                {asFreelancer.length}
              </span>
            </div>
            {asFreelancer.length === 0 ? (
              <EmptyState
                icon="🛠️"
                title="You haven't accepted any jobs yet."
                action={
                  <Link href="/jobs" className="inline-block mt-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 font-semibold px-5 py-2.5 rounded-xl transition text-sm">
                    Browse open jobs
                  </Link>
                }
              />
            ) : (
              <div className="space-y-3">
                {asFreelancer.map((job) => <JobRow key={job.job_id} job={job} />)}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function JobRow({ job }: { job: JobSummary }) {
  return (
    <Link href={`/jobs/${job.job_id}`}>
      <Card className="hover:border-zinc-600 active:border-zinc-500 transition-colors cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-1.5">
            <p className="font-semibold text-zinc-100 truncate text-sm sm:text-base">
              {job.job_id}
            </p>
            <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
              <span className="bg-zinc-800 px-2.5 py-1 rounded-full font-mono">
                {formatGEN(BigInt(job.payment_wei))}
              </span>
              <span className="bg-zinc-800 px-2.5 py-1 rounded-full">
                {job.revisions_left} revision{job.revisions_left !== 1 ? "s" : ""} left
              </span>
            </div>
          </div>
          <StatusBadge status={job.status} />
        </div>
      </Card>
    </Link>
  );
}
