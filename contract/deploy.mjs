/**
 * deploy.mjs — WorkProof deploy script
 * Usage: node deploy.mjs [localnet|studionet|testnet-asimov|testnet-bradbury]
 *
 * Reads contract from ../contract/workproof.py
 * Requires PRIVATE_KEY env var (account that signs the deploy tx)
 * Optional TREASURY_ADDRESS env var (defaults to deployer address)
 */

import { createClient, createAccount } from "genlayer-js";
import { TransactionStatus } from "genlayer-js/types";
import {
  localnet,
  studionet,
  testnetAsimov,
  testnetBradbury,
} from "genlayer-js/chains";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CHAINS = {
  localnet,
  studionet,
  "testnet-asimov": testnetAsimov,
  "testnet-bradbury": testnetBradbury,
};

const networkArg = process.argv[2] || "localnet";
const chain = CHAINS[networkArg];
if (!chain) {
  console.error(`Unknown network: ${networkArg}`);
  console.error(`Available: ${Object.keys(CHAINS).join(", ")}`);
  process.exit(1);
}

const privateKey = process.env.PRIVATE_KEY;
if (!privateKey && networkArg !== "localnet") {
  console.error(
    "PRIVATE_KEY env var is required for non-localnet deployments."
  );
  process.exit(1);
}

const account = privateKey ? createAccount(privateKey) : createAccount();
const client = createClient({ chain, account });

const TREASURY = process.env.TREASURY_ADDRESS || account.address;

async function main() {
  console.log(`\nDeploying WorkProof to: ${networkArg}`);
  console.log(`Deployer:  ${account.address}`);
  console.log(`Treasury:  ${TREASURY}`);

  const contractCode = readFileSync(
    join(__dirname, "workproof.py"),
    "utf8"
  );

  console.log("\nSubmitting deploy transaction...");
  const txHash = await client.deployContract({
    code: contractCode,
    args: [TREASURY],
  });

  console.log(`Deploy tx submitted: ${txHash}`);
  console.log("Waiting for finalization (this can take ~30-60s on testnet)...");

  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    status: TransactionStatus.FINALIZED,
  });

  const contractAddress = receipt.data?.contract_address;

  if (!contractAddress) {
    console.error("Deploy finalized but no contract_address found in receipt.");
    console.error("Full receipt:", JSON.stringify(receipt, null, 2));
    process.exit(1);
  }

  console.log(`\n✅ WorkProof deployed!`);
  console.log(`Contract address: ${contractAddress}`);

  // Auto-write to frontend .env.local for convenience
  const envPath = join(__dirname, "../frontend/.env.local");
  const envContent = `NEXT_PUBLIC_GENLAYER_NETWORK=${networkArg}\nNEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}\n`;
  try {
    writeFileSync(envPath, envContent);
    console.log(`\nWrote frontend/.env.local automatically.`);
  } catch (e) {
    console.log(`\nAdd this to frontend/.env.local manually:`);
    console.log(envContent);
  }
}

main().catch((err) => {
  console.error("Deploy failed:", err);
  process.exit(1);
});
