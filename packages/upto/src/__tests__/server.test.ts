import { describe, it, expect } from "vitest";
import { parseUsdcAmount, formatUsdcAmount, UptoEvmServerScheme } from "../server/scheme.js";

describe("parseUsdcAmount", () => {
  it("parses dollar amounts to USDC units", () => {
    expect(parseUsdcAmount("$1.00")).toBe("1000000");
    expect(parseUsdcAmount("$0.50")).toBe("500000");
    expect(parseUsdcAmount("$0.0001")).toBe("100");
    expect(parseUsdcAmount("$0.043")).toBe("43000");
  });

  it("handles amounts without dollar sign", () => {
    expect(parseUsdcAmount("1.00")).toBe("1000000");
    expect(parseUsdcAmount("0.50")).toBe("500000");
  });

  it("handles zero", () => {
    expect(parseUsdcAmount("$0")).toBe("0");
    expect(parseUsdcAmount("0")).toBe("0");
  });

  it("handles comma-separated amounts", () => {
    expect(parseUsdcAmount("$1,000.00")).toBe("1000000000");
  });

  it("rejects invalid amounts", () => {
    expect(() => parseUsdcAmount("abc")).toThrow("Invalid price");
    expect(() => parseUsdcAmount("$-5")).toThrow("Invalid price");
  });
});

describe("formatUsdcAmount", () => {
  it("formats USDC units to dollar strings", () => {
    expect(formatUsdcAmount("1000000")).toBe("$1.00");
    expect(formatUsdcAmount("500000")).toBe("$0.50");
    expect(formatUsdcAmount("43700")).toBe("$0.04");
  });

  it("formats zero", () => {
    expect(formatUsdcAmount("0")).toBe("$0.00");
  });
});

describe("UptoEvmServerScheme", () => {
  it("builds payment requirements from route config", () => {
    const scheme = new UptoEvmServerScheme();
    const requirements = scheme.buildRequirements({
      maxPrice: "$1.00",
      network: "eip155:84532",
      payTo: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    });

    expect(requirements.scheme).toBe("upto");
    expect(requirements.maxAmount).toBe("1000000");
    expect(requirements.network).toBe("eip155:84532");
    expect(requirements.asset).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
    expect(requirements.maxTimeoutSeconds).toBe(300);
  });

  it("uses custom asset when provided", () => {
    const scheme = new UptoEvmServerScheme();
    const customAsset = "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`;
    const requirements = scheme.buildRequirements({
      maxPrice: "$1.00",
      network: "eip155:84532",
      payTo: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      asset: customAsset,
    });

    expect(requirements.asset).toBe(customAsset);
  });

  it("throws for unknown network without explicit asset", () => {
    const scheme = new UptoEvmServerScheme();
    expect(() =>
      scheme.buildRequirements({
        maxPrice: "$1.00",
        network: "eip155:99999",
        payTo: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      }),
    ).toThrow("No default token");
  });
});
