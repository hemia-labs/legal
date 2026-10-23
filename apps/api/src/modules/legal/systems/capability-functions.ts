import { BadRequestException } from '@nestjs/common';
export type ScopeReference = { audience: string; code: string };
export type CapabilityFunction = {
  code: string;
  name: string;
  scopes: ScopeReference[];
};
export type ScopeEntry = ScopeReference & {
  resource: string | null;
  enabled: boolean;
  name: string;
  description?: string;
};
export type FunctionClient = {
  audience?: string;
  scopes: string[];
  serviceDestinations?:
    { resource: string; audience: string; scopes: string[] }[] | null;
};
export const scopeKey = (scope: ScopeReference) =>
  JSON.stringify([scope.audience, scope.code]);
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export function parseFunctions(value: unknown): CapabilityFunction[] {
  if (!Array.isArray(value) || value.length > 30)
    throw new BadRequestException('Define hasta 30 funciones por capacidad.');
  const codes = new Set<string>();
  return value.map((f: unknown) => {
    if (
      !object(f) ||
      typeof f.code !== 'string' ||
      !/^[a-z][a-z0-9_-]{1,79}$/.test(f.code) ||
      ['constructor', 'prototype', '__proto__'].includes(f.code) ||
      codes.has(f.code) ||
      typeof f.name !== 'string' ||
      !f.name.trim() ||
      f.name.length > 200 ||
      !Array.isArray(f.scopes) ||
      !f.scopes.length ||
      f.scopes.length > 100
    )
      throw new BadRequestException(
        'Revisa el código, nombre y permisos de cada función.',
      );
    codes.add(f.code);
    const keys = new Set<string>();
    const scopes = f.scopes.map((s: unknown) => {
      if (
        !object(s) ||
        typeof s.code !== 'string' ||
        !/^[\x21\x23-\x5B\x5D-\x7E]{1,160}$/.test(s.code) ||
        typeof s.audience !== 'string' ||
        !/^\S{1,160}$/.test(s.audience)
      )
        throw new BadRequestException('Referencia de permiso inválida.');
      const scope = { audience: s.audience, code: s.code };
      const key = scopeKey(scope);
      if (keys.has(key))
        throw new BadRequestException('Permisos duplicados en la función.');
      keys.add(key);
      return scope;
    });
    return { code: f.code, name: f.name.trim(), scopes };
  });
}
export function clientHasFunction(
  client: FunctionClient,
  fn: CapabilityFunction,
  catalog: ScopeEntry[],
) {
  return fn.scopes.every((ref) => {
    const scope = catalog.find((s) => scopeKey(s) === scopeKey(ref));
    return (
      scope?.enabled &&
      !!scope.resource &&
      (client.serviceDestinations ?? []).some(
        (d) =>
          d.audience === scope.audience &&
          d.resource === scope.resource &&
          d.scopes.includes(scope.code),
      )
    );
  });
}
