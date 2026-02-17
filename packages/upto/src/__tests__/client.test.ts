import { describe, it, expect, vi } from "vitest";
import { createUptoPermit2Payload, createPermit2ApprovalTx } from "../client/permit2.js";
import { X402_UPTO_PERMIT2_PROXY_ADDRESS, PERMIT2_ADDRESS } from "../constants.js";
import type { ClientSigner, UptoPaymentRequirements } from "../types.js";

const mockSigner: ClientSigner = {
  address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  signTypedData: vi.fn().mockResolvedValue("0xmocksignature" as `0x${string}`),
};

const requirements: UptoPaymentRequirements = {
  scheme: "upto",
  network: "eip155:84532",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  maxAmount: "1000000", // $1.00 USDC
  payTo: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  maxTimeoutSeconds: 300,
};

describe("createUptoPermit2Payload", () => {
  it("creates a valid payload with correct structure", async () => {
    const payload = await createUptoPermit2Payload(mockSigner, requirements);

    expect(payload.signature).toBe("0xmocksignature");
    expect(payload.permit2Authorization.from).toBe(mockSigner.address);
    expect(payload.permit2Authorization.permitted.token).toBe(requirements.asset);
    expect(payload.permit2Authorization.permitted.amount).toBe(requirements.maxAmount);
    expect(payload.permit2Authorization.spender).toBe(X402_UPTO_PERMIT2_PROXY_ADDRESS);
    expect(payload.permit2Authorization.witness.to).toBe(requirements.payTo);
    expect(payload.settlementAmount).toBeUndefined();
  });

  it("signs with the correct EIP-712 types", async () => {
    await createUptoPermit2Payload(mockSigner, requirements);

    expect(mockSigner.signTypedData).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryType: "PermitWitnessTransferFrom",
        types: expect.objectContaining({
          TokenPermissions: expect.any(Array),
          PermitWitnessTransferFrom: expect.any(Array),
          x402Witness: expect.any(Array),
        }),
        domain: expect.objectContaining({
          name: "Permit2",
          chainId: 84532,
        }),
      }),
    );
  });

  it("sets deadline based on maxTimeoutSeconds", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = await createUptoPermit2Payload(mockSigner, requirements);

    const deadline = parseInt(payload.permit2Authorization.deadline);
    expect(deadline).toBeGreaterThan(now);
    expect(deadline).toBeLessThanOrEqual(now + requirements.maxTimeoutSeconds + 1);
  });

  it("sets validAfter slightly in the past", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = await createUptoPermit2Payload(mockSigner, requirements);

    const validAfter = parseInt(payload.permit2Authorization.witness.validAfter);
    expect(validAfter).toBeLessThan(now);
    expect(validAfter).toBeGreaterThan(now - 120);
  });

  it("rejects unsupported network format", async () => {
    const badRequirements = { ...requirements, network: "solana:mainnet" };
    await expect(createUptoPermit2Payload(mockSigner, badRequirements)).rejects.toThrow(
      "Unsupported network format",
    );
  });
});

describe("createPermit2ApprovalTx", () => {
  it("creates an approval transaction to Permit2", () => {
    const tx = createPermit2ApprovalTx(requirements.asset);

    expect(tx.to).toBe(requirements.asset);
    // approve(address,uint256) selector
    expect(tx.data).toMatch(/^0x095ea7b3/);
    // Should contain Permit2 address (lowercase, no 0x prefix)
    expect(tx.data.toLowerCase()).toContain(
      PERMIT2_ADDRESS.slice(2).toLowerCase(),
    );
  });
});
