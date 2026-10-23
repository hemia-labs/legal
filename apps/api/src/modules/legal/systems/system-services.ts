import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SystemService = {
  code: string;
  name: string;
  url: string;
  enabled: boolean;
  audience: string;
  resource: string;
};
export function serviceUrl(config: ConfigService, value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException('URL de servicio inválida.');
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
        !config.get<boolean>('legalIntegrations.production')
      ))
  )
    throw new BadRequestException(
      'Usa HTTPS y una URL sin credenciales, parámetros ni fragmentos.',
    );
  return url;
}
export function validateServices(
  value: SystemService[],
  config: ConfigService,
) {
  if (!Array.isArray(value) || value.length > 100)
    throw new BadRequestException('Define hasta 100 servicios por sistema.');
  const codes = new Set<string>();
  for (const s of value) {
    if (
      !s ||
      typeof s.code !== 'string' ||
      !/^[a-z][a-z0-9_-]{1,79}$/.test(s.code) ||
      ['constructor', 'prototype', '__proto__'].includes(s.code) ||
      codes.has(s.code) ||
      typeof s.name !== 'string' ||
      !s.name.trim() ||
      s.name.length > 200 ||
      typeof s.url !== 'string' ||
      s.url.length > 2048 ||
      typeof s.enabled !== 'boolean' ||
      typeof s.audience !== 'string' ||
      !/^\S{1,160}$/.test(s.audience) ||
      typeof s.resource !== 'string'
    )
      throw new BadRequestException('Servicio inválido o código duplicado.');
    codes.add(s.code);
    const url = serviceUrl(config, s.url);
    if (s.resource !== url.origin)
      throw new BadRequestException(
        'El recurso OAuth debe ser el origen del servicio.',
      );
  }
  return value.map((s) => ({
    code: s.code,
    name: s.name.trim(),
    url: s.url,
    enabled: s.enabled,
    audience: s.audience,
    resource: s.resource,
  }));
}
export function resolveService(services: SystemService[], code: unknown) {
  const service = services.find((s) => s.code === code && s.enabled);
  if (!service)
    throw new BadRequestException(
      'Selecciona un servicio habilitado de este sistema.',
    );
  return service;
}

export function resolveVerificationService(
  services: SystemService[],
  code: unknown,
) {
  const service = resolveService(services, code);
  if (!service.audience || service.resource !== new URL(service.url).origin)
    throw new BadRequestException(
      'Configura el destino OAuth de este servicio desde Console.',
    );
  return service;
}
