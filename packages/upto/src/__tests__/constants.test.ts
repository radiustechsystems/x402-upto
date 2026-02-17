import { describe, it, expect } from "vitest";
import {
  PERMIT2_ADDRESS,
  X402_UPTO_PERMIT2_PROXY_ADDRESS,
  X402_EXACT_PERMIT2_PROXY_ADDRESS,
  X402_UPTO_PROXY_ABI,
  WITNESS_TYPES,
  USDC_ADDRESSES,
  USDC_DECIMALS,
} from "../constants.js";

describe("constants", () => {
  it("Permit2 address is the canonical Uniswap address", () => {
    expect(PERMIT2_ADDRESS).toBe("0x000000000022D473030F116dDEE9F6B43aC78BA3");
  });

  it("upto proxy address ends in 0002", () => {
    expect(X402_UPTO_PERMIT2_PROXY_ADDRESS).toMatch(/0002$/);
  });

  it("exact proxy address ends in 0001", () => {
    expect(X402_EXACT_PERMIT2_PROXY_ADDRESS).toMatch(/0001$/);
  });

  it("upto and exact proxy addresses differ", () => {
    expect(X402_UPTO_PERMIT2_PROXY_ADDRESS).not.toBe(X402_EXACT_PERMIT2_PROXY_ADDRESS);
  });

  it("upto proxy ABI has settle function with amount parameter", () => {
    const settle = X402_UPTO_PROXY_ABI[0];
    expect(settle.name).toBe("settle");

    const inputNames = settle.inputs.map((i) => i.name);
    expect(inputNames).toContain("amount");
    expect(inputNames).toContain("permit");
    expect(inputNames).toContain("owner");
    expect(inputNames).toContain("witness");
    expect(inputNames).toContain("signature");
  });

  it("WITNESS_TYPES has all required EIP-712 types", () => {
    expect(WITNESS_TYPES).toHaveProperty("TokenPermissions");
    expect(WITNESS_TYPES).toHaveProperty("PermitWitnessTransferFrom");
    expect(WITNESS_TYPES).toHaveProperty("x402Witness");
  });

  it("USDC addresses are defined for Base mainnet and Sepolia", () => {
    expect(USDC_ADDRESSES["eip155:8453"]).toBeDefined();
    expect(USDC_ADDRESSES["eip155:84532"]).toBeDefined();
  });

  it("USDC has 6 decimals", () => {
    expect(USDC_DECIMALS).toBe(6);
  });
});
