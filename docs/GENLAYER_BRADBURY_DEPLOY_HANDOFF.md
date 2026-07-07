# WorkProof GenLayer Contract Fix And Bradbury Deployment Handoff

Use this as a paste-ready handoff for another Codex chat.

## Project

Main project path:

```bash
/home/jerry/projects/workprove/workproof-final
```

Important folders:

```text
contract/workproof.py      GenLayer intelligent contract
contract/deploy.mjs        minimal Bradbury deployment script
frontend/                  Next.js frontend
```

## What Was Broken Initially

The contract had two GenLayer compatibility problems.

1. Schema loading failed in GenLayer Studio.

The original persistent storage used a structured/dataclass-style job object inside GenLayer storage, similar to:

```python
jobs: TreeMap[str, Job]
```

That caused Studio/schema RPC failures like:

```text
could not load contract schema
VMError: exit_code 1
```

Fix: store jobs as JSON strings instead of storing a Python dataclass directly.

Current storage pattern:

```python
jobs: TreeMap[str, str]
job_ids: DynArray[str]
treasury: str

def _load_job(self, job_id):
    return json.loads(self.jobs[job_id])

def _save_job(self, job_id, job):
    self.jobs[job_id] = json.dumps(job)
```

2. Deployment failed because storage containers were manually instantiated.

The contract used to do this inside `__init__`:

```python
self.jobs = TreeMap()
self.job_ids = DynArray()
```

GenLayer Studio/GenVM rejected this with:

```text
TypeError: this class can't be instantiated by user
```

Fix: declare storage at class level only. Do not instantiate `TreeMap()` or `DynArray()` manually in `__init__`.

Correct constructor:

```python
class WorkProof(gl.Contract):
    jobs: TreeMap[str, str]
    job_ids: DynArray[str]
    treasury: str

    def __init__(self, treasury_address: str) -> None:
        self.treasury = treasury_address
```

GenLayer initializes declared storage fields itself.

## Other Contract Fixes

Job list summaries were updated to include `deadline_ts`, so the frontend can display expired jobs correctly:

```python
result.append({
    "job_id":         jid,
    "client":         job["client"],
    "criteria":       job["criteria"][:120] + ("..." if len(job["criteria"]) > 120 else ""),
    "payment_wei":    job["payment_wei"],
    "deadline_ts":    int(job["deadline_ts"]),
    "status":         job["status"],
    "revisions_left": int(job["revisions_left"]),
    "freelancer":     job["freelancer"],
})
```

Note: blockchain state does not automatically mutate when time passes. If a job is stored as `open`, it stays `open` on-chain until a write transaction changes it. The frontend therefore derives display status as `expired` when `status === "open"` and `deadline_ts` has passed.

## Minimal Dependency Deployment Approach

No GenLayer CLI, Python venv, pip, or pytest was required to deploy.

The contract deploy path used only:

```text
Node.js
npm
genlayer-js
```

`contract/package.json` only needs:

```json
{
  "type": "module",
  "dependencies": {
    "genlayer-js": "^1.1.8"
  }
}
```

Install only inside the contract folder:

```bash
cd /home/jerry/projects/workprove/workproof-final/contract
npm install
```

## Safe Private Key Handling

Do not paste the private key into chat.

Do not put the private key in `frontend/.env.local`.

Put deployment secrets only in:

```text
contract/.env.local
```

Example:

```env
PRIVATE_KEY=0xYOUR_DEPLOYER_PRIVATE_KEY
TREASURY_ADDRESS=0xYOUR_TREASURY_WALLET_ADDRESS
```

The repo `.gitignore` ignores `.env.local`, so it is not pushed.

## Deploy Script Behavior

`contract/deploy.mjs` was updated to:

1. Read `PRIVATE_KEY` and `TREASURY_ADDRESS` from `contract/.env.local` without adding `dotenv`.
2. Deploy using `genlayer-js`.
3. Support `testnet-bradbury`.
4. Wait for `ACCEPTED` first.
5. Try waiting for `FINALIZED`, but fall back to the accepted receipt if finalization takes too long.
6. Extract contract address from multiple SDK receipt shapes.
7. Automatically write `frontend/.env.local`.

Key deploy script pieces:

```js
import { createClient, createAccount } from "genlayer-js";
import { TransactionStatus } from "genlayer-js/types";
import {
  localnet,
  studionet,
  testnetAsimov,
  testnetBradbury,
} from "genlayer-js/chains";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
```

Simple env loader without extra dependency:

```js
function loadEnvFile(path) {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const key = match[1];
    if (process.env[key] !== undefined) continue;

    let value = match[2].trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);

    process.env[key] = value;
  }
}

loadEnvFile(join(__dirname, ".env.local"));
loadEnvFile(join(__dirname, ".env"));
```

Network map:

```js
const CHAINS = {
  localnet,
  studionet,
  "testnet-asimov": testnetAsimov,
  "testnet-bradbury": testnetBradbury,
};
```

Deploy:

