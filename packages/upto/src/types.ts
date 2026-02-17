/**
 * x402 upto scheme types.
 *
 * The upto scheme extends Permit2 authorization with metered billing:
 * the client signs a MAX amount, and the facilitator settles only what
 * the server actually consumed.
 */

/** Permit2 witness struct binding the payment to a specific recipient. */
export type Permit2Witness = {
  to: `0x${string}`;
  validAfter: string;
  extra: `0x${string}`;
};

/** Permit2 authorization signed by the payer. amount = MAX authorized. */
export type Permit2Authorization = {
  from: `0x${string}`;
  permitted: {
    token: `0x${string}`;
    amount: string; // MAX ceiling in smallest token units
  };
  spender: `0x${string}`; // x402UptoPermit2ProxyAddress
  nonce: string;
  deadline: string;
  witness: Permit2Witness;
};

/**
 * The payload sent from client → server → facilitator.
 *
 * `settlementAmount` starts undefined. The server sets it after metering
 * actual usage, before forwarding to the facilitator for settlement.
 */
export type UptoPermit2Payload = {
  signature: `0x${string}`;
  permit2Authorization: Permit2Authorization;
  /** Set by server after metering. Must be <= permitted.amount. */
  settlementAmount?: string;
};

/**
 * Developer-provided function that computes consumed amount after
 * the route handler executes.
 */
export type MeterFunction = (ctx: {
  request: Request;
  response: Response;
  authorizedAmount: string;
  payer: `0x${string}`;
}) => Promise<string> | string;

/** Payment requirements advertised in 402 responses. */
export type UptoPaymentRequirements = {
  scheme: "upto";
  network: string; // CAIP-2, e.g. "eip155:84532"
  asset: `0x${string}`;
  maxAmount: string; // Maximum the server will ever charge per request
  payTo: `0x${string}`;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
};

/** Verification result from the facilitator. */
export type VerifyResult = {
  isValid: boolean;
  invalidReason?: string;
  payer?: `0x${string}`;
};

/** Settlement result from the facilitator. */
export type SettleResult = {
  success: boolean;
  txHash?: `0x${string}`;
  settledAmount?: string;
  error?: string;
};

/** Wallet signer interface for client-side Permit2 signing. */
export type ClientSigner = {
  address: `0x${string}`;
  signTypedData: (params: {
    domain: Record<string, unknown>;
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  }) => Promise<`0x${string}`>;
};

/** Chain-connected signer for facilitator operations. */
export type FacilitatorSigner = {
  readContract: (params: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
  }) => Promise<unknown>;
  verifyTypedData: (params: {
    address: `0x${string}`;
    domain: Record<string, unknown>;
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
    signature: `0x${string}`;
  }) => Promise<boolean>;
  writeContract: (params: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
  }) => Promise<`0x${string}`>;
  waitForTransactionReceipt: (params: {
    hash: `0x${string}`;
  }) => Promise<{ status: "success" | "reverted"; transactionHash: `0x${string}` }>;
};
