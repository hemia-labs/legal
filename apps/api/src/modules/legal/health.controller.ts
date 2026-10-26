import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type Redis from 'ioredis';
import type { Response } from 'express';
import { REDIS } from '../auth/redis/redis-session-store';
import { LegalEventBusClient } from './event-bus/legal-event-bus.client';

@Controller('health')
export class LegalHealthController {
  constructor(
    private readonly db: DataSource,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly bus: LegalEventBusClient,
    private readonly config: ConfigService,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const reason = await Promise.race([
        this.check(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), 3000);
        }),
      ]);
      if (reason) {
        response.status(503);
        return { status: 'unavailable', reason };
      }
      return { status: 'ok' };
    } catch {
      response.status(503);
      return { status: 'unavailable', reason: 'dependency_unavailable' };
    } finally {
      clearTimeout(timer);
    }
  }

  private async check() {
    // Readiness only reads schema state; it must never create the migrations table.
    const [table]: { name: string | null }[] = await this.db.query(
      "SELECT to_regclass('public.migrations') AS name",
    );
    if (!table.name) return 'pending_migrations';
    const applied: { name: string }[] = await this.db.query(
      'SELECT name FROM migrations',
    );
    const names = new Set(applied.map((migration) => migration.name));
    if (
      this.db.migrations.some(
        (migration) => !names.has(migration.name ?? migration.constructor.name),
      )
    )
      return 'pending_migrations';
    if ((await this.redis.ping()) !== 'PONG')
      throw new Error('Redis unavailable');
    if (this.config.get<boolean>('eventBus.required')) {
      const bus = await this.bus.connect();
      await bus.ping();
    }
    return null;
  }
}
