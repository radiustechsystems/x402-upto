/**
 * Demo client: Signs a max authorization and makes a metered API call.
 *
 * Usage:
 *   PRIVATE_KEY=0x... tsx client.ts
 *
 * The client authorizes up to $1.00 USDC but only pays for actual token usage.
 */

import { createUptoPermit2Payload } from "@radius/x402-upto/client";
import { formatUsdcAmount, USDC_DECIMALS } from "@radius/x402-upto";
import type { ClientSigner, UptoPaymentRequirements } from "@radius/x402-upto";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3000";
const PRIVATE_KEY =
  (process.env.PRIVATE_KEY as `0x${string}`) ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Hardhat #0

async function main() {
  // Set up wallet
  const account = privateKeyToAccount(PRIVATE_KEY);
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
  });

  const signer: ClientSigner = {
    address: account.address,
    signTypedData: async (params) => {
      return walletClient.signTypedData({
        account,
        domain: params.domain as Parameters<typeof walletClient.signTypedData>[0]["domain"],
        types: params.types as Parameters<typeof walletClient.signTypedData>[0]["types"],
        primaryType: params.primaryType,
        message: params.message,
      });
    },
  };

  console.log(`Client: ${account.address}`);
  console.log();

  // Step 1: Get payment requirements (402 response)
  console.log("1. Requesting without payment...");
  const initialResponse = await fetch(`${SERVER_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "What is x402?" }],
    }),
  });

  if (initialResponse.status !== 402) {
    console.log(`   Unexpected status: ${initialResponse.status}`);
    return;
  }

  const paymentRequired = await initialResponse.json() as {
    accepts: UptoPaymentRequirements[];
  };
  const requirements = paymentRequired.accepts[0];
  console.log(`   Got 402 — scheme: ${requirements.scheme}`);
  console.log(`   Max amount: ${formatUsdcAmount(requirements.maxAmount)}`);
  console.log();

  // Step 2: Sign max authorization
  console.log("2. Signing authorization...");
  const payload = await createUptoPermit2Payload(signer, requirements);
  console.log(`   Authorized: ${formatUsdcAmount(payload.permit2Authorization.permitted.amount)}`);
  console.log();

  // Step 3: Make the paid request
  console.log("3. Making paid request...");
  const paymentHeader = btoa(JSON.stringify(payload));
  const paidResponse = await fetch(`${SERVER_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Payment": paymentHeader,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: "What is x402?" }],
    }),
  });

  if (paidResponse.status !== 200) {
    const error = await paidResponse.json();
    console.log(`   Payment failed: ${JSON.stringify(error)}`);
    return;
  }

  const completion = await paidResponse.json() as {
    content: string;
    metering: {
      tokens_consumed: number;
      total_cost: string;
      total_cost_units: string;
    };
  };

  // Step 4: Show results
  console.log(`   Response: "${completion.content.slice(0, 80)}..."`);
  console.log();
  console.log("4. Metering results:");
  console.log(`   Tokens consumed: ${completion.metering.tokens_consumed}`);
  console.log(`   Cost: ${completion.metering.total_cost}`);
  console.log(`   Authorized: ${formatUsdcAmount(payload.permit2Authorization.permitted.amount)}`);

  // Check settlement headers
  const settledAmount = paidResponse.headers.get("X-Payment-Settled");
  const txHash = paidResponse.headers.get("X-Payment-TxHash");

  if (settledAmount) {
    console.log(`   Settled: ${formatUsdcAmount(settledAmount)}`);
  }
  if (txHash) {
    console.log(`   Tx: ${txHash}`);
  }

  console.log();
  console.log("The client authorized $1.00 but only paid for actual usage.");
}

main().catch(console.error);
