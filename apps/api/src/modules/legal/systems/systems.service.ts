import {
  parseFunctions,
  clientHasFunction,
  scopeKey,
} from './capability-functions';
import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import type {
  LegalActor,
  LegalRequest,
} from '../../../common/types/legal-request';
import { grantsFor } from '../authorization/legal-authorization';
import { IntegrationClientsService } from '../integrations/registry/integration-clients.service';
import { verificationAddress } from '../integrations/acceptance/verification-http';
import {
  serviceUrl,
  validateServices,
  type SystemService,
} from './system-services';
import {
  parseSchema,
  validateConfiguration,
  legalAcceptanceConfiguration,
  legalAcceptanceSchema,
  type Capability,
} from './capability-schema';
import type { SaveSystemDto, SaveCapabilityDto } from './systems.dto';
export type SystemRow = {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
  configuration: Record<string, unknown>;
  services: SystemService[];
};
export type SystemClient = {
  oauthIssuer: string;
  clientId: string;
  roles: string[];
  capabilityCode: string;
  enabled: boolean;
};
const lockCatalog = (m: EntityManager) =>
  m.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('legal.system-catalog',0))",
  );
@Injectable()
export class SystemsService {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly directory: IntegrationClientsService,
  ) {}
  capabilities(
    manager: DataSource | EntityManager = this.db,
  ): Promise<Capability[]> {
    return manager.query(
      'SELECT code,name,schema,functions FROM system_capabilities ORDER BY name,code',
    );
  }
  async clients(
    id: string,
    m: DataSource | EntityManager = this.db,
  ): Promise<SystemClient[]> {
    return m.query(
      'SELECT oauth_issuer AS "oauthIssuer", client_id AS "clientId", capability_code AS "capabilityCode",roles,enabled FROM system_clients WHERE system_id=$1 ORDER BY capability_code,client_id',
      [id],
    );
  }
  async list() {
    const rows: SystemRow[] = await this.db.query(
      'SELECT * FROM systems ORDER BY name,id',
    );
    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        clients: await this.clients(row.id),
      })),
    );
  }
  async options(req: LegalRequest) {
    if (!req.actor.authorization)
      throw new BadRequestException('Legal authorization required');
    const permissions = [
      'legal.integrations.create',
      'legal.integrations.edit',
      'legal.integrations.view',
    ];
    let allowed = false;
    for (const p of permissions) {
      try {
        if (grantsFor(req.actor.authorization, p).length) allowed = true;
      } catch {
        /* Other grants may authorize discovery. */
      }
    }
    if (!allowed) throw new ForbiddenException();
    return this.db.query<Array<{ id: string; name: string; code: string }>>(
      "SELECT id,name,code FROM systems WHERE enabled AND configuration ? 'legalAcceptances' AND EXISTS(SELECT 1 FROM jsonb_array_elements(systems.services) service WHERE service->>'code'=systems.configuration->'legalAcceptances'->>'contextService' AND service->>'enabled'='true' AND length(service->>'audience')>0) AND EXISTS(SELECT 1 FROM system_clients c WHERE c.system_id=systems.id AND c.enabled AND c.capability_code='legalAcceptances' AND 'collector'=ANY(c.roles)) ORDER BY name,id",
    );
  }
  async get(id: string, m: DataSource | EntityManager = this.db) {
    const [row]: SystemRow[] = await m.query(
      'SELECT * FROM systems WHERE id=$1',
      [id],
    );
    if (!row) throw new NotFoundException('Sistema no encontrado.');
    return row;
  }
  private async validateVerificationUrl(value: string) {
    const url = serviceUrl(this.config, value);
    try {
      await verificationAddress(
        url,
        this.config.get<boolean>('legalIntegrations.production', true),
      );
    } catch {
      throw new BadRequestException(
        'Los destinos autorizados de verificación deben resolver a direcciones públicas y usar HTTPS; solo se permite loopback HTTP en desarrollo.',
      );
    }
    return url;
  }
  async serviceDestination(value: string) {
    const url = await this.validateVerificationUrl(value);
    return { resource: url.origin };
  }
  async choices() {
    return {
      clients: await this.directory.directory(),
      oauthIssuer: this.config.getOrThrow<string>('sso.issuer'),
      verificationClientId: this.config.get<string>(
        'legalService.clientId',
        '',
      ),
    };
  }
  async saveCapability(dto: SaveCapabilityDto, actor: LegalActor) {
    if (!dto.name.trim())
      throw new BadRequestException('Escribe el nombre de la capacidad.');
    const functions = parseFunctions(dto.functions);
    const schema = parseSchema(
      dto.schema,
      functions.map((fn) => fn.code),
    );
    const scopes = functions.length ? await this.directory.scopeCatalog() : [];
    for (const fn of functions)
      for (const ref of fn.scopes)
        if (!scopes.some((s) => scopeKey(s) === scopeKey(ref)))
          throw new BadRequestException(
            'Selecciona permisos registrados en Identity.',
          );
    if (dto.code === 'legalAcceptances') {
      for (const [role, required] of Object.entries({
        collector: [
          'legal.integration.acceptances.prepare',
          'legal.integration.acceptances.create',
        ],
        validator: ['legal.integration.acceptances.validate'],
      })) {
        const fn = functions.find((f) => f.code === role);
        if (
          !fn ||
          required.some(
            (code) =>
              !fn.scopes.some(
                (s) => s.audience === 'legal-api' && s.code === code,
              ),
          )
        )
          throw new BadRequestException(
            'Conserva las funciones y permisos requeridos por el contrato de aceptaciones legales.',
          );
      }

      if (
        !functions
          .find((fn) => fn.code === 'collector')
          ?.scopes.some(
            (scope) =>
              scope.audience === 'identity-api' &&
              scope.code === 'identity.tokens.introspect',
          )
      )
        throw new BadRequestException(
          'Conserva el permiso de introspección de Identity para verificar las llamadas de contexto legal.',
        );

      for (const core of legalAcceptanceSchema.fields) {
        const field = schema.fields.find((f) => f.key === core.key);
        if (
          !field ||
          !field.required ||
          (field.functions !== undefined &&
            !field.functions.includes('collector')) ||
          field.type !== core.type ||
          field.format !== core.format ||
          !field.maxLength ||
          field.maxLength > core.maxLength!
        )
          throw new BadRequestException(
            'Conserva los campos obligatorios y sus validaciones para aceptaciones legales.',
          );
      }
    }
    return this.db.transaction(async (m) => {
      await lockCatalog(m);
      const [old]: Capability[] = await m.query(
        'SELECT code,name,schema,functions FROM system_capabilities WHERE code=$1',
        [dto.code],
      );
      const bindings: { roles: string[] }[] = await m.query(
        'SELECT roles FROM system_clients WHERE capability_code=$1',
        [dto.code],
      );
      if (
        bindings.some((binding) =>
          binding.roles.some(
            (role) => !functions.some((fn) => fn.code === role),
          ),
        )
      )
        throw new ConflictException(
          'Una función tiene clientes asociados. Reasígnalos antes de eliminarla.',
        );
      const schemas = [
        ...(await this.capabilities(m)).filter((c) => c.code !== dto.code),
        { code: dto.code, name: dto.name, schema, functions },
      ];
      const systems: SystemRow[] = await m.query('SELECT * FROM systems');
      for (const system of systems) {
        const clients = system.enabled
          ? (await this.clients(system.id, m)).filter(
              (client) => client.enabled,
            )
          : [];
        validateConfiguration(
          system.configuration,
          schemas,
          system.services,
          Object.fromEntries(
            schemas.map((capability) => [
              capability.code,
              clients
                .filter((client) => client.capabilityCode === capability.code)
                .flatMap((client) => client.roles),
            ]),
          ),
        );
      }
      const [saved]: Capability[] = await m.query(
        'INSERT INTO system_capabilities(code,name,schema,functions) VALUES($1,$2,$3::jsonb,$4::jsonb) ON CONFLICT(code) DO UPDATE SET name=excluded.name,schema=excluded.schema,functions=excluded.functions,updated_at=now() RETURNING code,name,schema,functions',
        [
          dto.code,
          dto.name.trim(),
          JSON.stringify(schema),
          JSON.stringify(functions),
        ],
      );
      await this.audit(m, actor, 'legal.system_capability.save', null, {
        code: dto.code,
        before: old ?? null,
        after: saved,
      });
      return saved;
    });
  }
  async save(
    dto: SaveSystemDto,
    actor: LegalActor,
    id?: string,
    validateOnly = false,
  ) {
    if (!dto.name.trim())
      throw new BadRequestException('Escribe el nombre del sistema.');
    if (
      new Set(
        dto.clients.map((c) =>
          JSON.stringify([c.oauthIssuer, c.clientId, c.capabilityCode]),
        ),
      ).size !== dto.clients.length
    )
      throw new BadRequestException('Clientes duplicados.');
    const services = validateServices(dto.services, this.config);
    await Promise.all(
      services
        .filter((service) => dto.enabled && service.enabled)
        .map((service) => this.validateVerificationUrl(service.url)),
    );
    const enabledClients = dto.enabled
      ? dto.clients.filter(
          (c) =>
            c.enabled && Object.hasOwn(dto.configuration, c.capabilityCode),
        )
      : [];
    const [options, scopeCatalog] = enabledClients.length
      ? await Promise.all([
          this.directory.directory(),
          this.directory.scopeCatalog(),
        ])
      : [[], []];
    return this.db.transaction(async (m) => {
      await lockCatalog(m);
      const capabilities = await this.capabilities(m);
      const configuration = validateConfiguration(
        dto.configuration,
        capabilities,
        services,
        Object.fromEntries(
          capabilities.map((capability) => [
            capability.code,
            enabledClients
              .filter((client) => client.capabilityCode === capability.code)
              .flatMap((client) => client.roles),
          ]),
        ),
      );
      for (const binding of dto.clients) {
        if (
          !Array.isArray(binding.roles) ||
          !binding.roles.length ||
          binding.roles.length > 30 ||
          new Set(binding.roles).size !== binding.roles.length
        )
          throw new BadRequestException(
            'Selecciona funciones únicas para cada cliente.',
          );
        const capability = capabilities.find(
          (cap) => cap.code === binding.capabilityCode,
        );
        for (const role of binding.roles) {
          const fn = capability?.functions?.find((f) => f.code === role);
          if (!fn)
            throw new BadRequestException(
              'Selecciona una capacidad y funciones registradas para cada cliente.',
            );
          if (
            binding.enabled &&
            dto.enabled &&
            Object.hasOwn(configuration, binding.capabilityCode)
          ) {
            const client = options.find(
              (c) =>
                c.clientId === binding.clientId &&
                c.oauthIssuer === binding.oauthIssuer,
            );
            if (
              !client ||
              (!validateOnly && !clientHasFunction(client, fn, scopeCatalog))
            )
              throw new BadRequestException(
                `El cliente ${binding.clientId} no tiene los permisos de todas sus funciones.`,
              );
          }
        }
      }
      if (
        enabledClients.some(
          (client) =>
            client.capabilityCode === 'legalAcceptances' &&
            client.roles.includes('collector'),
        )
      ) {
        legalAcceptanceConfiguration(configuration.legalAcceptances, services);
      }
      const old = id ? await this.get(id, m) : null;
      if (old && old.code !== dto.code)
        throw new ConflictException('El código del sistema es fijo.');
      if (old) {
        const linked: unknown[] = await m.query(
          'SELECT id FROM external_identity_sources WHERE system_id=$1',
          [old.id],
        );
        const before = old.configuration.legalAcceptances as
          Record<string, unknown> | undefined;
        const after = configuration.legalAcceptances as
          Record<string, unknown> | undefined;
        if (
          linked.length &&
          (!after ||
            before?.identityIssuer !== after.identityIssuer ||
            before?.productCode !== after.productCode)
        )
          throw new ConflictException(
            'La identidad y el producto no pueden cambiar mientras existan integraciones vinculadas.',
          );
      }
      if (validateOnly) return { ...dto, validated: true as const };
      let saved: SystemRow;
      try {
        [saved] = id
          ? await m.query(
              'WITH updated AS (UPDATE systems SET name=$1,enabled=$2,configuration=$3::jsonb,services=$5::jsonb,updated_at=now() WHERE id=$4 RETURNING *) SELECT * FROM updated',
              [
                dto.name.trim(),
                dto.enabled,
                JSON.stringify(configuration),
                id,
                JSON.stringify(services),
              ],
            )
          : await m.query(
              'INSERT INTO systems(code,name,enabled,configuration,services) VALUES($1,$2,$3,$4::jsonb,$5::jsonb) RETURNING *',
              [
                dto.code,
                dto.name.trim(),
                dto.enabled,
                JSON.stringify(configuration),
                JSON.stringify(services),
              ],
            );
      } catch (e) {
        if ((e as { code?: string }).code === '23505')
          throw new ConflictException(
            'El código o la identidad de origen ya están registrados.',
          );
        throw e;
      }
      await m.query('DELETE FROM system_clients WHERE system_id=$1', [
        saved.id,
      ]);
      for (const c of dto.clients)
        await m.query(
          'INSERT INTO system_clients(system_id,oauth_issuer,client_id,roles,enabled,capability_code) VALUES($1,$2,$3,$4,$5,$6)',
          [
            saved.id,
            c.oauthIssuer,
            c.clientId,
            c.roles,
            c.enabled,
            c.capabilityCode,
          ],
        );
      // Catalog edits must not implicitly broaden existing machine policies.
      const authenticatedMode =
        this.config.get<string>('authorization.mode', 'roles') ===
        'authenticated';
      const selectedOrganization =
        actor.authorization?.authenticatedOrganizationId;
      const boundHuman =
        selectedOrganization &&
        actor.authorization!.expiresAt > Math.floor(Date.now() / 1000);
      if (!authenticatedMode || boundHuman) {
        const sourceScope = authenticatedMode
          ? ' AND EXISTS (SELECT 1 FROM external_identity_source_organizations own WHERE own.source_id=s.id AND own.organization_id=$2) AND NOT EXISTS (SELECT 1 FROM external_identity_source_organizations other WHERE other.source_id=s.id AND other.organization_id<>$2)'
          : '';
        const parameters = authenticatedMode
          ? [saved.id, selectedOrganization]
          : [saved.id];
        // Keep source client IDs stable: historical evidence references them.
        await m.query(
          `UPDATE external_identity_source_clients SET enabled=false WHERE source_id IN (SELECT s.id FROM external_identity_sources s WHERE s.system_id=$1${sourceScope})`,
          parameters,
        );
        await m.query(
          `INSERT INTO external_identity_source_clients(source_id,oauth_issuer,client_id,roles,enabled)
          SELECT s.id,c.oauth_issuer,c.client_id,ARRAY(SELECT role FROM unnest(c.roles) role WHERE role IN ('collector','validator')),c.enabled FROM external_identity_sources s JOIN system_clients c ON c.system_id=s.system_id WHERE s.system_id=$1${sourceScope} AND c.capability_code='legalAcceptances' AND c.roles && ARRAY['collector','validator']::text[]
          ON CONFLICT(source_id,oauth_issuer,client_id) DO UPDATE SET roles=excluded.roles,enabled=excluded.enabled`,
          parameters,
        );
      }
      await this.audit(m, actor, 'legal.system.save', saved.id, {
        before: old,
        after: saved,
        clients: dto.clients,
      });
      return { ...saved, clients: dto.clients };
    });
  }
  private async audit(
    m: EntityManager,
    actor: LegalActor,
    action: string,
    id: string | null,
    metadata: unknown,
  ) {
    await m.query(
      `INSERT INTO audit_events(trace_id,actor_identity_issuer,actor_subject_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,'system',$6,$7::jsonb)`,
      [
        actor.traceId,
        actor.identityIssuer,
        actor.subjectId,
        actor.actorType,
        action,
        id,
        JSON.stringify(metadata),
      ],
    );
  }
}
