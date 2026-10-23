import { afterEach, expect, mock, test } from "bun:test";
import { deleteDocument } from "../../apps/web/src/services/document.service";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test.each([true, false])("deletion returns storage cleanup outcome %s to the UI", async (storageDeleted) => {
  const fetchMock = mock().mockResolvedValueOnce(Response.json({ storageDeleted }));
  globalThis.fetch = fetchMock as typeof fetch;
  await expect(deleteDocument("document-1")).resolves.toEqual({ storageDeleted });
  expect(fetchMock.mock.calls[0][0]).toEndWith("/v1/legal/documents/document-1");
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "DELETE", credentials: "include" });
});