```js
const privateKey = process.env.PRIVATE_KEY;
const account = privateKey ? createAccount(privateKey) : createAccount();
const client = createClient({ chain, account });
const TREASURY = process.env.TREASURY_ADDRESS || account.address;

const contractCode = readFileSync(join(__dirname, "workproof.py"), "utf8");

const txHash = await client.deployContract({
  code: contractCode,
  args: [TREASURY],
});
```

Bradbury sometimes reaches `ACCEPTED` but not `FINALIZED` before the default timeout. Status `5` means `ACCEPTED`.

The script was changed to handle that:

```js
async function waitForDeployReceipt(client, txHash) {
  const acceptedReceipt = await client.waitForTransactionReceipt({
    hash: txHash,
    status: TransactionStatus.ACCEPTED,
    interval: 5000,
    retries: 60,
  });

  try {
    return await client.waitForTransactionReceipt({
      hash: txHash,
      status: TransactionStatus.FINALIZED,
      interval: 5000,
      retries: 120,
    });
  } catch (err) {
    console.warn("Finalization was not observed before timeout. Using accepted receipt.");
    console.warn(err?.message || err);
    return acceptedReceipt;
  }
}
```

Contract address extraction:

```js
function getDeployContractAddress(receipt) {
  return (
    receipt.data?.contract_address ||
    receipt.data?.contractAddress ||
    receipt.txDataDecoded?.contractAddress ||
    receipt.recipient
  );
}
```

## Bradbury Deployment Command

After `contract/.env.local` is set:

```bash
cd /home/jerry/projects/workprove/workproof-final/contract
node deploy.mjs testnet-bradbury
```

Expected behavior:

```text
Deploying WorkProof to: testnet-bradbury
Deployer:  0x...
Treasury:  0x...

Submitting deploy transaction...
Deploy tx submitted: 0x...
Waiting for acceptance...
Deploy transaction accepted.
Waiting for finalization...
WorkProof deployed!
Contract address: 0x...
```

If finalization times out with:

```text
Timed out waiting for transaction ... to reach status "FINALIZED" (current status: 5)
```

that does not necessarily mean deploy failed. Status `5` is `ACCEPTED`. Query the transaction with `getTransaction` and check:

```text
statusName: ACCEPTED
txExecutionResultName: FINISHED_WITH_RETURN
txDataDecoded.contractAddress: 0x...
```

## Verify Deployed Contract

Use a read-only check:

```bash
cd /home/jerry/projects/workprove/workproof-final/contract
node -e 'import { createClient } from "genlayer-js"; import { testnetBradbury } from "genlayer-js/chains"; const client=createClient({chain:testnetBradbury}); const address="0xYOUR_CONTRACT_ADDRESS"; const r=await client.readContract({address,functionName:"job_count",args:[]}); console.log("job_count", r);'
```

Expected for a new deployment:

```text
job_count 0
```

## Frontend Production Env

The deploy script writes:

```text
frontend/.env.local
```

with:

```env
NEXT_PUBLIC_GENLAYER_NETWORK=testnet-bradbury
NEXT_PUBLIC_CONTRACT_ADDRESS=0xYOUR_CONTRACT_ADDRESS
```

For Vercel, set the same env vars in the Vercel dashboard:

```env
NEXT_PUBLIC_GENLAYER_NETWORK=testnet-bradbury
NEXT_PUBLIC_CONTRACT_ADDRESS=0xYOUR_CONTRACT_ADDRESS
```

Do not add `PRIVATE_KEY` to Vercel unless deploying contracts from CI, which this project does not do.

## Vercel Settings

Import GitHub repo:

```text
Jerry-Tekh/workproveApp
```

Settings:

```text
Framework: Next.js
Root Directory: frontend
Install Command: npm install
Build Command: npm run build
Output Directory: .next
```

## Frontend GenLayer Transaction Fix

The frontend originally waited for `FINALIZED`, which caused false timeout errors on Bradbury:

```text
Timed out waiting for transaction ... to reach status "FINALIZED" (current status: 5)
```

Fix: wait for `ACCEPTED` for user-facing success.

```ts
export async function waitForTx(hash: `0x${string}`) {
  const receipt = await getReadClient().waitForTransactionReceipt({
    hash: hash as Hash,
    status: TransactionStatus.ACCEPTED,
    interval: 5000,
    retries: 60,
  });

  const executionResult = String(
    (receipt as { txExecutionResultName?: unknown }).txExecutionResultName ?? ""
  );
  if (executionResult === "FINISHED_WITH_ERROR") {
    const message = await getTxFailureMessage(hash);
    throw new Error(
      message || "Transaction was accepted, but contract execution failed."
    );
  }

  return receipt;
}
```

Important: `ACCEPTED` can still have `FINISHED_WITH_ERROR`, so the frontend also traces failed accepted transactions to surface the real contract error, for example:

```text
Job 'job-3-1' already exists
```

## Validation Used

Commands used during development:

```bash
python3 -m py_compile contract/workproof.py
node --check contract/deploy.mjs
cd frontend && npm run build
cd frontend && node node_modules/typescript/bin/tsc --noEmit
```

Python integration tests were not run because the environment did not have:

```text
pip
python3-venv
pytest
genlayer_test
genlayer CLI
```

The deploy did not require those Python tools.
