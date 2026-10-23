import {
  parseFunctions,
  clientHasFunction,
} from '../../../../apps/api/src/modules/legal/systems/capability-functions';
const ref = {
  audience: 'notifications-api',
  code: 'notifications.messages.send',
};
const fn = { code: 'sender', name: 'Enviar notificaciones', scopes: [ref] };
const scope = {
  ...ref,
  name: 'Enviar mensajes',
  resource: 'https://notifications.example',
  enabled: true,
};
test('supports functions and scope references from any API', () => {
  expect(parseFunctions([fn])).toEqual([fn]);
  expect(parseFunctions([])).toEqual([]);
});
test('rejects duplicate functions, duplicate references and invalid scope tokens', () => {
  for (const value of [
    [fn, fn],
    [{ ...fn, scopes: [ref, ref] }],
    [{ ...fn, scopes: [{ ...ref, code: 'invalid scope' }] }],
    [{ ...fn, scopes: [] }],
  ])
    expect(() => parseFunctions(value)).toThrow();
});
test('eligibility requires active registered scopes and the exact audience/resource destination', () => {
  const client = {
    scopes: [ref.code],
    serviceDestinations: [
      { audience: ref.audience, resource: scope.resource, scopes: [ref.code] },
    ],
  };
  expect(clientHasFunction(client, fn, [scope])).toBe(true);
  expect(
    clientHasFunction({ ...client, serviceDestinations: [] }, fn, [scope]),
  ).toBe(false);
  expect(
    clientHasFunction(
      {
        ...client,
        serviceDestinations: [
          {
            ...client.serviceDestinations[0],
            resource: 'https://other.example',
          },
        ],
      },
      fn,
      [scope],
    ),
  ).toBe(false);
  expect(clientHasFunction(client, fn, [{ ...scope, enabled: false }])).toBe(
    false,
  );
});
