import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyUpto, settleUpto } from "../facilitator/permit2.js";
import { X402_UPTO_PERMIT2_PROXY_ADDRESS } from "../constants.js";
import type {
  FacilitatorSigner,
  UptoPaymentRequirements,
  UptoPermit2Payload,
} from "../types.js";

const requirements: UptoPaymentRequirements = {
  scheme: "upto",
  network: "eip155:84532",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  maxAmount: "1000000",
  payTo: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  maxTimeoutSeconds: 300,
};

function makePayload(overrides?: Partial<UptoPermit2Payload["permit2Authorization"]>): UptoPermit2Payload {
  const now = Math.floor(Date.now() / 1000);
  return {
    signature: "0xvalidsignature",
    permit2Authorization: {
      from: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      permitted: {
        token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        amount: "1000000",
      },
      spender: X402_UPTO_PERMIT2_PROXY_ADDRESS,
      nonce: "12345",
      deadline: (now + 600).toString(),
      witness: {
        to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        validAfter: (now - 60).toString(),
        extra: "0x",
      },
      ...overrides,
    },
  };
}

function makeSigner(overrides?: Partial<FacilitatorSigner>): FacilitatorSigner {
  return {
    readContract: vi.fn().mockResolvedValue(BigInt("10000000000")),
    verifyTypedData: vi.fn().mockResolvedValue(true),
    writeContract: vi.fn().mockResolvedValue("0xtxhash" as `0x${string}`),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({
      status: "success" as const,
      transactionHash: "0xtxhash" as `0x${string}`,
    }),
    ...overrides,
  };
}

describe("verifyUpto", () => {
  it("returns valid for a correct payload", async () => {
    const signer = makeSigner();
    const payload = makePayload();

    const result = await verifyUpto(signer, payload, requirements);
    expect(result.isValid).toBe(true);
    expect(result.payer).toBe(payload.permit2Authorization.from);
  });

  it("rejects wrong spender", async () => {
    const signer = makeSigner();
    const payload = makePayload({ spender: "0x0000000000000000000000000000000000000001" });

    const result = await verifyUpto(signer, payload, requirements);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("invalid_spender");
  });

  it("rejects wrong recipient", async () => {
    const signer = makeSigner();
    const payload = makePayload();
    payload.permit2Authorization.witness.to = "0x0000000000000000000000000000000000000001";

    const result = await verifyUpto(signer, payload, requirements);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("invalid_recipient");
  });

  it("rejects expired deadline", async () => {
    const signer = makeSigner();
    const payload = makePayload({ deadline: "1000" });

    const result = await verifyUpto(signer, payload, requirements);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("permit2_deadline_expired");
  });

  it("rejects future validAfter", async () => {
    const signer = makeSigner();
    const payload = makePayload();
    payload.permit2Authorization.witness.validAfter = (Math.floor(Date.now() / 1000) + 9999).toString();

    const result = await verifyUpto(signer, payload, requirements);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("permit2_not_yet_valid");
  });

  it("rejects insufficient authorized amount", async () => {
    const signer = makeSigner();
    const payload = makePayload();
    payload.permit2Authorization.permitted.amount = "100"; // Way too low

    const result = await verifyUpto(signer, payload, requirements);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("insufficient_authorized_amount");
  });

  it("rejects invalid signature", async () => {
    const signer = makeSigner({ verifyTypedData: vi.fn().mockResolvedValue(false) });
    const payload = makePayload();

    const result = await verifyUpto(signer, payload, requirements);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("invalid_permit2_signature");
  });

  it("rejects insufficient Permit2 allowance", async () => {
    const signer = makeSigner({
      readContract: vi.fn()
        .mockResolvedValueOnce(BigInt("0")) // allowance = 0
        .mockResolvedValueOnce(BigInt("10000000000")),
    });
    const payload = makePayload();

    const result = await verifyUpto(signer, payload, requirements);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("permit2_allowance_required");
  });

  it("rejects insufficient balance", async () => {
    const signer = makeSigner({
      readContract: vi.fn()
        .mockResolvedValueOnce(BigInt("10000000000")) // allowance OK
        .mockResolvedValueOnce(BigInt("0")),           // balance = 0
    });
    const payload = makePayload();

    const result = await verifyUpto(signer, payload, requirements);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("insufficient_balance");
  });
});

describe("settleUpto", () => {
  it("settles with the metered settlementAmount", async () => {
    const signer = makeSigner();
    const payload = makePayload();
    payload.settlementAmount = "43700"; // $0.0437

    const result = await settleUpto(signer, payload, requirements);
    expect(result.success).toBe(true);
    expect(result.txHash).toBe("0xtxhash");
    expect(result.settledAmount).toBe("43700");
  });

  it("falls back to full amount when settlementAmount is absent", async () => {
    const signer = makeSigner();
    const payload = makePayload();

    const result = await settleUpto(signer, payload, requirements);
    expect(result.success).toBe(true);
    expect(result.settledAmount).toBe("1000000");
  });

  it("rejects settlement exceeding authorization", async () => {
    const signer = makeSigner();
    const payload = makePayload();
    payload.settlementAmount = "9999999"; // More than authorized

    const result = await settleUpto(signer, payload, requirements);
    expect(result.success).toBe(false);
    expect(result.error).toBe("settlement_exceeds_authorization");
  });

  it("skips on-chain settlement for zero amount", async () => {
    const signer = makeSigner();
    const payload = makePayload();
    payload.settlementAmount = "0";

    const result = await settleUpto(signer, payload, requirements);
    expect(result.success).toBe(true);
    expect(result.settledAmount).toBe("0");
    expect(signer.writeContract).not.toHaveBeenCalled();
  });

  it("handles transaction revert", async () => {
    const signer = makeSigner({
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        status: "reverted" as const,
        transactionHash: "0xfailedtx" as `0x${string}`,
      }),
    });
    const payload = makePayload();
    payload.settlementAmount = "43700";

    const result = await settleUpto(signer, payload, requirements);
    expect(result.success).toBe(false);
    expect(result.error).toBe("transaction_reverted");
  });
});
