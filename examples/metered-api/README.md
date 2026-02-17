# Metered API Demo

End-to-end demo of x402 upto metered billing for an LLM-style API.

The client authorizes up to $1.00 USDC per request. The server counts response tokens, prices them at $0.0001/token, and settles only the consumed amount.

## Run

```bash
# Terminal 1: Facilitator
cd ../../facilitator
FACILITATOR_PRIVATE_KEY=0x... pnpm dev

# Terminal 2: Server
MERCHANT_ADDRESS=0x... pnpm server

# Terminal 3: Client
PRIVATE_KEY=0x... pnpm client
```

## What Happens

1. Client sends a request without payment → gets 402 with payment requirements
2. Client signs a Permit2 authorization for up to $1.00 USDC
3. Client resends with the signed authorization in the `X-Payment` header
4. Server verifies via facilitator, processes the request, meters token usage
5. Server tells facilitator to settle only the metered amount
6. Client receives the response plus settlement receipt headers
