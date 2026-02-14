# Next Implementation Guide — Scaling & Hardening

The current implementation covers a clean, testable rate-fetching flow. The following topics outline what's needed to take this system from assignment-ready to production-ready.

---

## 1. Multi-User Support with Database Storage

Currently, credentials and tokens live in-memory and are hardcoded per process. In production:

- Introduce database tables for **users**, **carrier accounts**, **credentials**, and **tokens**.
- Each user (or organization) owns one or more carrier accounts, each storing encrypted credentials and the latest OAuth token + expiry.
- Token storage moves from `UPSAuthClient`'s private fields to a persistent store (e.g., Postgres row or Redis key), looked up by user + carrier.
- This enables **multi-tenant support** — a single service instance serves multiple users, each with their own carrier credentials and token lifecycle.

**Suggested schema outline:**

```
users
├── id
├── name
└── created_at

carrier_accounts
├── id
├── user_id          → users.id
├── carrier_name     (e.g., "ups", "fedex")
├── credentials      (encrypted JSON: clientId, clientSecret, etc.)
├── access_token
├── token_expiry
└── created_at
```

---

## 2. Stateless Service Architecture

The current `RateService` caches carrier instances in an in-memory `Map`, and `UPSAuthClient` holds tokens in instance variables. This ties state to a single process.

- Replace in-memory token and carrier caching with **shared storage** (Redis or database).
- Each incoming request resolves the user's credentials and token from the store, removing per-process state.
- This allows **horizontal scaling** — multiple service instances handle requests without token conflicts or redundant auth calls.

**Before (current):**

```
Process A: RateService → Map<"ups", UPSCarrier> → UPSAuthClient (token in memory)
Process B: RateService → Map<"ups", UPSCarrier> → UPSAuthClient (separate token in memory)
```

**After:**

```
Process A ─┐
           ├──→ Redis/DB (shared token store) ──→ Carrier API
Process B ─┘
```

---

## 3. Proper Token Refresh Handling

The current implementation checks `Date.now() < expiry` and fetches a new token if expired. Production scenarios require more:

- **Proactive refresh**: Schedule token refresh before expiry. The 60-second buffer in `UPSAuthClient` is a start, but a background job or TTL-based trigger is more robust.
- **Retry logic**: If a token fetch fails, retry with exponential backoff before failing the request.
- **Deduplication of concurrent refreshes**: When multiple requests hit an expired token simultaneously, only one should perform the refresh. Use a mutex or single-flight pattern to prevent redundant token fetches and potential rate-limiting from the carrier's auth endpoint.

**Conceptual flow:**

```
Request arrives → Is token valid?
                    │
                    ├── YES → Use cached token
                    │
                    └── NO  → Acquire lock
                                │
                                ├── Lock acquired → Refresh token → Store → Release lock → Use token
                                │
                                └── Lock held by another → Wait for lock release → Use refreshed token
```

---

## 4. Strict Carrier Authentication Interfaces

Each carrier has its own authentication mechanism (OAuth2 client credentials for UPS, similar but different flows for FedEx, DHL, etc.). Introduce a formal contract:

```typescript
interface CarrierAuthProvider {
  getToken(credentials: CarrierCredentials): Promise<string>;
  refreshToken(credentials: CarrierCredentials): Promise<string>;
  isTokenValid(token: StoredToken): boolean;
}
```

- Each carrier implements this interface with its specific auth flow.
- The `CarrierClient` base class consumes a `CarrierAuthProvider` rather than hardcoding auth logic.
- This standardizes token lifecycle management across all carriers and simplifies adding new ones.

**Implementation mapping:**

| Carrier | Auth Mechanism | `CarrierAuthProvider` Implementation |
|---------|---------------|--------------------------------------|
| UPS | OAuth2 Client Credentials | `UPSAuthProvider` |
| FedEx | OAuth2 Client Credentials | `FedExAuthProvider` |
| DHL | API Key + Secret | `DHLAuthProvider` |
| USPS | Token-based | `USPSAuthProvider` |

