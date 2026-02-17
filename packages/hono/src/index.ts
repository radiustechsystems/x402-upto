/**
 * Hono middleware for x402 upto (metered billing) payments.
 *
 * Flow:
 * 1. Request arrives at a protected route
 * 2. If no payment header → return 402 with payment requirements
 * 3. If payment header present → verify with facilitator
 * 4. If verified → execute route handler → meter usage → settle
 * 5. Return response with settlement headers
 */

import type { Context, MiddlewareHandler } from "hono";
import type {
  MeterFunction,
  UptoPaymentRequirements,
  UptoPermit2Payload,
} from "@radius/x402-upto";
import { parseUsdcAmount } from "@radius/x402-upto/server";

export type UptoRouteDefinition = {
  maxPrice: string; // e.g. "$1.00"
  network: string; // e.g. "eip155:84532"
  payTo: `0x${string}`;
  asset?: `0x${string}`;
  maxTimeoutSeconds?: number;
  meter: MeterFunction;
  description?: string;
  mimeType?: string;
};

export type UptoRoutes = Record<string, UptoRouteDefinition>;

/**
 * Creates Hono middleware that gates routes behind x402 upto payments.
 *
 * @param routes - Map of "METHOD /path" to route payment config
 * @param facilitatorUrl - URL of the facilitator server
 */
export function uptoPaymentMiddleware(
  routes: UptoRoutes,
  facilitatorUrl: string,
): MiddlewareHandler {
  return async (c: Context, next) => {
    // Match route
    const method = c.req.method;
    const path = new URL(c.req.url).pathname;
    const routeKey = `${method} ${path}`;
    const routeConfig = routes[routeKey];

    if (!routeConfig) {
      return next();
    }

    // Build payment requirements
    const requirements: UptoPaymentRequirements = {
      scheme: "upto",
      network: routeConfig.network,
      asset: routeConfig.asset ?? ("0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`),
      maxAmount: parseUsdcAmount(routeConfig.maxPrice),
      payTo: routeConfig.payTo,
      maxTimeoutSeconds: routeConfig.maxTimeoutSeconds ?? 300,
    };

    // Check for payment header
    const paymentHeader =
      c.req.header("X-Payment") ?? c.req.header("Payment-Signature");

    if (!paymentHeader) {
      // Return 402 with requirements
      return c.json(
        {
          error: "Payment Required",
          accepts: [requirements],
          ...(routeConfig.description && { description: routeConfig.description }),
          ...(routeConfig.mimeType && { mimeType: routeConfig.mimeType }),
        },
        402,
      );
    }

    // Decode payment payload
    let payload: UptoPermit2Payload;
    try {
      const decoded = atob(paymentHeader);
      payload = JSON.parse(decoded);
    } catch {
      return c.json({ error: "Invalid payment payload" }, 400);
    }

    // Verify with facilitator
    let verifyResponse: Response;
    try {
      verifyResponse = await fetch(`${facilitatorUrl}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload, requirements }),
      });
    } catch {
      return c.json({ error: "Facilitator unavailable" }, 503);
    }

    const verification = (await verifyResponse.json()) as {
      isValid: boolean;
      invalidReason?: string;
      payer?: string;
    };

    if (!verification.isValid) {
      const status = verification.invalidReason === "permit2_allowance_required" ? 412 : 402;
      return c.json(
        {
          error: "Payment verification failed",
          reason: verification.invalidReason,
          accepts: [requirements],
        },
        status,
      );
    }

    // Execute the route handler
    await next();

    // Meter the actual usage
    const consumedAmount = await routeConfig.meter({
      request: c.req.raw,
      response: c.res,
      authorizedAmount: payload.permit2Authorization.permitted.amount,
      payer: verification.payer as `0x${string}`,
    });

    // Set settlement amount on payload
    payload.settlementAmount = consumedAmount;

    // Settle with facilitator
    try {
      const settleResponse = await fetch(`${facilitatorUrl}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload, requirements }),
      });

      const settlement = (await settleResponse.json()) as {
        success: boolean;
        txHash?: string;
        settledAmount?: string;
        error?: string;
      };

      if (settlement.success) {
        // Add settlement info to response headers
        c.header("X-Payment-Response", btoa(JSON.stringify({
          success: true,
          txHash: settlement.txHash,
          settledAmount: settlement.settledAmount,
          authorizedAmount: payload.permit2Authorization.permitted.amount,
        })));
        c.header("X-Payment-Settled", settlement.settledAmount ?? consumedAmount);
        c.header("X-Payment-TxHash", settlement.txHash ?? "");
      }
    } catch {
      // Settlement failure shouldn't block the response — log and continue.
      // In production, use a retry queue.
      console.error("Settlement failed — response already delivered to client");
    }
  };
}
