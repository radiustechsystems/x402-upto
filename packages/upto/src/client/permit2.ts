/**
 * Client-side Permit2 payload creation for the upto scheme.
 *
 * Mirrors @x402/evm exact client, but the signed `amount` represents a
 * MAX ceiling. The facilitator settles only the metered amount.
 */

import {
  PERMIT2_ADDRESS,
  PERMIT2_DOMAIN,
  WITNESS_TYPES,
  X402_UPTO_PERMIT2_PROXY_ADDRESS,
} from "../constants.js";
import type {
  ClientSigner,
  UptoPaymentRequirements,
  UptoPermit2Payload,
} from "../types.js";

/** Parse CAIP-2 network ID to chain ID number. */
function parseChainId(network: string): number {
  const parts = network.split(":");
  if (parts.length !== 2 || parts[0] !== "eip155") {
    throw new Error(`Unsupported network format: ${network}. Expected eip155:<chainId>`);
  }
  return parseInt(parts[1], 10);
}

/**
 * Creates a signed Permit2 payload authorizing UP TO `maxAmount` in token transfers.
 *
 * The client signs the maximum they're willing to spend. The actual settled
 * amount is determined by the server's meter function after request processing.
 */
export async function createUptoPermit2Payload(
  signer: ClientSigner,
  requirements: UptoPaymentRequirements,
): Promise<UptoPermit2Payload> {
  const chainId = parseChainId(requirements.network);
  const deadline = Math.floor(Date.now() / 1000) + requirements.maxTimeoutSeconds;
  const validAfter = Math.floor(Date.now() / 1000) - 60; // 1 min buffer
  const nonce = BigInt(Math.floor(Math.random() * 2 ** 48)).toString();

  const domain = {
    ...PERMIT2_DOMAIN,
    chainId,
  };

  const message = {
    permitted: {
      token: requirements.asset,
      amount: requirements.maxAmount,
    },
    spender: X402_UPTO_PERMIT2_PROXY_ADDRESS,
    nonce: BigInt(nonce),
    deadline: BigInt(deadline),
    witness: {
      to: requirements.payTo,
      validAfter: BigInt(validAfter),
      extra: "0x" as `0x${string}`,
    },
  };

  const signature = await signer.signTypedData({
    domain,
    types: WITNESS_TYPES,
    primaryType: "PermitWitnessTransferFrom",
    message: message as unknown as Record<string, unknown>,
  });

  return {
    signature,
    permit2Authorization: {
      from: signer.address,
      permitted: {
        token: requirements.asset,
        amount: requirements.maxAmount,
      },
      spender: X402_UPTO_PERMIT2_PROXY_ADDRESS,
      nonce,
      deadline: deadline.toString(),
      witness: {
        to: requirements.payTo,
        validAfter: validAfter.toString(),
        extra: "0x",
      },
    },
  };
}

/**
 * Builds an ERC-20 approve transaction for Permit2.
 * Users must execute this once per token before using x402.
 */
export function createPermit2ApprovalTx(tokenAddress: `0x${string}`) {
  return {
    to: tokenAddress,
    data: encodeApproval(PERMIT2_ADDRESS, BigInt(2) ** BigInt(160) - BigInt(1)),
  };
}

/** Encode ERC-20 approve(spender, amount) calldata. */
function encodeApproval(spender: string, amount: bigint): `0x${string}` {
  // approve(address,uint256) selector = 0x095ea7b3
  const spenderPadded = spender.slice(2).toLowerCase().padStart(64, "0");
  const amountHex = amount.toString(16).padStart(64, "0");
  return `0x095ea7b3${spenderPadded}${amountHex}` as `0x${string}`;
}
