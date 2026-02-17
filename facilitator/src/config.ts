/**
 * Facilitator server configuration from environment variables.
 */

export type FacilitatorConfig = {
  privateKey: `0x${string}`;
  rpcUrl: string;
  network: string;
  port: number;
};

export function loadConfig(): FacilitatorConfig {
  const privateKey = process.env.FACILITATOR_PRIVATE_KEY;
  if (!privateKey?.startsWith("0x")) {
    throw new Error("FACILITATOR_PRIVATE_KEY must be set (0x-prefixed hex)");
  }

  return {
    privateKey: privateKey as `0x${string}`,
    rpcUrl: process.env.RPC_URL ?? "https://sepolia.base.org",
    network: process.env.NETWORK ?? "eip155:84532",
    port: parseInt(process.env.PORT ?? "4402", 10),
  };
}
