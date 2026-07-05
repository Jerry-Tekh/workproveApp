/**
 * lib/genlayer.ts
 * Central GenLayer client + contract interaction helpers.
 * All contract read/write calls go through this file.
 *
 * SDK NOTES:
 * 1. Browser writes pass the MetaMask provider explicitly so GenLayerJS can
 *    sign with the connected wallet and verify the active chain.
 * 2. waitForTransactionReceipt uses TransactionStatus.FINALIZED enum
 *    imported from genlayer-js/types — not the raw string "FINALIZED".
 * 3. createClient receives the signer address as account: string. MetaMask
 *    handles the actual signing; no private key is held in the frontend.
 * 4. BigInt(10 ** 18) is avoided in parseGEN/formatGEN because 10**18
 *    exceeds Number.MAX_SAFE_INTEGER in JavaScript. All large constants use
 *    BigInt("1000000000000000000") string form to avoid float precision loss.
 */

import { createClient } from "genlayer-js";
import { TransactionStatus } from "genlayer-js/types";
import {
  localnet,
  studionet,
  testnetAsimov,
  testnetBradbury,
} from "genlayer-js/chains";
import type { GenLayerChain, Hash } from "genlayer-js/types";

// ─────────────────────────────────────────────────────────
// Network configuration
// ─────────────────────────────────────────────────────────

const CHAIN_MAP: Record<string, GenLayerChain> = {
  localnet,
  studionet,
  "testnet-asimov": testnetAsimov,
  "testnet-bradbury": testnetBradbury,
};

const NETWORK = process.env.NEXT_PUBLIC_GENLAYER_NETWORK || "testnet-bradbury";
const ACTIVE_CHAIN = CHAIN_MAP[NETWORK] ?? testnetBradbury;
export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";

if (typeof window !== "undefined" && !CONTRACT_ADDRESS) {
  console.warn(
    "[WorkProof] NEXT_PUBLIC_CONTRACT_ADDRESS is not set. " +
    "Deploy the contract and set it in .env.local."
  );
}

// ─────────────────────────────────────────────────────────
// Client factory
// ─────────────────────────────────────────────────────────

export function makeClient(signerAddress?: string) {
  const provider =
    typeof window !== "undefined" && signerAddress ? window.ethereum : undefined;
  return createClient({
    chain: ACTIVE_CHAIN,
    ...(signerAddress ? { account: signerAddress as `0x${string}` } : {}),
    ...(provider ? { provider } : {}),
  });
}

// Read-only client — lazily created so it's safe at module import time
let _readClient: ReturnType<typeof makeClient> | null = null;
function getReadClient() {
  if (!_readClient) _readClient = makeClient();
  return _readClient;
}

// ─────────────────────────────────────────────────────────
// GEN token helpers
// ─────────────────────────────────────────────────────────

// 1 GEN in wei — must use string form, NOT BigInt(10 ** 18).
// 10 ** 18 = 1_000_000_000_000_000_000 which is > Number.MAX_SAFE_INTEGER
// (9_007_199_254_740_991). Computing it as a float first then casting to
// BigInt can silently lose precision on some JS engines.
const ONE_GEN_WEI = BigInt("1000000000000000000");

/** Parse a human-readable GEN amount string (e.g. "1.5") to BigInt wei. */
export function parseGEN(genAmount: string): bigint {
  const trimmed = genAmount.trim();
  if (!trimmed || isNaN(Number(trimmed))) {
    throw new Error(`Invalid GEN amount: "${genAmount}"`);
  }
  const [whole, frac = ""] = trimmed.split(".");
  const fracPadded = frac.slice(0, 18).padEnd(18, "0");
  return BigInt(whole || "0") * ONE_GEN_WEI + BigInt(fracPadded || "0");
}

