import { afterEach, expect, mock, test } from 'bun:test';
import { legalLogout } from '../../apps/web/src/lib/legal-api';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('logout completes both credentialed POSTs before callers navigate', async () => {
  const fetchMock = mock()
    .mockResolvedValueOnce(Response.json({ logoutUrl: 'https://identity.test/oauth/logout' }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  globalThis.fetch = fetchMock as typeof fetch;
  await legalLogout();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0][1]).toEqual({ method: 'POST', credentials: 'include' });
  expect(fetchMock.mock.calls[1]).toEqual(['https://identity.test/oauth/logout', { method: 'POST', credentials: 'include' }]);
});

test('Identity logout failure rejects so callers keep the error visible', async () => {
  globalThis.fetch = mock()
    .mockResolvedValueOnce(Response.json({ logoutUrl: 'https://identity.test/oauth/logout' }))
    .mockResolvedValueOnce(new Response(null, { status: 503 })) as typeof fetch;
  await expect(legalLogout()).rejects.toThrow('HTTP 503');
});
