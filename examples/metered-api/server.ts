/**
 * Demo: Metered LLM API server using x402 upto.
 *
 * Simulates a pay-per-token API endpoint. Clients authorize up to $1.00,
 * but pay only for the tokens they actually consume.
 *
 * Usage:
 *   MERCHANT_ADDRESS=0x... tsx server.ts
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { uptoPaymentMiddleware } from "@radius/x402-upto-hono";
import { parseUsdcAmount, USDC_DECIMALS } from "@radius/x402-upto";

const PRICE_PER_TOKEN = 0.0001; // $0.0001 per token
const FACILITATOR_URL = process.env.FACILITATOR_URL ?? "http://localhost:4402";
const MERCHANT_ADDRESS =
  (process.env.MERCHANT_ADDRESS as `0x${string}`) ??
  "0x0000000000000000000000000000000000000001";
const PORT = parseInt(process.env.PORT ?? "3000", 10);

const app = new Hono();

// Simulated LLM responses
const responses: Record<string, string> = {
  "What is x402?":
    "x402 is an open protocol for HTTP-native payments. It extends the HTTP 402 Payment Required status code to enable servers to gate access behind cryptographic payments. Built on Permit2 for gasless, non-custodial token transfers on EVM chains.",
  "Explain metered billing":
    "Metered billing charges users based on actual consumption rather than a flat rate. In x402 upto, the client signs a maximum authorization amount, the server processes the request and meters usage, and the facilitator settles only the consumed amount on-chain. This means if you authorize $1.00 but only use $0.04 worth of tokens, you only pay $0.04.",
  default:
    "I am a demo LLM endpoint powered by x402 upto metered billing. Each response token costs $0.0001 USDC. You authorized a maximum spend, but you only pay for what you consume. Try asking about x402 or metered billing!",
};

// Count tokens (simplified: split on whitespace)
function countTokens(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// Register upto payment middleware
app.use(
  "*",
  uptoPaymentMiddleware(
    {
      "POST /v1/chat/completions": {
        maxPrice: "$1.00",
        network: "eip155:84532",
        payTo: MERCHANT_ADDRESS,
        maxTimeoutSeconds: 300,
        description: "Metered LLM completions — pay per token consumed",
        mimeType: "application/json",
        meter: async ({ response }) => {
          // Read the response body to count tokens
          // In production this would integrate with the actual LLM usage tracking
          const body = await response.clone().json().catch(() => null) as {
            content?: string;
            usage?: { completion_tokens: number };
          } | null;
          const tokens = body?.usage?.completion_tokens ?? 0;
          const cost = tokens * PRICE_PER_TOKEN;
          return Math.round(cost * 10 ** USDC_DECIMALS).toString();
        },
      },
    },
    FACILITATOR_URL,
  ),
);

// The actual completions endpoint
app.post("/v1/chat/completions", async (c) => {
  const body = await c.req.json<{
    messages?: Array<{ role: string; content: string }>;
  }>();

  const lastMessage = body.messages?.at(-1)?.content ?? "";
  const responseText =
    responses[lastMessage] ?? responses.default;
  const tokens = countTokens(responseText);
  const cost = tokens * PRICE_PER_TOKEN;

  return c.json({
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    model: "x402-upto-demo",
    content: responseText,
    usage: {
      prompt_tokens: countTokens(lastMessage),
      completion_tokens: tokens,
      total_tokens: countTokens(lastMessage) + tokens,
    },
    metering: {
      tokens_consumed: tokens,
      price_per_token: `$${PRICE_PER_TOKEN}`,
      total_cost: `$${cost.toFixed(4)}`,
      total_cost_units: Math.round(cost * 10 ** USDC_DECIMALS).toString(),
    },
  });
});

// Health check
app.get("/", (c) =>
  c.json({
    service: "x402-upto-metered-api-demo",
    pricing: `$${PRICE_PER_TOKEN}/token`,
    facilitator: FACILITATOR_URL,
    merchant: MERCHANT_ADDRESS,
  }),
);

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Metered LLM API running on port ${PORT}`);
  console.log(`  Pricing: $${PRICE_PER_TOKEN}/token`);
  console.log(`  Facilitator: ${FACILITATOR_URL}`);
  console.log(`  Merchant: ${MERCHANT_ADDRESS}`);
  console.log();
  console.log("Try: POST /v1/chat/completions");
  console.log('  Without payment → 402 with payment requirements');
  console.log('  With X-Payment header → metered response');
});