---

## 5. Strong API Error Boundaries

Errors currently propagate as raw `Error` objects or unhandled rejections. A production system needs structured, predictable error responses across all layers:

- **HTTP layer**: Normalize fetch failures, timeouts, and non-2xx responses into a `HttpError` with status, message, and retryable flag.
- **Carrier client layer**: Wrap carrier-specific error formats (e.g., UPS error codes) into a `CarrierError` (already defined in `models/error.ts` but not yet wired in).
- **Service layer**: Catch and translate all downstream errors into a consistent response shape for API consumers.

**Error flow:**

```
Carrier API error (UPS-specific format)
  │
  ▼
CarrierError { code: "UPS_INVALID_ADDRESS", message: "...", retryable: false }
  │
  ▼
ServiceError { carrier: "ups", code: "INVALID_ADDRESS", message: "...", retryable: false }
  │
  ▼
API Response { status: 422, error: { code, message, retryable } }
```

This ensures callers always receive **structured error responses** with a code, message, and whether the operation is retryable — regardless of which carrier or failure mode triggered it.

---

## 6. Carrier Capability Interfaces

Rating is one of several carrier operations. Extend the `Carrier` interface to support the full shipment lifecycle:

```typescript
interface Carrier {
  getRates(request: RateRequest): Promise<RateQuote[]>;
  createShipment?(request: ShipmentRequest): Promise<ShipmentResponse>;
  trackShipment?(trackingNumber: string): Promise<TrackingStatus>;
  cancelShipment?(shipmentId: string): Promise<void>;
}
```

- Use optional methods or a capability-check pattern (`carrier.supports("tracking")`) so each carrier only implements what it offers.
- The service layer gains corresponding services (`ShipmentService`, `TrackingService`) following the same factory + delegation pattern as `RateService`.

**Capability matrix example:**

| Carrier | Rating | Shipment Creation | Tracking | Cancellation |
|---------|--------|-------------------|----------|--------------|
| UPS | Yes | Yes | Yes | Yes |
| FedEx | Yes | Yes | Yes | Yes |
| DHL | Yes | Yes | Yes | No |
| USPS | Yes | No | Yes | No |

---

## 7. Observability and Reliability Improvements

### Structured Logging

Log every carrier request/response (redacting credentials) with correlation IDs for traceability.

```
[req:abc123] → UPS /rating/v1/rate  { origin: "10001", dest: "90001" }
[req:abc123] ← UPS 200  { services: 1, latency: 342ms }
```

### Retries with Backoff

Wrap carrier HTTP calls in a retry policy for transient failures (5xx, timeouts, network errors).

```
Attempt 1 → 500 → wait 200ms
Attempt 2 → 503 → wait 400ms
Attempt 3 → 200 → success
```

### Circuit Breakers

If a carrier endpoint fails repeatedly, trip a circuit breaker to fail fast and avoid cascading timeouts.

```
Closed (healthy) → 5 failures in 60s → Open (failing fast)
                                          → 30s cooldown → Half-Open (probe)
                                                             → Success → Closed
                                                             → Failure → Open
```

### Response Caching

Cache rate responses for identical origin/destination/package combinations with a short TTL to reduce carrier API calls and latency.

```
Cache key: hash(carrier + origin + destination + packages + serviceLevel)
TTL: 5–15 minutes (configurable per carrier)
```

---

## Summary

The current codebase establishes a clean separation of concerns, injectable dependencies, and thorough test coverage at the integration boundary. The improvements above address what's needed for production:

1. Persistent multi-tenant state
2. Stateless horizontal scaling
3. Resilient token management
4. Standardized auth contracts
5. Structured error handling
6. Expanded carrier capabilities
7. Operational observability

Each can be adopted incrementally without rewriting the existing architecture.
