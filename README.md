# WorkProof — Local Setup Guide

Complete guide to run WorkProof on your own computer from scratch.

---

## What you will have running by the end

```
Your computer
├── GenLayer Studio (browser tab)  ← where you deploy + test the contract
├── Terminal 1: frontend dev server  ← http://localhost:3000
└── MetaMask in your browser  ← wallet for signing transactions
```

---

## Prerequisites — install these first

### 1. Node.js 18 or newer

Check if you already have it:
```bash
node --version
```
If missing, download from https://nodejs.org — pick the **LTS** version.

### 2. Python 3.11 or newer (for running the test suite)

Check:
```bash
python3 --version
```
If missing: https://www.python.org/downloads/

### 3. MetaMask browser extension

Install from https://metamask.io/download — Chrome, Firefox, or Brave.
Create a wallet if you don't have one. Write down your seed phrase.

### 4. Git (to extract the project)

Usually already installed. Check with `git --version`.

---

## Step 1 — Extract the project

Unzip `workproof-production-final.zip` anywhere on your computer.

```
workproof-final/
├── contract/       ← Python Intelligent Contract + deploy script
├── tests/          ← Integration test suite
└── frontend/       ← Next.js web app
```

Open a terminal and navigate into it:
```bash
cd path/to/workproof-final
```

---

## Step 2 — Get testnet GEN tokens (free)

You need GEN tokens to pay for contract deployment and escrow.

1. Open MetaMask → click your account address to copy it
2. Go to: https://faucet.genlayer.com
3. Paste your address and request tokens
4. You'll receive testnet GEN within ~30 seconds

Keep MetaMask open — you'll need your wallet address in the next step.

---

## Step 3 — Deploy the contract

### 3a. Install the deploy script dependencies

```bash
cd contract
npm install
```

### 3b. Export your environment variables

**On Mac or Linux:**
```bash
export PRIVATE_KEY=0xYOUR_METAMASK_PRIVATE_KEY
export TREASURY_ADDRESS=0xYOUR_METAMASK_ADDRESS
```

**On Windows (Command Prompt):**
```cmd
set PRIVATE_KEY=0xYOUR_METAMASK_PRIVATE_KEY
set TREASURY_ADDRESS=0xYOUR_METAMASK_ADDRESS
```

**On Windows (PowerShell):**
```powershell
$env:PRIVATE_KEY="0xYOUR_METAMASK_PRIVATE_KEY"
$env:TREASURY_ADDRESS="0xYOUR_METAMASK_ADDRESS"
```

---

### How to get your MetaMask private key

⚠️ **Never share this with anyone. It controls your wallet.**

1. Open MetaMask
2. Click the three dots (⋯) next to your account name
3. Click **Account details**
4. Click **Show private key**
5. Enter your MetaMask password
6. Copy the key — it starts with `0x`

`TREASURY_ADDRESS` is just your regular wallet address (the `0x...` shown at the top of MetaMask). The 2% platform fee will go here.

---

### 3c. Deploy to testnet

```bash
node deploy.mjs testnet-bradbury
```

You will see output like:
```
Deploying WorkProof to: testnet-bradbury
Deployer:  0xYourAddress
Treasury:  0xYourAddress

Submitting deploy transaction...
Deploy tx submitted: 0xabc123...
Waiting for finalization (this can take ~30-60s on testnet)...

✅ WorkProof deployed!
Contract address: 0xDEF456...

Wrote frontend/.env.local automatically.
```

The script automatically creates `frontend/.env.local` with the contract address. You don't need to do anything else.

If you get an error, see the **Troubleshooting** section at the bottom.

---

## Step 4 — Run the frontend

