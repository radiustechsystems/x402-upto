/**
 * Facilitator-side Permit2 verification and settlement for the upto scheme.
 *
 * verify: Checks signature, deadline, balance, Permit2 allowance.
 * settle: Calls the upto proxy with the metered settlementAmount.
 */

import {
  ERC20_ABI,
  PERMIT2_ADDRESS,
  PERMIT2_DOMAIN,
  WITNESS_TYPES,
  X402_UPTO_PERMIT2_PROXY_ADDRESS,
  X402_UPTO_PROXY_ABI,
} from "../constants.js";
import type {
  FacilitatorSigner,
  UptoPaymentRequirements,
  UptoPermit2Payload,
  VerifyResult,
  SettleResult,
} from "../types.js";

/** Parse CAIP-2 network to chain ID. */
function parseChainId(network: string): number {
  return parseInt(network.split(":")[1], 10);
}

/**
 * Verify an upto Permit2 payload.
 *
 * Checks:
 * 1. Scheme is "upto"
 * 2. Spender is the upto proxy address
 * 3. Recipient (witness.to) matches requirements.payTo
 * 4. Deadline not expired
 * 5. validAfter is in the past
 * 6. Authorized amount >= requirements.maxAmount (ceiling covers server max)
 * 7. EIP-712 signature is valid
 * 8. Payer has approved Permit2 for the token
 * 9. Payer has sufficient token balance
 */
export async function verifyUpto(
  signer: FacilitatorSigner,
  payload: UptoPermit2Payload,
  requirements: UptoPaymentRequirements,
): Promise<VerifyResult> {
  const { permit2Authorization, signature } = payload;
  const now = Math.floor(Date.now() / 1000);

  // Check spender
  if (
    permit2Authorization.spender.toLowerCase() !==
    X402_UPTO_PERMIT2_PROXY_ADDRESS.toLowerCase()
  ) {
    return { isValid: false, invalidReason: "invalid_spender" };
  }

  // Check recipient
  if (
    permit2Authorization.witness.to.toLowerCase() !==
    requirements.payTo.toLowerCase()
  ) {
    return { isValid: false, invalidReason: "invalid_recipient" };
  }

  // Check deadline
  if (parseInt(permit2Authorization.deadline) <= now) {
    return { isValid: false, invalidReason: "permit2_deadline_expired" };
  }

  // Check validAfter
  if (parseInt(permit2Authorization.witness.validAfter) > now) {
    return { isValid: false, invalidReason: "permit2_not_yet_valid" };
  }

  // Check authorized amount covers the server's max
  if (
    BigInt(permit2Authorization.permitted.amount) <
    BigInt(requirements.maxAmount)
  ) {
    return { isValid: false, invalidReason: "insufficient_authorized_amount" };
  }

  // Verify EIP-712 signature
  const chainId = parseChainId(requirements.network);
  const domain = { ...PERMIT2_DOMAIN, chainId };

  const message = {
    permitted: {
      token: permit2Authorization.permitted.token,
      amount: BigInt(permit2Authorization.permitted.amount),
    },
    spender: permit2Authorization.spender,
    nonce: BigInt(permit2Authorization.nonce),
    deadline: BigInt(permit2Authorization.deadline),
    witness: {
      to: permit2Authorization.witness.to,
      validAfter: BigInt(permit2Authorization.witness.validAfter),
      extra: permit2Authorization.witness.extra,
    },
  };

  try {
    const isValidSig = await signer.verifyTypedData({
      address: permit2Authorization.from,
      domain,
      types: WITNESS_TYPES,
      primaryType: "PermitWitnessTransferFrom",
      message: message as unknown as Record<string, unknown>,
      signature,
    });

    if (!isValidSig) {
      return { isValid: false, invalidReason: "invalid_permit2_signature" };
    }
  } catch {
    return { isValid: false, invalidReason: "signature_verification_failed" };
  }

  // Check Permit2 allowance
  try {
    const allowance = (await signer.readContract({
      address: permit2Authorization.permitted.token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [permit2Authorization.from, PERMIT2_ADDRESS],
    })) as bigint;

    if (allowance < BigInt(permit2Authorization.permitted.amount)) {
      return { isValid: false, invalidReason: "permit2_allowance_required" };
    }
  } catch {
    return { isValid: false, invalidReason: "allowance_check_failed" };
  }

  // Check token balance
  try {
    const balance = (await signer.readContract({
      address: permit2Authorization.permitted.token,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [permit2Authorization.from],
    })) as bigint;

    if (balance < BigInt(permit2Authorization.permitted.amount)) {
      return { isValid: false, invalidReason: "insufficient_balance" };
    }
  } catch {
    return { isValid: false, invalidReason: "balance_check_failed" };
  }

  return { isValid: true, payer: permit2Authorization.from };
}

/**
 * Settle an upto payment on-chain.
 *
 * Calls the upto proxy's settle() with the metered amount.
 * The proxy enforces: settlementAmount <= permit.permitted.amount.
 */
export async function settleUpto(
  signer: FacilitatorSigner,
  payload: UptoPermit2Payload,
  requirements: UptoPaymentRequirements,
): Promise<SettleResult> {
  const { permit2Authorization, signature } = payload;

  // Determine settlement amount: use metered amount, or fall back to max
  const settlementAmount =
    payload.settlementAmount ?? permit2Authorization.permitted.amount;

  // Validate settlement amount doesn't exceed authorization
  if (BigInt(settlementAmount) > BigInt(permit2Authorization.permitted.amount)) {
    return {
      success: false,
      error: "settlement_exceeds_authorization",
    };
  }

  // Skip settlement if amount is zero
  if (BigInt(settlementAmount) === BigInt(0)) {
    return {
      success: true,
      settledAmount: "0",
    };
  }

  // Re-verify before settlement
  const verification = await verifyUpto(signer, payload, requirements);
  if (!verification.isValid) {
    return { success: false, error: verification.invalidReason };
  }

  try {
    const txHash = await signer.writeContract({
      address: X402_UPTO_PERMIT2_PROXY_ADDRESS,
      abi: X402_UPTO_PROXY_ABI,
      functionName: "settle",
      args: [
        {
          permitted: {
            token: permit2Authorization.permitted.token,
            amount: BigInt(permit2Authorization.permitted.amount),
          },
          nonce: BigInt(permit2Authorization.nonce),
          deadline: BigInt(permit2Authorization.deadline),
        },
        BigInt(settlementAmount),
        permit2Authorization.from,
        {
          to: permit2Authorization.witness.to,
          validAfter: BigInt(permit2Authorization.witness.validAfter),
          extra: permit2Authorization.witness.extra,
        },
        signature,
      ],
    });

    const receipt = await signer.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status === "reverted") {
      return { success: false, error: "transaction_reverted", txHash };
    }

    return {
      success: true,
      txHash: receipt.transactionHash,
      settledAmount: settlementAmount,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "settlement_failed",
    };
  }
}
