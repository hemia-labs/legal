# api

## 0.6.1

### Patch Changes

- 0f324b7: Allow linked internal HTML publications in authenticated account document sets and preserve access to the exact accepted version.

## 0.6.0

### Minor Changes

- 2457e39: Manage document sets from the integration detail and discover account document sets with their effective publications and acceptance rules.
- 2457e39: Allow document sets to share pending status and evidence history within an organization while preserving the verified signer on the receipt.

## 0.5.0

### Minor Changes

- 8315302: Prepare subject-bound review snapshots containing only pending documents. Preserve earlier evidence and keep public registration snapshots complete.

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