Open a **new terminal** (keep the contract terminal open or close it — doesn't matter):

```bash
cd path/to/workproof-final/frontend
npm install
npm run dev
```

You will see:
```
▲ Next.js 15.5.20
- Local:   http://localhost:3000
- Ready in 2.1s
```

Open **http://localhost:3000** in your browser.

---

## Step 5 — Add GenLayer network to MetaMask

When you first click **Connect Wallet** in the app, it will show a
**"Wrong network — switch"** button if MetaMask is on the wrong network.

Click it. MetaMask will ask permission to add the GenLayer Testnet Bradbury
network. Click **Approve**.

If you prefer to add it manually:

1. Open MetaMask → Networks → Add Network → Add manually
2. Fill in:

| Field | Value |
|---|---|
| Network name | GenLayer Testnet Bradbury |
| New RPC URL | https://rpc-bradbury.genlayer.com |
| Chain ID | 4221 |
| Currency symbol | GEN |
| Block explorer URL | https://explorer-bradbury.genlayer.com |

---

## Step 6 — Use the app

Go to **http://localhost:3000** and:

- Click **Browse Jobs** to see the job board
- Click **Post Job** to create a new job and escrow GEN
- Click **Dashboard** to see jobs you've posted or accepted

### Quick test flow (two browser windows)

Open the app in two browser windows (or two browsers) with different
MetaMask accounts:

**Window 1 (client account):**
1. Connect wallet → Post Job
2. Fill in a job ID (e.g. `test-job-001`)
3. Write acceptance criteria (e.g. "Build a simple HTML page with a heading and a paragraph")
4. Set payment to 1 GEN, deadline to 3 days, revisions to 2
5. Click **Post Job & Escrow Payment** — confirm in MetaMask

**Window 2 (freelancer account):**
1. Connect a different wallet
2. Browse Jobs → find `test-job-001`
3. Click **Accept Job**
4. Once accepted, submit a work URL (any public URL, e.g. `https://example.com`)
5. Add submission notes
6. Click **Submit for AI Review**

GenLayer validators will fetch the URL, run the LLM evaluation, reach
consensus, and either release payment or mark it as needing revision.
This typically takes 30–90 seconds on testnet.

---

## Environment variables — complete reference

### frontend/.env.local

Created automatically by the deploy script. Edit manually if needed:

```env
# Which GenLayer network to connect to
# Options: localnet | studionet | testnet-asimov | testnet-bradbury
NEXT_PUBLIC_GENLAYER_NETWORK=testnet-bradbury

# The deployed contract address (output from deploy.mjs)
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
```

Both variables must start with `NEXT_PUBLIC_` for Next.js to expose them
to the browser. They are replaced at build time.

### Deploy script environment variables

Set in your shell before running `node deploy.mjs`:

```env
# Required for testnet/studionet. Your MetaMask private key.
# NOT needed for localnet (a throwaway key is generated).
PRIVATE_KEY=0x...

# Optional. Where the 2% platform fee goes.
# Defaults to the deployer address if not set.
TREASURY_ADDRESS=0x...
```

These are shell variables, not a `.env` file. They are read by the Node.js
deploy script directly.

---

## Running the test suite (optional but recommended)

```bash
cd tests
pip install -r requirements.txt --break-system-packages
genlayer up
pytest test_workproof.py -v
```

`genlayer up` starts a local GenLayer node on your machine. This requires
Docker to be installed: https://docs.docker.com/get-docker/

The tests spin up a local network, deploy the contract, and run 21 test
functions covering the full lifecycle. This takes about 2–3 minutes.

---

## Network options

| Network | Use for | Notes |
|---|---|---|
| `testnet-bradbury` | Real testing with public validators | Recommended for development |
| `studionet` | Testing through GenLayer Studio UI | Shared testnet, Studio IDE available |
| `testnet-asimov` | Alternative testnet | Same chain ID as Bradbury |
| `localnet` | Fully offline local testing | Requires Docker + `genlayer up` |

To switch networks, change `NEXT_PUBLIC_GENLAYER_NETWORK` in
`frontend/.env.local`, redeploy the contract to that network, and update
`NEXT_PUBLIC_CONTRACT_ADDRESS` with the new address.

---

## Project structure

```
workproof-final/
│
├── contract/
│   ├── workproof.py      Python Intelligent Contract
│   ├── deploy.mjs        Deploy script (run with node deploy.mjs)
│   └── package.json      deploy script dependencies (genlayer-js)
│
├── tests/
│   ├── test_workproof.py  Integration tests (21 test functions)
│   ├── requirements.txt   pip dependencies (genlayer-test, pytest)
│   └── pytest.ini         test configuration
│
└── frontend/
    ├── .env.example       copy this to .env.local and fill in
    ├── .env.local         your actual config (created by deploy script)
    ├── package.json       npm dependencies
    │
    └── src/
        ├── app/
        │   ├── page.tsx              landing page
        │   ├── jobs/page.tsx         job board with filters
        │   ├── jobs/new/page.tsx     post a job
        │   ├── jobs/[id]/page.tsx    job detail, submit, review
        │   └── dashboard/page.tsx    your jobs
        │
        ├── components/ui.tsx         all shared UI components
        │
        └── lib/
            ├── genlayer.ts           all contract calls (single source)
            └── useWallet.ts          MetaMask hook + network verification
```

---

## Troubleshooting

### "Deploy failed: insufficient funds"
Your wallet doesn't have enough testnet GEN. Go to https://faucet.genlayer.com
and request more tokens.

### "PRIVATE_KEY env var is required"
You forgot to export the env variable before running the deploy script.
Run `export PRIVATE_KEY=0x...` first, then run the deploy command again.

### "Contract not configured" error in the browser
The `frontend/.env.local` file either doesn't exist or has an empty
`NEXT_PUBLIC_CONTRACT_ADDRESS`. Run `cat frontend/.env.local` to check.
If missing, re-run the deploy script or create the file manually.

### MetaMask shows the wrong network
Click **Connect Wallet** — if the button shows "Wrong network — switch",
click it and approve the network switch in MetaMask.

### Port 3000 already in use
```bash
npm run dev -- -p 3001
```
Then open http://localhost:3001 instead.

### Transaction pending for a long time
GenLayer testnet validators may be slower during high traffic. Wait up to
2 minutes. If it stays pending, check the testnet explorer:
https://explorer-bradbury.genlayer.com

### "Cannot read properties of undefined" on a page
Make sure `frontend/.env.local` exists with both variables set, then
restart the dev server (`Ctrl+C` then `npm run dev` again). Next.js
reads env vars at startup.
