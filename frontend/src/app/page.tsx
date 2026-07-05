import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-14 sm:space-y-20">

      {/* Hero */}
      <section className="text-center space-y-5 pt-4 sm:pt-8 pb-2">
        <div className="inline-block bg-emerald-950 border border-emerald-800 text-emerald-300 text-xs font-semibold px-3 py-1.5 rounded-full">
          Built on GenLayer · Testnet Bradbury
        </div>
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.1]">
          Freelance payments,
          <br />
          <span className="text-emerald-400">verified by AI.</span>
        </h1>
        <p className="text-zinc-400 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed px-2">
          WorkProof escrows your payment on-chain. When you submit, an
          Intelligent Contract reads your work, scores it against the criteria,
          and releases funds instantly — no 20% platform fee, no 14-day holds,
          no biased humans.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2 px-4 sm:px-0">
          <Link
            href="/jobs/new"
            className="bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white font-semibold px-8 py-3.5 sm:py-3 rounded-xl transition text-sm text-center"
          >
            Post a Job
          </Link>
          <Link
            href="/jobs"
            className="bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-900 border border-zinc-700 text-zinc-100 font-semibold px-8 py-3.5 sm:py-3 rounded-xl transition text-sm text-center"
          >
            Browse Open Jobs
          </Link>
        </div>
      </section>

      {/* Stats bar */}
      <section className="grid grid-cols-3 gap-px bg-zinc-800 rounded-2xl overflow-hidden border border-zinc-800">
        {[
          { label: "Platform fee", value: "2%", sub: "vs Upwork's 20%" },
          { label: "Hold time", value: "~0s", sub: "vs 14 days" },
          { label: "Mediator", value: "AI", sub: "not a human" },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-zinc-950 px-2 sm:px-4 py-5 sm:py-6 text-center space-y-1"
          >
            <p className="text-xl sm:text-3xl font-black text-emerald-400">
              {s.value}
            </p>
            <p className="text-xs text-zinc-400 font-medium leading-tight">
              {s.label}
            </p>
            <p className="text-xs text-zinc-600 hidden sm:block">{s.sub}</p>
          </div>
        ))}
      </section>

      {/* How it works */}
      <section className="space-y-6">
        <h2 className="text-xl sm:text-2xl font-bold text-center">
          How it works
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              n: "01",
              title: "Client posts a job",
              body: "Write acceptance criteria in plain English. Attach GEN tokens as escrow. The contract holds them trustlessly.",
            },
            {
              n: "02",
              title: "Freelancer submits work",
              body: "Share a GitHub repo, deployed URL, or Notion link. Add notes about your implementation.",
            },
            {
              n: "03",
              title: "AI releases payment",
              body: "GenLayer validators fetch your work, run an LLM review, reach consensus, and release funds instantly on pass.",
            },
          ].map((step) => (
            <div
              key={step.n}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-2"
            >
              <span className="text-emerald-500 text-xs font-mono font-bold">
                {step.n}
              </span>
              <h3 className="font-semibold text-zinc-100">{step.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Validator Consensus */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-8 space-y-3">
        <h3 className="font-bold text-zinc-100 flex items-center gap-2">
          <span className="text-emerald-400">⚡</span> Validator Consensus
        </h3>
        <p className="text-sm text-zinc-400 leading-relaxed">
          WorkProof uses GenLayer&apos;s Equivalence Principle. Multiple
          independent validators evaluate your submission. Payment only releases
          when a majority agree: same pass/fail verdict, score within ±10
          points. This prevents any single node from manipulating results.
        </p>
      </section>
    </div>
  );
}
