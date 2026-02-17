/**
 * Contract addresses and ABIs for x402 upto scheme.
 */

/** Uniswap Permit2 — canonical address on all EVM chains via CREATE2. */
export const PERMIT2_ADDRESS =
  "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

/** x402 upto proxy — settles metered amounts via Permit2. */
export const X402_UPTO_PERMIT2_PROXY_ADDRESS =
  "0x4020633461b2895a48930Ff97eE8fCdE8E520002" as const;

/** x402 exact proxy — for reference. */
export const X402_EXACT_PERMIT2_PROXY_ADDRESS =
  "0x4020615294c913F045dc10f0a5cdEbd86c280001" as const;

/** EIP-712 domain for Permit2 signing. */
export const PERMIT2_DOMAIN = {
  name: "Permit2",
  chainId: 0, // Set at runtime
  verifyingContract: PERMIT2_ADDRESS,
} as const;

/** Witness type used in PermitWitnessTransferFrom. */
export const WITNESS_TYPES = {
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  PermitWitnessTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "witness", type: "x402Witness" },
  ],
  x402Witness: [
    { name: "to", type: "address" },
    { name: "validAfter", type: "uint256" },
    { name: "extra", type: "bytes" },
  ],
};

/**
 * ABI for the x402 upto Permit2 proxy contract.
 *
 * Key difference from exact: settle() accepts a separate `amount` parameter
 * that can be less than or equal to the signed permitted.amount.
 */
export const X402_UPTO_PROXY_ABI = [
  {
    type: "function",
    name: "settle",
    inputs: [
      {
        name: "permit",
        type: "tuple",
        components: [
          {
            name: "permitted",
            type: "tuple",
            components: [
              { name: "token", type: "address" },
              { name: "amount", type: "uint256" },
            ],
          },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      { name: "amount", type: "uint256" }, // Settlement amount <= permitted.amount
      { name: "owner", type: "address" },
      {
        name: "witness",
        type: "tuple",
        components: [
          { name: "to", type: "address" },
          { name: "validAfter", type: "uint256" },
          { name: "extra", type: "bytes" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

/** ERC-20 ABI subset for balance and allowance checks. */
export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

/** Known USDC addresses by CAIP-2 network ID. */
export const USDC_ADDRESSES: Record<string, `0x${string}`> = {
  "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base mainnet
  "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
};

/** Default token decimals. */
export const USDC_DECIMALS = 6;
