/**
 * Standalone facilitator server for x402 upto metered billing.
 *
 * Endpoints:
 *   POST /verify   — Validate an upto payment authorization
 *   POST /settle   — Settle a metered payment on-chain
 *   GET  /supported — List supported schemes and networks
 *   GET  /stats     — Payment audit statistics
 */

import express from "express";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import { verifyUpto, settleUpto } from "@radius/x402-upto/facilitator";
import type { UptoPermit2Payload, UptoPaymentRequirements, FacilitatorSigner } from "@radius/x402-upto";
import { loadConfig } from "./config.js";
import { initDb } from "./db/init.js";
import { recordVerification, recordSettlement, recordFailure, getStats } from "./db/stats.js";

const config = loadConfig();
const db = initDb();

// Chain mapping
const chains: Record<string, typeof baseSepolia> = {
  "eip155:84532": baseSepolia,
  "eip155:8453": base,
};

const chain = chains[config.network] ?? baseSepolia;
const account = privateKeyToAccount(config.privateKey);

const publicClient = createPublicClient({
  chain,
  transport: http(config.rpcUrl),
});

const walletClient = createWalletClient({
  account,
  chain,
  transport: http(config.rpcUrl),
});

// Build a FacilitatorSigner from viem clients
const facilitatorSigner: FacilitatorSigner = {
  async readContract({ address, abi, functionName, args }) {
    return publicClient.readContract({
      address,
      abi: abi as readonly unknown[],
      functionName,
      args: args as readonly unknown[],
    } as Parameters<typeof publicClient.readContract>[0]);
  },
  async verifyTypedData({ address, domain, types, primaryType, message, signature }) {
    const valid = await publicClient.verifyTypedData({
      address,
      domain: domain as Parameters<typeof publicClient.verifyTypedData>[0]["domain"],
      types: types as Parameters<typeof publicClient.verifyTypedData>[0]["types"],
      primaryType,
      message,
      signature,
    });
    return valid;
  },
  async writeContract({ address, abi, functionName, args }) {
    return walletClient.writeContract({
      address,
      abi: abi as readonly unknown[],
      functionName,
      args: args as readonly unknown[],
      account,
      chain,
    } as Parameters<typeof walletClient.writeContract>[0]);
  },
  async waitForTransactionReceipt({ hash }) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return {
      status: receipt.status,
      transactionHash: receipt.transactionHash,
    };
  },
};

const app = express();
app.use(express.json());

// Health check
app.get("/", (_req, res) => {
  res.json({ service: "x402-upto-facilitator", status: "ok" });
});

// Verify an upto payment authorization
app.post("/verify", async (req, res) => {
  try {
    const { payload, requirements } = req.body as {
      payload: UptoPermit2Payload;
      requirements: UptoPaymentRequirements;
    };

    if (!payload || !requirements) {
      res.status(400).json({ isValid: false, invalidReason: "missing_payload_or_requirements" });
      return;
    }

    const result = await verifyUpto(facilitatorSigner, payload, requirements);

    if (result.isValid) {
      recordVerification(db, {
        payer: payload.permit2Authorization.from,
        recipient: payload.permit2Authorization.witness.to,
        token: payload.permit2Authorization.permitted.token,
        authorized_amount: payload.permit2Authorization.permitted.amount,
        nonce: payload.permit2Authorization.nonce,
        status: "verified",
        network: requirements.network,
      });
    }

    res.json(result);
  } catch (err) {
    console.error("Verify error:", err);
    res.status(500).json({
      isValid: false,
      invalidReason: "internal_error",
    });
  }
});

// Settle a metered payment on-chain
app.post("/settle", async (req, res) => {
  try {
    const { payload, requirements } = req.body as {
      payload: UptoPermit2Payload;
      requirements: UptoPaymentRequirements;
    };

    if (!payload || !requirements) {
      res.status(400).json({ success: false, error: "missing_payload_or_requirements" });
      return;
    }

    const result = await settleUpto(facilitatorSigner, payload, requirements);

    if (result.success && result.txHash) {
      recordSettlement(
        db,
        payload.permit2Authorization.nonce,
        result.settledAmount ?? payload.settlementAmount ?? "0",
        result.txHash,
      );
    } else {
      recordFailure(db, payload.permit2Authorization.nonce, result.error ?? "unknown");
    }

    res.json(result);
  } catch (err) {
    console.error("Settle error:", err);
    res.status(500).json({
      success: false,
      error: "internal_error",
    });
  }
});

// Supported schemes and networks
app.get("/supported", (_req, res) => {
  res.json({
    schemes: ["upto"],
    networks: [config.network],
    facilitator: account.address,
  });
});

// Payment statistics
app.get("/stats", (_req, res) => {
  res.json(getStats(db));
});

app.listen(config.port, () => {
  console.log(`x402 upto facilitator running on port ${config.port}`);
  console.log(`  Network: ${config.network}`);
  console.log(`  Facilitator: ${account.address}`);
});
