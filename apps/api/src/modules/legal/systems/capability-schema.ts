import { BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { resolveService, type SystemService } from './system-services';

export type CapabilityField = {
  key: string;
  label: string;
  type: 'string' | 'number' | 'integer' | 'boolean';
  required?: boolean;
  functions?: string[];
  description?: string;
  format?: 'text' | 'uri' | 'uuid' | 'code' | 'identity-issuer' | 'service';
  options?: string[];
  min?: number;
  max?: number;
  maxLength?: number;
};
export type CapabilitySchema = { fields: CapabilityField[] };
export type Capability = {
  functions?: import('./capability-functions').CapabilityFunction[];
  code: string;
  name: string;
  schema: CapabilitySchema;
};
export const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const keyPattern = /^[a-z][a-zA-Z0-9_]{1,79}$/;
const forbidden = ['__proto__', 'constructor', 'prototype'];
const fail = (message: string): never => {
  throw new BadRequestException(message);
};
export function parseSchema(
  value: unknown,
  functionCodes: readonly string[] = [],
): CapabilitySchema {
  if (
    !record(value) ||
    Object.keys(value).some((k) => k !== 'fields') ||
    !Array.isArray(value.fields) ||
    value.fields.length > 50
  )
    return fail('El esquema permite hasta 50 campos.');
  const keys = new Set<string>();
  for (const f of value.fields) {
    if (
      !record(f) ||
      Object.keys(f).some(
        (k) =>
          ![
            'key',
            'label',
            'type',
            'required',
            'functions',
            'description',
            'format',
            'options',
            'min',
            'max',
            'maxLength',
          ].includes(k),
      ) ||
      typeof f.key !== 'string' ||
      !keyPattern.test(f.key) ||
      forbidden.includes(f.key) ||
      keys.has(f.key) ||
      typeof f.label !== 'string' ||
      !f.label.trim() ||
      f.label.length > 120 ||
      !['string', 'number', 'integer', 'boolean'].includes(String(f.type))
    )
      return fail('Campo de esquema inválido o duplicado.');
    keys.add(f.key);
    if (
      f.functions !== undefined &&
      (!Array.isArray(f.functions) ||
        !f.functions.length ||
        f.functions.length > 30 ||
        new Set(f.functions).size !== f.functions.length ||
        f.functions.some(
          (code) => typeof code !== 'string' || !functionCodes.includes(code),
        ))
    )
      return fail('Selecciona funciones registradas y únicas para el campo.');
    if (f.required !== undefined && typeof f.required !== 'boolean')
      return fail('required debe ser booleano.');
    if (
      f.description !== undefined &&
      (typeof f.description !== 'string' || f.description.length > 500)
    )
      return fail('Descripción inválida.');
    if (
      f.format !== undefined &&
      (f.type !== 'string' ||
        typeof f.format !== 'string' ||
        !['text', 'uri', 'uuid', 'code', 'identity-issuer', 'service'].includes(
          String(f.format),
        ))
    )
      return fail('Formato de campo inválido.');
    if (
      f.options !== undefined &&
      (f.type !== 'string' ||
        f.format === 'service' ||
        !Array.isArray(f.options) ||
        !f.options.length ||
        f.options.length > 100 ||
        f.options.some((v) => typeof v !== 'string' || !v || v.length > 1024) ||
        new Set(f.options).size !== f.options.length)
    )
      return fail('Opciones de selección inválidas.');
    for (const bound of ['min', 'max'])
      if (
        f[bound] !== undefined &&
        (!['number', 'integer'].includes(String(f.type)) ||
          typeof f[bound] !== 'number' ||
          !Number.isFinite(f[bound]))
      )
        return fail('Límite numérico inválido.');
    if (typeof f.min === 'number' && typeof f.max === 'number' && f.min > f.max)
      return fail('El mínimo supera al máximo.');
    if (
      f.maxLength !== undefined &&
      (f.type !== 'string' ||
        !Number.isInteger(f.maxLength) ||
        Number(f.maxLength) < 1 ||
        Number(f.maxLength) > 10000)
    )
      return fail('Longitud máxima inválida.');
  }
  return value as CapabilitySchema;
}
export function validateCapability(
  value: unknown,
  schema: CapabilitySchema,
  activeFunctions?: readonly string[],
): Record<string, unknown> {
  if (
    !record(value) ||
    Object.keys(value).some((k) => !schema.fields.some((f) => f.key === k))
  )
    return fail('La configuración contiene campos desconocidos.');
  for (const f of schema.fields) {
    const v = value[f.key];
    if (v === undefined || v === '') {
      if (
        f.required &&
        (!f.functions ||
          activeFunctions === undefined ||
          f.functions.some((code) => activeFunctions.includes(code)))
      )
        fail(`${f.label}: campo obligatorio.`);
      continue;
    }
    if (f.type === 'boolean') {
      if (typeof v !== 'boolean') fail(`${f.label}: se esperaba un booleano.`);
      continue;
    }
    if (f.type === 'number' || f.type === 'integer') {
      if (
        typeof v !== 'number' ||
        !Number.isFinite(v) ||
        (f.type === 'integer' && !Number.isInteger(v)) ||
        (f.min !== undefined && v < f.min) ||
        (f.max !== undefined && v > f.max)
      )
        fail(`${f.label}: número fuera de rango o tipo inválido.`);
      continue;
    }
    if (typeof v !== 'string' || v.length > (f.maxLength ?? 1024) || !v.trim())
      return fail(`${f.label}: texto inválido.`);
    if (f.options && !f.options.includes(v))
      fail(`${f.label}: selecciona una opción disponible.`);
    if (f.format === 'uuid' && !isUUID(v)) fail(`${f.label}: UUID inválido.`);
    if (f.format === 'code' && !/^[a-z][a-z0-9_-]{1,79}$/.test(v))
      fail(`${f.label}: código inválido.`);
    if (
      f.format === 'identity-issuer' &&
      !/^urn:hemia:[a-z][a-z0-9_-]{1,80}$/.test(v)
    )
      fail(`${f.label}: identidad de origen inválida.`);
    if (f.format === 'uri') {
      try {
        const u = new URL(v);
        if (
          !['https:', 'http:'].includes(u.protocol) ||
          u.username ||
          u.password ||
          u.hash
        )
          throw new Error();
      } catch {
        fail(`${f.label}: URL inválida.`);
      }
    }
  }
  return value;
}
export function validateConfiguration(
  value: unknown,
  capabilities: Capability[],
  services: SystemService[] = [],
  activeFunctions?: Readonly<Record<string, readonly string[]>>,
) {
  if (!record(value) || Object.keys(value).length > 50)
    return fail('Configuración de sistema inválida.');
  for (const [code, config] of Object.entries(value)) {
    const capability = capabilities.find((c) => c.code === code);
    if (!capability) return fail(`Capacidad desconocida: ${code}.`);
    const schema = parseSchema(
      capability.schema,
      capability.functions?.map((fn) => fn.code),
    );
    const settings = validateCapability(
      config,
      schema,
      activeFunctions?.[code] ?? (activeFunctions ? [] : undefined),
    );
    for (const field of schema.fields) {
      if (
        field.format === 'service' &&
        settings[field.key] !== undefined &&
        settings[field.key] !== ''
      )
        resolveService(services, settings[field.key]);
    }
  }
  return value;
}
export const legalAcceptanceSchema: CapabilitySchema = {
  fields: [
    {
      key: 'identityIssuer',
      label: 'Identidad de origen',
      type: 'string',
      required: true,
      functions: ['collector'],
      format: 'identity-issuer',
      maxLength: 91,
    },
    {
      key: 'productCode',
      label: 'Producto',
      type: 'string',
      required: true,
      functions: ['collector'],
      format: 'code',
      maxLength: 80,
    },
    {
      key: 'contextService',
      label: 'Servicio de verificación',
      type: 'string',
      required: true,
      functions: ['collector'],
      format: 'service',
      maxLength: 80,
    },
  ],
};
export function legalAcceptanceConfiguration(
  value: unknown,
  services: SystemService[],
) {
  if (!record(value))
    throw new BadRequestException(
      'El sistema no tiene configuradas las aceptaciones legales.',
    );
  const core = {
    identityIssuer: value.identityIssuer,
    productCode: value.productCode,
    contextService: value.contextService,
  };
  validateCapability(core, legalAcceptanceSchema);
  return {
    identityIssuer: core.identityIssuer as string,
    productCode: core.productCode as string,
    contextUrl: resolveService(services, core.contextService).url,
  };
}
