# Cybership Assessment - Shipping Rate Aggregation Service

A multi-carrier shipping rate aggregation service built with **Bun** and **TypeScript**. Currently implements UPS rate retrieval with a clean, extensible architecture designed for adding additional carriers.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Data Flow](#data-flow)
    - [Rate Request Flow](#1-rate-request-flow-happy-path)
    - [Authentication Flow](#2-authentication-flow-ups-oauth)
    - [Request / Response Mapping Flow](#3-request--response-mapping-flow)
- [Layer-by-Layer Breakdown](#layer-by-layer-breakdown)
    - [Service Layer](#service-layer)
    - [Carrier Factory](#carrier-factory)
    - [Carrier Implementation (UPS)](#carrier-implementation-ups)
    - [HTTP Client & Utilities](#http-client--utilities)
    - [Domain Models](#domain-models)
- [Testing Architecture](#testing-architecture)
    - [Test Strategy](#test-strategy)
    - [Mock Data Stubs](#mock-data-stubs-fixtures)
    - [Test Coverage Matrix](#test-coverage-matrix)
- [Edge Cases Handled](#edge-cases-handled)
- [Adding a New Carrier](#adding-a-new-carrier)

---

## Quick Start

```bash
# Install dependencies
bun install

# Run the mocked demo flow
bun run execute

# Run the test suite
bun test
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          ENTRY POINT                                │
│                          src/index.ts                                │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        SERVICE LAYER                                │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  RateService                                                  │  │
│  │  - Receives a carrier-agnostic RateRequest                    │  │
│  │  - Delegates to the correct carrier via CarrierFactory        │  │
│  │  - Caches carrier instances (Map<string, Carrier>)            │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       CARRIER FACTORY                               │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  CarrierFactory.create(name, config, http)                    │  │
│  │  - Registry-based pattern (Record<CarrierName, CarrierBuilder>│) │
│  │  - Validates credentials before instantiation                 │  │
│  │  - Returns a Carrier interface implementation                 │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   CARRIER IMPLEMENTATION (UPS)                      │
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐   │
│  │  UPSCarrier   │──▶│  UPSClient   │──▶│  UPSAuthClient       │   │
│  │              │   │              │   │  (OAuth2 token mgmt) │   │
│  │  Maps domain │   │  Calls UPS   │   │  Caches tokens with  │   │
│  │  ←→ UPS API  │   │  REST API    │   │  expiry tracking     │   │
│  └──────────────┘   └──────┬───────┘   └──────────┬───────────┘   │
│                            │                       │               │
│  ┌──────────────┐          │                       │               │
│  │  UPSMapper    │          │                       │               │
│  │              │          ▼                       ▼               │
│  │  Domain ←→   │   ┌──────────────────────────────────────┐      │
│  │  UPS format  │   │            HttpClient                │      │
│  └──────────────┘   │  (Generic POST client using fetch)   │      │
│                      └──────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

### Mental Model

| Concept           | Role                                                                    |
| ----------------- | ----------------------------------------------------------------------- |
| **Service Layer** | Handles one domain function at a time (e.g., rating). Carrier-agnostic. |
| **Carrier**       | Adapter that translates domain models to/from a specific carrier's API. |
| **Client**        | HTTP-level integration with a carrier's REST endpoints.                 |
| **Auth Store**    | Each client owns its authentication lifecycle (token fetch + caching).  |
| **HttpClient**    | Thin, injectable wrapper over `fetch` for testability.                  |

---

## Data Flow

### 1. Rate Request Flow (Happy Path)

```
   Caller
     │
     │  RateRequest { carrier: "ups", origin, destination, packages }
     ▼
 ┌──────────────┐
 │  RateService  │
 │              │─── Checks carrier cache (Map)
 │              │─── If miss: CarrierFactory.create("ups", config, http)
 │              │─── Stores carrier in cache for future requests
 │              │─── Calls carrier.getRates(request)
 └──────┬───────┘
        │
        ▼
 ┌──────────────┐
 │  UPSCarrier   │
 │              │─── mapToUPSRateRequest(request)    [Domain → UPS format]
 │              │─── UPSClient.getRate(upsPayload)
 │              │─── mapFromUPSRateResponse(response) [UPS format → Domain]
 └──────┬───────┘
        │
        ▼
 ┌──────────────┐
 │  UPSClient   │
 │              │─── UPSAuthClient.getToken()
 │              │─── HttpClient.post({ url: rating API, body, headers })
 └──────┬───────┘
        │
        ▼
 ┌──────────────┐
 │  UPS REST API │  (or MockHttpClient during tests)
 └──────┬───────┘
        │
        ▼
   RateQuote[]  ← normalized, carrier-agnostic response
```

### 2. Authentication Flow (UPS OAuth)

```
  UPSClient.getRate()
     │
     │  Needs Bearer token
     ▼
  UPSAuthClient.getToken()
     │
     ├── Has cached token AND Date.now() < expiry?
     │       │
     │       ├── YES → return cached token (skip HTTP call)
     │       │
     │       └── NO  → fetchToken()
     │                    │
     │                    ├── Encode clientId:clientSecret as Base64
     │                    ├── POST /security/v1/oauth/token
     │                    │   Headers: { Authorization: "Basic <b64>",
     │                    │              Content-Type: "application/x-www-form-urlencoded" }
     │                    │   Body:    { grant_type: "client_credentials" }
     │                    │
     │                    ├── Store token + calculated expiry
     │                    │   (expiry = now + expires_in*1000 - 60s buffer)
     │                    │
     │                    └── return token
     ▼
  Bearer token used in subsequent API call
```

**Key detail**: The 60-second buffer (`- 60_000`) ensures the token is refreshed _before_ it actually expires, preventing edge-case failures from clock drift or network latency.

### 3. Request / Response Mapping Flow

```
  Domain RateRequest                              UPS API Payload
  ─────────────────                              ────────────────
  {                                               {
    carrier: "ups",                                 RateRequest: {
    origin: Address,         ──mapToUPS──▶            Shipment: {
    destination: Address,                               Shipper: { Name, Address },
    packages: Package[],                                ShipFrom: { Name, Address },
    serviceLevel?: string                               ShipTo: { Name, Address },
  }                                                     Service?: { Code },
                                                        Package: [{ PackagingType,
                                                          Dimensions?, PackageWeight }]
                                                      }
                                                    }
                                                  }

  UPS API Response                                Domain RateQuote[]
  ────────────────                                ─────────────────
  {                                               [
    RateResponse: {          ──mapFromUPS──▶        {
      RatedShipment: [{                               carrier: "ups",
        Service: { Code, Description },                serviceCode: "03",
        TotalCharges: {                                serviceName: "UPS Ground",
          CurrencyCode, MonetaryValue                  totalCharge: { currency: "USD",
        },                                                           amount: 10.50 },
        TimeInTransit?: { ... }                        estimatedDays?: 3
      }]                                             }
    }                                              ]
  }
```

---

## Layer-by-Layer Breakdown

### Service Layer

**File**: `src/services/rate.service.ts`

The `RateService` is the public API of the system. It:

1. **Accepts a carrier-agnostic `RateRequest`** - callers don't need to know UPS-specific formats.
2. **Lazily creates carrier instances** via `CarrierFactory` and caches them in a `Map<string, Carrier>`.
3. **Delegates entirely** to the carrier's `getRates()` method.

```
RateService
├── carrierConfig: CarrierFactoryConfig   (credentials for each carrier)
├── http?: HttpClient                      (injectable HTTP layer)
├── carriers: Map<string, Carrier>         (instance cache)
│
└── getRates(request: RateRequest): Promise<RateQuote[]>
```

**Why caching matters**: Creating a carrier involves wiring up auth clients, HTTP clients, etc. The `Map` ensures this happens once per carrier per service lifetime.

---

### Carrier Factory

**File**: `src/carriers/carrier.factory.ts`

A **registry-based factory pattern** that maps carrier names to builder functions:

```
registry: Record<CarrierName, CarrierBuilder>
├── "ups" → (config, http) => new UPSCarrier(config.ups, http)
└── (future carriers added here)
```

**Validations performed**:

- Throws `"UPS credentials missing"` if `config.ups` is undefined.
- Throws `"Unsupported carrier: <name>"` if the carrier name isn't in the registry.

The `CarrierName` type is derived from a `const` tuple (`CARRIERS = ["ups"] as const`), providing compile-time safety - you can't pass an arbitrary string.

---

### Carrier Implementation (UPS)

The UPS carrier is decomposed into **five focused modules**:

| File             | Responsibility                                                               |
| ---------------- | ---------------------------------------------------------------------------- |
| `ups.carrier.ts` | Implements the `Carrier` interface. Orchestrates mapping + client calls.     |
| `ups.client.ts`  | HTTP-level integration with the UPS REST API. Handles auth header injection. |
| `ups.auth.ts`    | OAuth2 client_credentials flow. Token caching with expiry tracking.          |
| `ups.mapper.ts`  | Pure functions translating between domain models and UPS API formats.        |
| `ups.types.ts`   | TypeScript interfaces for UPS API request/response shapes.                   |
| `ups.config.ts`  | Credential interface (`clientId`, `clientSecret`).                           |

**Dependency chain**:

```
UPSCarrier
  └── UPSClient
        ├── UPSAuthClient
        │     └── HttpClient
        └── HttpClient
```

**Mapper details** (`ups.mapper.ts`):

- `mapShipmentLocation(address)` - Converts a domain `Address` into UPS's nested `Name` + `Address` structure. Filters out `undefined` address lines.
- `mapPackages(packages)` - Converts domain `Package[]` into UPS format. Dimensions are optional; weight is always included.
- `mapToUPSRateRequest(request)` - Composes the full `RateRequest` envelope. `Service` is only included if `serviceLevel` is provided.
- `mapFromUPSRateResponse(response)` - Extracts `RatedShipment[]` and normalizes into `RateQuote[]`. Safely handles optional `TimeInTransit` nesting.

---

### HTTP Client & Utilities

**File**: `src/utils/http.client.ts`

A minimal, generic HTTP POST client wrapping the native `fetch` API:

- Strongly typed with generics: `post<RequestBody, ResponseBody>(options)`
- Merges default `Content-Type: application/json` with custom headers
- Throws on non-OK responses (`if (!res.ok)`)
- Fully injectable - carriers accept an optional `HttpClient` parameter

**File**: `src/utils/index.ts`

A frozen `utilsRegistry` singleton providing a default `HttpClient` instance. The `UPSClient` falls back to this when no custom HTTP client is injected:

```typescript
this.http = http ?? utilsRegistry.httpClient;
```

---

### Domain Models

```
src/models/
├── address.ts      Address interface (line1, line2?, city, state?, postal, country, phone?)
├── carrier.ts      CarrierName type derived from CARRIERS const tuple
├── error.ts        CarrierError class (code, retryable flag)
├── money.ts        Money interface (amount, currency)
├── package.ts      Package with optional dimensions + required weight
└── rate.ts         RateRequest (carrier, origin, dest, packages, serviceLevel?)
                    RateQuote (carrier, serviceCode, serviceName, totalCharge, estimatedDays?)
```

All models are **carrier-agnostic** - they represent the universal shipping domain, not any specific carrier's format.

---

## Testing Architecture

### Test Strategy

```
┌──────────────────────────────────────────────────────────────────┐
│                         TEST LAYER                               │
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────────────────────┐   │
│  │  Mock HTTP Client │    │  JSON Fixture Files              │   │
│  │  (mockPost)       │    │                                  │   │
│  │                  │    │  fixtures/auth/                   │   │
│  │  Controls what   │    │    ├── ups.auth.success.json      │   │
│  │  each HTTP call  │    │    └── ups.auth.error.json        │   │
│  │  returns or      │    │                                  │   │
│  │  rejects         │    │  fixtures/rate/                   │   │
│  └────────┬─────────┘    │    ├── ups.rate.success.json      │   │
│           │              │    ├── ups.rate.error.json         │   │
│           │              │    ├── ups.rate.malformed.json     │   │
│           │              │    └── ups.rate.server-error.json  │   │
│           │              └──────────────────────────────────────┘   │
│           │                                                  │
│           ▼                                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  RateService (real) → CarrierFactory (real)           │   │
│  │  → UPSCarrier (real) → UPSClient (real)               │   │
│  │  → UPSAuthClient (real) → mockPost (mock)             │   │
│  │                                                      │   │
│  │  Everything runs real code EXCEPT the HTTP layer      │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

**Philosophy**: Only the **HTTP boundary** is mocked. All business logic (service layer, factory, carrier, mapper, auth token caching) runs as real code. This gives high confidence that the full integration works correctly.

### Mock Data Stubs (Fixtures)

| Fixture                      | Purpose                                              | Shape                                                  |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| `ups.auth.success.json`      | Simulates a successful OAuth token response          | `{ access_token, expires_in }`                         |
| `ups.auth.error.json`        | Simulates invalid client credentials                 | `{ error, error_description }`                         |
| `ups.rate.success.json`      | Simulates a successful rate response with 1 shipment | Full `RateResponse` with `RatedShipment[]`             |
| `ups.rate.error.json`        | Simulates a UPS API-level failure response           | `RateResponse` with failure status, no `RatedShipment` |
| `ups.rate.malformed.json`    | Simulates a structurally broken response             | `{ RateResponse: {} }` - missing `RatedShipment`       |
| `ups.rate.server-error.json` | Simulates a 500-level server error                   | `{ message: "Internal Server Error" }`                 |

### Test Coverage Matrix

| #   | Test Case                                | What It Validates                                                                | Mock Setup                                       |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | **Returns normalized rate quotes**       | Full happy path: auth → rate → mapping → normalized output                       | Auth success + Rate success                      |
| 2   | **Reuses cached auth token**             | Token caching: 2 rate calls should produce only 1 auth call (3 total HTTP calls) | Auth success + Rate success (repeated)           |
| 3   | **Fails when auth fails**                | Auth error propagation: if token fetch throws, the entire chain rejects          | Auth rejects with Error                          |
| 4   | **Fails on malformed UPS response**      | Mapper resilience: accessing `RatedShipment.map()` on `undefined` throws         | Auth success + Malformed rate response           |
| 5   | **Propagates rate API/server errors**    | HTTP error propagation: rate endpoint failure bubbles up with correct message    | Auth success + Rate rejects with Error           |
| 6   | **Builds UPS request payload correctly** | Mapper correctness: inspects the actual payload sent to UPS to verify structure  | Auth success + Rate success (payload inspection) |

---

## Edge Cases Handled

### Authentication Layer

| Edge Case                         | How It's Handled                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Token expiry**                  | `UPSAuthClient` tracks `expiry` and only reuses tokens where `Date.now() < expiry`                                |
| **Early refresh buffer**          | Tokens are expired 60 seconds early (`expires_in * 1000 - 60_000`) to account for clock drift and network latency |
| **Token caching across requests** | Token is stored in-memory and reused across multiple `getRate()` calls without re-fetching                        |
| **Auth failure propagation**      | If `fetchToken()` throws, the error propagates up through the entire call chain                                   |

### Carrier Factory

| Edge Case                    | How It's Handled                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| **Missing credentials**      | Throws `"UPS credentials missing"` before attempting to construct the carrier            |
| **Unsupported carrier name** | Throws `"Unsupported carrier: <name>"` if the name isn't in the registry                 |
| **Type safety**              | `CarrierName` is a union derived from `const CARRIERS`, preventing typos at compile time |

### Service Layer

| Edge Case                    | How It's Handled                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Carrier instance caching** | `RateService` caches carrier instances in a `Map`, so repeated requests for the same carrier don't re-create the auth + client stack |
| **Lazy initialization**      | Carriers are only created on first use, not at service construction time                                                             |

### Request Mapping

| Edge Case                   | How It's Handled                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| **Optional address line 2** | `mapShipmentLocation` uses `.filter(Boolean)` to strip out `undefined` values from `AddressLine[]` |
| **Optional dimensions**     | `mapPackages` conditionally includes `Dimensions` only when `pkg.dimensions` is defined            |
| **Optional service level**  | `mapToUPSRateRequest` only includes `Service: { Code }` when `request.serviceLevel` is provided    |
| **Optional name field**     | Falls back to `"N/A"` when `address.name` is not provided                                          |

### Response Mapping

| Edge Case                       | How It's Handled                                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Missing TimeInTransit**       | Uses deep optional chaining (`shipment.TimeInTransit?.ServiceSummary?.EstimatedArrival?.BusinessDaysInTransit`) to safely return `undefined` |
| **Missing service description** | Falls back to `Service.Code` when `Service.Description` is not present                                                                       |
| **String-to-number conversion** | `MonetaryValue` (string from UPS) is converted to `number` via `Number()`                                                                    |
| **Malformed response**          | If `RatedShipment` is missing, `response.RateResponse.RatedShipment.map()` throws - caught by the test layer                                 |

### HTTP Client

| Edge Case                  | How It's Handled                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Non-OK HTTP status**     | `HttpClient.post()` checks `res.ok` and throws `"HTTP Error <status>"` for any non-2xx response                                                  |
| **Header merging**         | Default `Content-Type: application/json` is merged with custom headers, allowing overrides (e.g., auth uses `application/x-www-form-urlencoded`) |
| **Injectable HTTP client** | Every carrier accepts an optional `HttpClient`, enabling full testability without touching real endpoints                                        |

### Dependency Injection & Testability

| Edge Case                   | How It's Handled                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| **No HTTP client provided** | `UPSClient` falls back to `utilsRegistry.httpClient` (a frozen singleton)                    |
| **Mock isolation**          | Tests use `mockPost.mockReset()` in `beforeEach` to ensure no state leaks between test cases |
| **Frozen registry**         | `utilsRegistry` is `Object.freeze()`'d to prevent accidental mutation of shared state        |

---

## Adding a New Carrier

To add a new carrier (e.g., FedEx):

1. **Add the carrier name** to `src/constants/carriers.ts`:

    ```typescript
    export const CARRIERS = ["ups", "fedex"] as const;
    ```

2. **Create the carrier directory** `src/carriers/fedex/` with:
    - `fedex.config.ts` - Credential interface
    - `fedex.auth.ts` - Authentication client
    - `fedex.client.ts` - API client
    - `fedex.types.ts` - API request/response types
    - `fedex.mapper.ts` - Domain ←→ FedEx mapping functions
    - `fedex.carrier.ts` - `Carrier` interface implementation

3. **Register in the factory** (`src/carriers/carrier.factory.ts`):

    ```typescript
    const registry: Record<CarrierName, CarrierBuilder> = {
      ups: (config, http) => { ... },
      fedex: (config, http) => {
        if (!config.fedex) throw new Error("FedEx credentials missing");
        return new FedExCarrier(config.fedex, http);
      },
    };
    ```

4. **Add fixtures and tests** in `tests/fixtures/` and `tests/rate/`.

The architecture ensures that adding a new carrier requires **zero changes** to the service layer or existing carrier implementations.

---

## Project Structure Reference

```
src/
├── index.ts                     # Entry point (demo with mocks)
├── services/
│   └── rate.service.ts          # Domain service - rate retrieval
├── carriers/
│   ├── carrier.interface.ts     # Carrier contract (getRates)
│   ├── carrier.factory.ts       # Registry-based factory
│   └── ups/
│       ├── ups.auth.ts          # OAuth2 token management
│       ├── ups.carrier.ts       # Carrier interface implementation
│       ├── ups.client.ts        # UPS REST API client
│       ├── ups.config.ts        # Credential types
│       ├── ups.mapper.ts        # Domain ←→ UPS mapping
│       └── ups.types.ts         # UPS API type definitions
├── models/
│   ├── address.ts               # Address model
│   ├── carrier.ts               # CarrierName type
│   ├── error.ts                 # CarrierError with retryable flag
│   ├── money.ts                 # Money model
│   ├── package.ts               # Package + dimensions + weight
│   └── rate.ts                  # RateRequest + RateQuote
├── constants/
│   └── carriers.ts              # Carrier name constants
├── mock/
│   └── http-client.mock.ts      # Simple mock for demo
└── utils/
    ├── http.client.ts           # Generic HTTP POST client
    └── index.ts                 # Frozen utils registry

tests/
├── fixtures/
│   ├── auth/
│   │   ├── ups.auth.success.json
│   │   └── ups.auth.error.json
│   └── rate/
│       ├── ups.rate.success.json
│       ├── ups.rate.error.json
│       ├── ups.rate.malformed.json
│       └── ups.rate.server-error.json
└── rate/
    └── rate.test.ts             # Integration tests (6 test cases)
```

---

## Next Implementation Guide — Scaling & Hardening

The current implementation covers a clean, testable rate-fetching flow. The following topics outline what's needed to take this system from assignment-ready to production-ready.

### 1. Multi-User Support with Database Storage

Currently, credentials and tokens live in-memory and are hardcoded per process. In production:

- Introduce database tables for **users**, **carrier accounts**, **credentials**, and **tokens**.
- Each user (or organization) owns one or more carrier accounts, each storing encrypted credentials and the latest OAuth token + expiry.
- Token storage moves from `UPSAuthClient`'s private fields to a persistent store (e.g., Postgres row or Redis key), looked up by user + carrier.
- This enables **multi-tenant support** — a single service instance serves multiple users, each with their own carrier credentials and token lifecycle.

### 2. Stateless Service Architecture

The current `RateService` caches carrier instances in an in-memory `Map`, and `UPSAuthClient` holds tokens in instance variables. This ties state to a single process.

- Replace in-memory token and carrier caching with **shared storage** (Redis or database).
- Each incoming request resolves the user's credentials and token from the store, removing per-process state.
- This allows **horizontal scaling** — multiple service instances handle requests without token conflicts or redundant auth calls.

### 3. Proper Token Refresh Handling

The current implementation checks `Date.now() < expiry` and fetches a new token if expired. Production scenarios require more:

- **Proactive refresh**: Schedule token refresh before expiry (the 60s buffer is a start, but a background job or TTL-based trigger is more robust).
- **Retry logic**: If a token fetch fails, retry with exponential backoff before failing the request.
- **Deduplication of concurrent refreshes**: When multiple requests hit an expired token simultaneously, only one should perform the refresh. Use a mutex or single-flight pattern to prevent redundant token fetches and potential rate-limiting from the carrier's auth endpoint.

### 4. Strict Carrier Authentication Interfaces

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

### 5. Strong API Error Boundaries

Errors currently propagate as raw `Error` objects or unhandled rejections. A production system needs structured, predictable error responses across all layers:

- **HTTP layer**: Normalize fetch failures, timeouts, and non-2xx responses into a `HttpError` with status, message, and retryable flag.
- **Carrier client layer**: Wrap carrier-specific error formats (e.g., UPS error codes) into a `CarrierError` (already defined in `models/error.ts` but not yet used).
- **Service layer**: Catch and translate all downstream errors into a consistent response shape for API consumers.
- This ensures callers always receive **structured error responses** with a code, message, and whether the operation is retryable — regardless of which carrier or failure mode triggered it.

### 6. Carrier Capability Interfaces

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

### 7. Observability and Reliability Improvements

- **Structured logging**: Log every carrier request/response (redacting credentials) with correlation IDs for traceability.
- **Retries with backoff**: Wrap carrier HTTP calls in a retry policy for transient failures (5xx, timeouts, network errors).
- **Circuit breakers**: If a carrier endpoint fails repeatedly, trip a circuit breaker to fail fast and avoid cascading timeouts.
- **Response caching**: Cache rate responses for identical origin/destination/package combinations with a short TTL to reduce carrier API calls and latency.

---

### Summary

The current codebase establishes a clean separation of concerns, injectable dependencies, and thorough test coverage at the integration boundary. The improvements above address what's needed for production: persistent multi-tenant state, stateless horizontal scaling, resilient token management, standardized error handling, expanded carrier capabilities, and operational observability. Each can be adopted incrementally without rewriting the existing architecture.
