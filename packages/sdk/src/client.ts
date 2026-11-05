import {
  MachineClient,
  MachineClientError,
  type MachineClientConfig,
} from '@hemia/auth';
import type {
  DocumentSetQuery,
  DocumentSetSnapshot,
  EvidenceReceipt,
  RecordEvidenceInput,
} from './contracts';
import { locale, receipt, setKey, snapshot, uuid } from './validation';

export type LegalClientOptions = {
  /** Root URL before the v1/legal routes. May include a reverse proxy prefix. */
  baseUrl: string;
  auth?: Pick<
    MachineClientConfig,
    'issuer' | 'tokenUrl' | 'clientId' | 'clientSecret' | 'tokenTimeoutMs'
  > & {
    audience?: string;
    resource?: string;
  };
  requestTimeoutMs?: number;
  allowHttpLoopback?: boolean;
};

export class LegalSdkError extends Error {
  constructor(
    public readonly code:
      'configuration' | 'authentication' | 'transport' | 'http' | 'contract',
    public readonly status?: number,
  ) {
    super(
      status === undefined
        ? `Legal SDK: ${code}`
        : `Legal SDK: ${code} (HTTP ${status})`,
    );
    this.name = 'LegalSdkError';
  }
}

const evidenceScope = 'legal.integration.acceptances.create';

async function json(response: Response, limit: number): Promise<unknown> {
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new LegalSdkError('http', response.status);
  }
  if (
    !response.body ||
    !response.headers
      .get('content-type')
      ?.toLowerCase()
      .includes('application/json')
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new LegalSdkError('contract');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new LegalSdkError('contract');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof LegalSdkError) throw error;
    throw new LegalSdkError('transport');
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new LegalSdkError('contract');
  }
}

export function createLegalClient(options: LegalClientOptions) {
  const timeout = options.requestTimeoutMs ?? 8_000;
  let base: URL;
  let machine: MachineClient | undefined;
  try {
    base = new URL(options.baseUrl);
    const allowLoopback =
      options.allowHttpLoopback === true &&
      process.env.NODE_ENV !== 'production' &&
      base.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
    if (
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      (base.protocol !== 'https:' && !allowLoopback) ||
      !Number.isInteger(timeout) ||
      timeout < 1 ||
      timeout > 30_000
    ) {
      throw new LegalSdkError('configuration');
    }
    if (!base.pathname.endsWith('/')) base.pathname += '/';
    const auth = options.auth;
    if (auth) {
      machine = new MachineClient({
        issuer: auth.issuer,
        tokenUrl: auth.tokenUrl,
        clientId: auth.clientId,
        clientSecret: auth.clientSecret,
        tokenTimeoutMs: auth.tokenTimeoutMs,
        allowHttpLoopback: options.allowHttpLoopback,
        requestTimeoutMs: timeout,
        destinations: {
          evidence: {
            baseUrl: base.href,
            audience: auth.audience ?? 'legal-api',
            resource: auth.resource ?? base.origin,
            scopes: [evidenceScope],
          },
        },
      });
    }
  } catch {
    throw new LegalSdkError('configuration');
  }

  return {
    async getDocumentSet(
      query: DocumentSetQuery,
    ): Promise<DocumentSetSnapshot> {
      if (
        !query ||
        !uuid(query.applicationId) ||
        typeof query.documentSetKey !== 'string' ||
        !setKey.test(query.documentSetKey) ||
        typeof query.locale !== 'string' ||
        !locale.test(query.locale)
      ) {
        throw new LegalSdkError('configuration');
      }
      const url = new URL(
        `v1/legal/public/${query.applicationId}/document-sets/${query.documentSetKey}`,
        base,
      );
      url.searchParams.set('locale', query.locale);
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { accept: 'application/json' },
          credentials: 'omit',
          redirect: 'error',
          signal: AbortSignal.timeout(timeout),
        });
      } catch {
        throw new LegalSdkError('transport');
      }
      const value = await json(response, 2 * 1024 * 1024);
      if (!snapshot(value, query)) throw new LegalSdkError('contract');
      return value;
    },

    async recordEvidence(input: RecordEvidenceInput): Promise<EvidenceReceipt> {
      if (
        !machine ||
        !input ||
        !uuid(input.snapshotToken) ||
        !uuid(input.idempotencyKey)
      ) {
        throw new LegalSdkError('configuration');
      }
      let response: Response;
      try {
        response = await machine.request(
          'evidence',
          'v1/legal/integrations/evidence',
          {
            method: 'POST',
            headers: {
              accept: 'application/json',
              'content-type': 'application/json',
            },
            body: JSON.stringify(input),
          },
        );
      } catch (error) {
        if (error instanceof MachineClientError) {
          throw new LegalSdkError(
            error.stage === 'token' ? 'authentication' : 'transport',
            error.status,
          );
        }
        throw new LegalSdkError('transport');
      }
      const value = await json(response, 16 * 1024);
      if (!receipt(value, input.snapshotToken))
        throw new LegalSdkError('contract');
      return value;
    },
  };
}
