# Store contract policy and known deviations

## Purpose

This suite targets the Store section of Swagger Petstore v2. It uses the
published Swagger definition as the starting point, but it does not treat every
behavior of the sample implementation as a desirable contract.

The project distinguishes three sources of expectations:

1. **Published contract** — the Store operations and schemas in the
   [Swagger Petstore v2 definition](https://petstore.swagger.io/v2/swagger.json).
2. **Pinned implementation** — the reproducible local
   `swaggerapi/petstore:1.0.7` image pinned by digest in
   [`compose.yaml`](../compose.yaml).
3. **Hardened project contract** — stricter validation and security expectations
   that are reasonable for a production API but are not consistently enforced
   by the sample implementation.

Regular tests are the build-gating contract supported by the pinned image.
Tests marked [`@Quarantine`](../src/test/java/org/mtrusov/tests/Quarantine.java)
are non-gating probes for hardened expectations that the pinned image currently
violates. A quarantined failure is therefore a documented implementation
deviation, not an accepted production behavior.

## Contract distinctions

Each project position states the rule this suite wants to enforce and how that
rule is currently handled by the regular or quarantine execution.

| Concern | Published contract | Pinned implementation | Project position |
|---|---|---|---|
| Inventory authentication | `GET /store/inventory` declares `api_key` security. | Missing, empty, and invalid keys are accepted with `200`. | **Expected:** a missing, empty, or invalid key returns `401`. **Test treatment:** the three authentication checks are `@Quarantine` because the pinned image returns `200`; they do not gate the build. |
| Order request validation | `POST /store/order` references `Order`, whose fields are not declared required and have few value constraints. | Empty or semantically invalid orders can be accepted; some invalid field types produce `500`. | **Expected:** malformed JSON, missing project-required data, and invalid field values return a structured `400`; invalid input must not cause `500`. **Test treatment:** the malformed-JSON case gates the build; cases the image mishandles remain `@Quarantine`. |
| Order identifiers | `GET` documents IDs from `1` to `10`; `DELETE` documents positive integer IDs. | The pinned image supports seeded IDs outside that range and returns `404` for negative, zero, and non-numeric IDs. | **Expected:** the suite may use its documented fixture and mutation IDs outside `1`–`10`; a missing positive ID returns `404`, while a non-positive or non-numeric ID returns `400`. **Test treatment:** the DELETE check for a missing positive ID gates the build. GET error cases and invalid identifiers remain `@Quarantine` where the status or error body differs from this expectation. |
| Error response | Store error responses have status descriptions but no response schema. | Error bodies commonly use `code`, `type`, and `message`; the body `code` can differ from the HTTP status. | **Expected:** JSON errors contain `code`, `type`, and `message`, expose no implementation traces, and use an error `code` equal to the HTTP status. **Test treatment:** this is a project-defined contract because the published Store API does not specify an error schema; unsupported cases remain `@Quarantine`. |
| Order date-time | `shipDate` is declared with `format: date-time`. | The image returns offsets such as `+0000`. | **Expected:** `shipDate` uses an ISO offset such as `Z` or `+00:00`. **Test treatment:** strict format checks remain `@Quarantine` because the image emits `+0000`; lifecycle comparisons accept both forms only to compare the represented instant. |
| Order response shape | The published `Order` schema lists properties but does not require them. | Normal successful responses contain all expected order fields. | **Expected:** every successful order response contains `id`, `petId`, `quantity`, `shipDate`, `status`, and `complete`, with the constraints in [`OrderResponseSchema.json`](../src/test/resources/schemas/OrderResponseSchema.json). **Test treatment:** schema assertions enforce this stricter project contract even though the published schema makes the fields optional. |
| Inventory representation | The response is a map from pet status to integer count. | Typical keys are `available`, `pending`, and `sold`; authentication does not affect the representation. | **Expected:** the response is an object whose values are non-negative integer pet counts. **Test treatment:** the suite does not require a fixed set of status keys and does not assume that placing or deleting an order changes pet inventory. |
| Response media type | Store operations advertise JSON; order operations also advertise XML. | Requests made with `Accept: application/json` return JSON for the covered paths. | **Expected:** covered requests use the JSON representation and return `Content-Type: application/json`. **Test treatment:** JSON content type is currently enforced for every API-client response; XML behavior is intentionally outside this suite's scope. |

## Test-suite interpretation

- `make verify-regular` runs the build-gating contract against the configured
  environment.
- `make verify-quarantine` runs the known hardened-contract deviations without
  making their failures gate the build.
- `make verify` runs both executions; only regular-test failures fail the build.
- The pinned local image is the normal mutation-test target. Running against the
  shared public service is explicit opt-in because the suite creates and deletes
  data.

When behavior changes, update the relevant test and this document together.
Promote a quarantined test only after the configured SUT satisfies the
expectation consistently.
