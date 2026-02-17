# x402-upto: Metered Billing for x402

The first public implementation of the x402 `upto` payment scheme. Clients authorize a **maximum** spend; servers **meter** actual usage; facilitators settle **only what was consumed** on-chain.

Built by [Radius Technology Systems](https://radiustech.xyz) for the [x402 protocol](https://github.com/coinbase/x402).

## How It Works

```
Client                    Server                    Facilitator          Chain
  │                         │                           │                  │
  │ Signs max: "$1.00"      │                           │                  │
  ├────────────────────────>│                           │                  │
  │                         │ Verify authorization      │                  │
  │                         ├──────────────────────────>│                  │
  │                         │        ✓ Valid            │                  │
  │                         │<──────────────────────────┤                  │
  │                         │                           │                  │
  │                         │ Process request           │                  │
  │                         │ Meter: 437 tokens=$0.043  │                  │
  │                         │                           │                  │
  │                         │ Settle $0.043 (not $1.00) │                  │
  │                         ├──────────────────────────>│                  │
  │                         │                           │ Transfer $0.043  │
  │                         │                           ├─────────────────>│
  │  Response + receipt     │                           │                  │
  │<────────────────────────┤                           │                  │
```

The client authorized $1.00. The server used $0.043. Only $0.043 moved on-chain.

## Packages

| Package | Description |
|---------|-------------|
| `@radius/x402-upto` | Core SDK — types, client signing, facilitator verify/settle, server pricing |
| `@radius/x402-upto-hono` | Hono middleware with metering support |
| `facilitator/` | Standalone facilitator server (Express + SQLite audit log) |
| `examples/metered-api/` | End-to-end demo: metered LLM API |

## Quick Start

### Install

```bash
pnpm install
pnpm build
```

### Run the Demo

**1. Start the facilitator** (settles payments on-chain):

```bash
cd facilitator
FACILITATOR_PRIVATE_KEY=0x... pnpm dev
```

**2. Start the demo server** (metered LLM API):

```bash
cd examples/metered-api
MERCHANT_ADDRESS=0x... pnpm server
```

**3. Run the demo client** (signs max auth, makes request):

```bash
cd examples/metered-api
PRIVATE_KEY=0x... pnpm client
```

Output:

```
Authorized: $1.00
Consumed: 437 tokens = $0.043
Settled: $0.043 (tx: 0x...)
```

## Usage

### Client: Sign a Max Authorization

```typescript
import { createUptoPermit2Payload } from "@radius/x402-upto/client";

const payload = await createUptoPermit2Payload(signer, {
  scheme: "upto",
  network: "eip155:84532",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  maxAmount: "1000000", // $1.00 USDC
  payTo: "0xMerchant...",
  maxTimeoutSeconds: 300,
});

// Send with request
fetch(url, {
  headers: { "X-Payment": btoa(JSON.stringify(payload)) },
});
```

### Server: Add Metered Billing to Routes

```typescript
import { Hono } from "hono";
import { uptoPaymentMiddleware } from "@radius/x402-upto-hono";

const app = new Hono();

app.use("*", uptoPaymentMiddleware({
  "POST /v1/completions": {
    maxPrice: "$1.00",
    network: "eip155:84532",
    payTo: "0xMerchant...",
    meter: async ({ response }) => {
      const body = await response.clone().json();
      const tokens = body.usage.completion_tokens;
      return Math.round(tokens * 0.0001 * 1e6).toString();
    },
  },
}, "http://localhost:4402"));
```

### Facilitator: Verify & Settle

```typescript
import { verifyUpto, settleUpto } from "@radius/x402-upto/facilitator";

// Verify authorization
const result = await verifyUpto(signer, payload, requirements);
// { isValid: true, payer: "0x..." }

// After metering, set settlement amount
payload.settlementAmount = "43700"; // $0.0437

// Settle on-chain (transfers only $0.0437)
const settlement = await settleUpto(signer, payload, requirements);
// { success: true, txHash: "0x...", settledAmount: "43700" }
```

## Architecture

### Key Difference from `exact`

In the standard x402 `exact` scheme, the full authorized amount transfers on settlement. In `upto`:

1. The **proxy contract** accepts a separate `amount` parameter: `settle(permit, amount, owner, witness, signature)`
2. The proxy enforces `amount <= permit.permitted.amount`
3. Only `amount` (the metered consumption) transfers to the recipient

### Settlement Amount Flow

The server injects `settlementAmount` into the payment payload after metering, before calling settle. No new facilitator endpoints needed — the standard verify/settle interface works unchanged.

### Contract Addresses

| Contract | Address |
|----------|---------|
| Permit2 (Uniswap) | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| x402 Upto Proxy | `0x4020633461b2895a48930Ff97eE8fCdE8E520002` |
| x402 Exact Proxy | `0x4020615294c913F045dc10f0a5cdEbd86c280001` |

## Development

```bash
pnpm install        # Install dependencies
pnpm build          # Build all packages
pnpm test           # Run tests (41 tests)
```

## License

MIT

## About Radius

[Radius Technology Systems](https://radiustech.xyz) builds micropayment infrastructure. We believe metered billing is the future of API monetization — pay for what you use, settle only what you consume.
