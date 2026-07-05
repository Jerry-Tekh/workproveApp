"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listJobs,
  listJobsByStatus,
  formatGEN,
  extractErrorMessage,
  CONTRACT_ADDRESS,
  type JobSummary,
  type JobStatus,
} from "@/lib/genlayer";
import { Card, StatusBadge, EmptyState, SectionHeader } from "@/components/ui";

const FILTERS: { label: string; value: JobStatus | "all" }[] = [
  { label: "Open",        value: "open" },
  { label: "In Progress", value: "in_progress" },
  { label: "Completed",   value: "completed" },
  { label: "All",         value: "all" },
];

export default function JobsPage() {
  const [jobs, setJobs]     = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [filter, setFilter] = useState<JobStatus | "all">("open");

  useEffect(() => {
    if (!CONTRACT_ADDRESS) {
      setError("Contract not configured. Deploy the contract and set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const req = filter === "all" ? listJobs(0, 50) : listJobsByStatus(filter, 0, 50);
    req.then(setJobs)
       .catch((e) => setError(extractErrorMessage(e)))
       .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="space-y-6 sm:space-y-8">
      <SectionHeader
        title="Job Board"
        subtitle="Accept a job, submit work, get paid — no middlemen."
        action={
          <Link
            href="/jobs/new"
            className="hidden sm:inline-flex bg-emerald-500 hover:bg-emerald-400 text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm"
          >
            Post Job
          </Link>
        }
      />

      {/* Filter tabs — horizontally scrollable on small screens */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap scrollbar-none">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 rounded-full text-xs font-semibold border transition whitespace-nowrap flex-shrink-0 min-h-[36px] ${
              filter === f.value
                ? "bg-emerald-500 border-emerald-400 text-white"
                : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-zinc-900 border border-zinc-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-950 border border-red-800 text-red-300 rounded-xl px-4 py-3 text-sm break-words">
          {error}
        </div>
      )}

      {!loading && !error && jobs.length === 0 && (
        <EmptyState
          icon="📋"
          title={
            filter === "open"
              ? "No open jobs right now. Be the first to post one."
              : `No ${FILTERS.find((f) => f.value === filter)?.label.toLowerCase()} jobs.`
          }
          action={
            <Link href="/jobs/new" className="inline-block bg-emerald-500 hover:bg-emerald-400 text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm mt-2">
              Post a Job
            </Link>
          }
        />
      )}

      <div className="space-y-3">
        {jobs.map((job) => (
          <Link key={job.job_id} href={`/jobs/${job.job_id}`}>
            <Card className="hover:border-zinc-600 active:border-zinc-500 transition-colors cursor-pointer space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-zinc-100 truncate text-sm sm:text-base">
                    {job.job_id}
                  </p>
                  <p className="text-sm text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                    {job.criteria}
                  </p>
                </div>
                <StatusBadge status={job.status} />
              </div>
              <div className="flex flex-wrap gap-2 sm:gap-3 text-xs text-zinc-500">
                <span className="bg-zinc-800 px-2.5 py-1 rounded-full font-mono">
                  {formatGEN(BigInt(job.payment_wei))}
                </span>
                <span className="bg-zinc-800 px-2.5 py-1 rounded-full">
                  {job.revisions_left} revision{job.revisions_left !== 1 ? "s" : ""} left
                </span>
                <span className="text-zinc-600 font-mono hidden sm:inline">
                  {job.client ? job.client.slice(0, 8) + "…" : "—"}
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Mobile FAB */}
      <div className="sm:hidden fixed bottom-6 right-4 pb-safe">
        <Link
          href="/jobs/new"
          className="flex items-center justify-center w-14 h-14 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white rounded-full shadow-xl text-2xl transition"
          aria-label="Post Job"
        >
          +
        </Link>
      </div>
    </div>
  );
}
