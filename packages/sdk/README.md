# @hemia/legal

Node.js client for the document-set and evidence API. The first workspace version supports reading a published set and recording evidence. It works with CommonJS and ESM.

```ts
import { createLegalClient } from '@hemia/legal';

const legal = createLegalClient({ baseUrl, auth });
const shown = await legal.getDocumentSet({ applicationId, documentSetKey, locale });

// From a saved application event, after the user confirms the shown documents.
const receipt = await legal.recordEvidence({
  snapshotToken: savedEvent.snapshotToken,
  idempotencyKey: savedEvent.id,
  subjectId: savedEvent.subjectId,
  occurredAt: savedEvent.occurredAt,
  confirmations: savedEvent.confirmations,
});
```

For evidence recording, configure `auth` with the issuer, token URL, OAuth client ID and secret in the backend. Evidence requires `legal.integration.acceptances.create`. Public reads can use a client initialized with just `baseUrl`. Use HTTPS and an application-configured API URL. Local HTTP requires explicit loopback opt-in outside production.

The application selects its own set and language. It verifies any downloaded document against the published hash and handles display and user confirmation. Signed artifact URLs have their own expiry and should be fetched only from configured trusted origins. An expired snapshot requires fetching a new set and asking the user to confirm again.

Save the original event with the account or operation and reuse its timestamp, confirmations and idempotency key on retry. The SDK returns the Legal receipt and leaves retry scheduling, persistence and authorization decisions to the application. HTTP failures expose a status through `LegalSdkError` without including the remote response body.

Run `bun run --cwd packages/sdk test` from the monorepo.


## Releases

Use a Changeset targeting `@hemia/legal` for SDK changes. Keep application changes in a separate Changeset targeting `api` or `web`. The SDK workflow opens its own version PR on `changeset-release/legal-sdk`. It updates this package's version, changelog and workspace lock entry.

After validating the first consumer, enable the repository variable `ENABLE_LEGAL_SDK_PUBLISH=true` and merge the SDK version PR. The release workflow validates the packaged SDK in an isolated Node consumer and publishes that same artifact from the GitHub `npm` environment. Once npm serves the expected artifact, the workflow creates the `@hemia/legal@<version>` tag and GitHub Release.

Version `0.1.0` was published manually. For later releases, configure [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) for `hemia-labs/legal`, workflow `legal-sdk-release.yml`, environment `npm`, and direct publishing. Subsequent versions use OIDC.

If publication fails, rerun the release job to reuse the validated artifact. You can also dispatch the release workflow on `main` while the SDK version merge is still its HEAD. GitHub Releases for the application keep the `legal-v…` tags and follow the application workflow.
