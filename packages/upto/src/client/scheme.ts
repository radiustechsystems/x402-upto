/**
 * Client-side upto EVM scheme.
 *
 * Provides a clean interface for wallet-connected clients to create
 * metered billing authorizations.
 */

import type { ClientSigner, UptoPaymentRequirements, UptoPermit2Payload } from "../types.js";
import { createUptoPermit2Payload, createPermit2ApprovalTx } from "./permit2.js";

export class UptoEvmClientScheme {
  private signer: ClientSigner;

  constructor(signer: ClientSigner) {
    this.signer = signer;
  }

  /** Create a signed payment payload authorizing up to the max amount. */
  async createPaymentPayload(
    requirements: UptoPaymentRequirements,
  ): Promise<UptoPermit2Payload> {
    return createUptoPermit2Payload(this.signer, requirements);
  }

  /** Build approval tx for Permit2 (one-time per token). */
  getApprovalTx(tokenAddress: `0x${string}`) {
    return createPermit2ApprovalTx(tokenAddress);
  }

  /** The connected wallet address. */
  get address(): `0x${string}` {
    return this.signer.address;
  }
}