/** Format wei BigInt to a readable GEN string. */
export function formatGEN(wei: bigint): string {
  const whole = wei / ONE_GEN_WEI;
  const frac = wei % ONE_GEN_WEI;
  if (frac === 0n) return `${whole} GEN`;
  const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole}.${fracStr} GEN`;
}

// ─────────────────────────────────────────────────────────
// Error normalization
// ─────────────────────────────────────────────────────────

/** Extract a human-readable message from a GenLayer/RPC error. */
export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    // GenLayer UserError messages arrive wrapped in JSON-RPC error data
    const match = msg.match(/UserError[:\s]*["']?([^"'\n]+)/i);
    if (match) return match[1].trim();
    return msg;
  }
  return String(err);
}

// ─────────────────────────────────────────────────────────
// Contract read helpers
// ─────────────────────────────────────────────────────────

function assertContractConfigured() {
  if (!CONTRACT_ADDRESS) {
    throw new Error(
      "Contract address not configured. " +
      "Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local after deploying."
    );
  }
}

export async function getJob(jobId: string): Promise<Job> {
  assertContractConfigured();
  const result = await getReadClient().readContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName: "get_job",
    args: [jobId],
  });
  return result as unknown as Job;
}

export async function listJobs(offset = 0, limit = 20): Promise<JobSummary[]> {
  assertContractConfigured();
  const result = await getReadClient().readContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName: "list_jobs",
    args: [offset, limit],
  });
  return result as unknown as JobSummary[];
}

export async function listJobsByStatus(
  status: JobStatus,
  offset = 0,
  limit = 20
): Promise<JobSummary[]> {
  assertContractConfigured();
  const result = await getReadClient().readContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName: "list_jobs_by_status",
    args: [status, offset, limit],
  });
  return result as unknown as JobSummary[];
}

export async function jobCount(): Promise<number> {
  assertContractConfigured();
  const result = await getReadClient().readContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName: "job_count",
    args: [],
  });
  return Number(result);
}

// ─────────────────────────────────────────────────────────
// Contract write helpers (return tx hash)
// Docs: client.writeContract({ address, functionName, args, value })
// value is required per the GenLayerJS docs table.
// Non-payable methods pass value: 0n.
//
// IMPORTANT: initializeConsensusSmartContract() must be called before
// any deployment or contract interaction, per the live GenLayerJS docs:
// "Always call this before deploying or interacting with contracts."
// ─────────────────────────────────────────────────────────

async function makeWriteClient(signerAddress: string) {
  return makeClient(signerAddress);
}

export async function createJob(
  signerAddress: string,
  params: {
    jobId: string;
    criteria: string;
    paymentWei: bigint;
    deadlineTs: number;
    revisionLimit: number;
  }
): Promise<`0x${string}`> {
  assertContractConfigured();
  const client = await makeWriteClient(signerAddress);
  return client.writeContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName: "create_job",
    args: [
      params.jobId,
      params.criteria,
      params.deadlineTs,
      params.revisionLimit,
    ],
    value: params.paymentWei,
  }) as Promise<`0x${string}`>;
}

export async function acceptJob(
  signerAddress: string,
  jobId: string
): Promise<`0x${string}`> {
  assertContractConfigured();
  const client = await makeWriteClient(signerAddress);
  return client.writeContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName: "accept_job",
    args: [jobId],
    value: 0n,
  }) as Promise<`0x${string}`>;
}

export async function submitWork(
  signerAddress: string,
  params: {
    jobId: string;
    workUrl: string;
    submissionNotes: string;
  }
): Promise<`0x${string}`> {
  assertContractConfigured();
  const client = await makeWriteClient(signerAddress);
  return client.writeContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName: "submit_work",
    args: [params.jobId, params.workUrl, params.submissionNotes],
    value: 0n,
  }) as Promise<`0x${string}`>;
}

export async function cancelJob(
  signerAddress: string,
  jobId: string
): Promise<`0x${string}`> {
  assertContractConfigured();
  const client = await makeWriteClient(signerAddress);
  return client.writeContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName: "cancel_job",
    args: [jobId],
    value: 0n,
  }) as Promise<`0x${string}`>;
}

export async function reclaimExpiredJob(
  signerAddress: string,
  jobId: string
): Promise<`0x${string}`> {
  assertContractConfigured();
  const client = await makeWriteClient(signerAddress);
  return client.writeContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName: "reclaim_expired_job",
    args: [jobId],
    value: 0n,
  }) as Promise<`0x${string}`>;
}

// ─────────────────────────────────────────────────────────
// Wait for transaction finalization
// Uses TransactionStatus enum per the live GenLayerJS docs.
// ─────────────────────────────────────────────────────────

export async function waitForTx(hash: `0x${string}`) {
  return getReadClient().waitForTransactionReceipt({
    hash: hash as Hash,
    status: ACTIVE_CHAIN.isStudio
      ? TransactionStatus.ACCEPTED
      : TransactionStatus.FINALIZED,
  });
}

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export type JobStatus =
  | "open"
  | "in_progress"
  | "completed"
  | "disputed"
  | "cancelled"
  | "expired";

export interface Job {
  job_id: string;
  client: string;
  criteria: string;
  payment_wei: string;
  deadline_ts: number;
  revisions_left: number;
  status: JobStatus;
  freelancer: string;
  score: number;
  last_review_pass: boolean;
  last_review_summary: string;
  met_criteria: string[];
  unmet_criteria: string[];
  last_submission_tx_note: string;
}

export interface JobSummary {
  job_id: string;
  client: string;
  criteria: string;
  payment_wei: string;
  status: JobStatus;
  revisions_left: number;
  freelancer?: string;
}
