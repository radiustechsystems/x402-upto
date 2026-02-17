import { describe, it, expect } from "vitest";
import type {
  UptoPermit2Payload,
  UptoPaymentRequirements,
  MeterFunction,
} from "../types.js";

describe("types", () => {
  it("UptoPermit2Payload should have optional settlementAmount", () => {
    const payload: UptoPermit2Payload = {
      signature: "0xabc",
      permit2Authorization: {
        from: "0x1234567890abcdef1234567890abcdef12345678",
        permitted: {
          token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          amount: "1000000",
        },
        spender: "0x4020633461b2895a48930Ff97eE8fCdE8E520002",
        nonce: "12345",
        deadline: "9999999999",
        witness: {
          to: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
          validAfter: "0",
          extra: "0x",
        },
      },
    };

    expect(payload.settlementAmount).toBeUndefined();

    payload.settlementAmount = "43700";
    expect(payload.settlementAmount).toBe("43700");
  });

  it("UptoPaymentRequirements should use upto scheme", () => {
    const requirements: UptoPaymentRequirements = {
      scheme: "upto",
      network: "eip155:84532",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      maxAmount: "1000000",
      payTo: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      maxTimeoutSeconds: 300,
    };

    expect(requirements.scheme).toBe("upto");
  });

  it("MeterFunction should accept request context and return amount", async () => {
    const meter: MeterFunction = async ({ authorizedAmount }) => {
      const consumed = BigInt(authorizedAmount) / BigInt(10);
      return consumed.toString();
    };

    const result = await meter({
      request: new Request("http://localhost"),
      response: new Response("test"),
      authorizedAmount: "1000000",
      payer: "0x1234567890abcdef1234567890abcdef12345678",
    });

    expect(result).toBe("100000");
  });
});
