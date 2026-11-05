# api

## 0.4.0

### Minor Changes

- 00be5cc: Expose published document sets and immutable acceptance evidence for external applications. Authorized clients can record evidence with stable idempotency keys, evaluate pending documents, read evidence history and validate a receipt against the current set. Apply the document-set migration explicitly before enabling integrations that use these endpoints.

## 0.3.1

### Patch Changes

- 367cb65: Associate each Payments function with the independent Billing connection read permission in the capability catalog. Preserve existing function codes, permissions, schemas and bindings. The manual migration changes catalog metadata only and does not grant any client permissions.

## 0.3.0

### Minor Changes

- 35d725d: Add an explicit, reversible authenticated-user action mode for Legal while preserving verified SSO, active memberships and products, consumer organization isolation, and service authorization.

## 0.2.1

### Patch Changes

- 30e2a29: Read API audiences and resources from Identity's OAuth API catalog when validating system connections.

## 0.2.0

### Minor Changes

- fe82ed3: Prepare Legal production images, CI, versioned immutable releases, explicit migrations and recoverable deployment.
