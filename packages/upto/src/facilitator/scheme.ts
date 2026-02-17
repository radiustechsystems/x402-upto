/**
 * Facilitator-side upto EVM scheme.
 *
 * Wraps verify and settle into a clean class interface.
 */

import type {
  FacilitatorSigner,
  UptoPaymentRequirements,
  UptoPermit2Payload,
  VerifyResult,
  SettleResult,
} from "../types.js";
import { verifyUpto, settleUpto } from "./permit2.js";

export class UptoEvmFacilitatorScheme {
  private signer: FacilitatorSigner;

  constructor(signer: FacilitatorSigner) {
    this.signer = signer;
  }

  async verify(
    payload: UptoPermit2Payload,
    requirements: UptoPaymentRequirements,
  ): Promise<VerifyResult> {
    return verifyUpto(this.signer, payload, requirements);
  }

  async settle(
    payload: UptoPermit2Payload,
    requirements: UptoPaymentRequirements,
  ): Promise<SettleResult> {
    return settleUpto(this.signer, payload, requirements);
  }
}
