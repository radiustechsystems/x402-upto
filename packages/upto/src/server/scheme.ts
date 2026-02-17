/**
 * Server-side upto EVM scheme.
 *
 * Handles price parsing and payment requirements generation for
 * route configuration.
 */

import { USDC_ADDRESSES, USDC_DECIMALS } from "../constants.js";
import type { UptoPaymentRequirements } from "../types.js";

/** Parse a dollar amount string (e.g. "$1.00") to token units. */
export function parseUsdcAmount(price: string): string {
  const cleaned = price.replace(/[$,]/g, "");
  const amount = parseFloat(cleaned);
  if (isNaN(amount) || amount < 0) {
    throw new Error(`Invalid price: ${price}`);
  }
  return Math.round(amount * 10 ** USDC_DECIMALS).toString();
}

/** Convert token units back to a dollar string. */
export function formatUsdcAmount(units: string): string {
  const amount = Number(BigInt(units)) / 10 ** USDC_DECIMALS;
  return `$${amount.toFixed(2)}`;
}

export type UptoRouteConfig = {
  maxPrice: string; // e.g. "$1.00"
  network: string; // e.g. "eip155:84532"
  payTo: `0x${string}`;
  asset?: `0x${string}`; // Defaults to USDC for network
  maxTimeoutSeconds?: number;
};

export class UptoEvmServerScheme {
  /** Build payment requirements from route config. */
  buildRequirements(config: UptoRouteConfig): UptoPaymentRequirements {
    const asset = config.asset ?? USDC_ADDRESSES[config.network];
    if (!asset) {
      throw new Error(
        `No default token for network ${config.network}. Provide asset explicitly.`,
      );
    }

    return {
      scheme: "upto",
      network: config.network,
      asset,
      maxAmount: parseUsdcAmount(config.maxPrice),
      payTo: config.payTo,
      maxTimeoutSeconds: config.maxTimeoutSeconds ?? 300,
    };
  }
}
