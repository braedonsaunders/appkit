# @appkitjs/telephony

## 0.2.0

### Minor Changes

- 102851e: Add `@appkitjs/telephony`: carrier phone-number provisioning over `fetch`, with a
  carrier catalogue, sealed-secret config, and an injectable carrier adapter.

  `CarrierClient` covers account verification, number search, purchase, and
  release. `ensureTrunk` is the seam — it collapses a carrier's own trunk,
  origination, and credential objects into one normalized result (termination
  host and port, outbound credentials, and the suggested inbound signalling
  ranges) and unwinds partial failures, so a consumer maps it onto its own SIP
  layer without learning a carrier's object model.

  Twilio is the first carrier; the catalogue follows the `@appkitjs/sms` provider
  shape so others can be added beside it.
