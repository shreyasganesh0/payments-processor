import { Inject, Injectable, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { config } from '../config';
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.types';

const INTERVAL_MS = config.relay.outboxCleanupIntervalMs;
const RETENTION_DAYS = config.relay.outboxRetentionDays;
const AHEAD_DAYS = 7;

@Injectable()
export class OutboxCleanupService implements OnModuleInit, OnApplicationShutdown {

    private timer?: ReturnType<typeof setTimeout>;

    constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

    async onModuleInit() {
        await this.tick();
    }

    onApplicationShutdown() {
        if (this.timer) clearTimeout(this.timer);
    }

    private scheduleNext() {
        this.timer = setTimeout(() => this.tick(), INTERVAL_MS);
    }

    private async tick() {
        try {
            await this.ensurePartitions();
            await this.dropExpired();
        } catch {
        } finally {
            this.scheduleNext();
        }
    }

    private utcDay(offsetDays: number): Date {
        const d = new Date();
        d.setUTCHours(0, 0, 0, 0);
        d.setUTCDate(d.getUTCDate() + offsetDays);
        return d;
    }

    private isoDay(d: Date): string {
        return d.toISOString().slice(0, 10);
    }

    private async ensurePartitions() {
        for (let i = 0; i <= AHEAD_DAYS; i++) {
            const from = this.utcDay(i);
            const to = this.utcDay(i + 1);
            const name = `outbox_p${this.isoDay(from).replace(/-/g, '')}`;
            await this.db.execute(sql.raw(
                `CREATE TABLE IF NOT EXISTS "${name}" PARTITION OF "outbox" ` +
                `FOR VALUES FROM ('${this.isoDay(from)} 00:00:00+00') TO ('${this.isoDay(to)} 00:00:00+00')`,
            ));
        }
    }

    private async dropExpired() {
        const cutoff = this.utcDay(-RETENTION_DAYS);
        const res = await this.db.execute(sql.raw(
            `SELECT c.relname AS name FROM pg_inherits i ` +
            `JOIN pg_class c ON c.oid = i.inhrelid ` +
            `JOIN pg_class p ON p.oid = i.inhparent WHERE p.relname = 'outbox'`,
        ));
        for (const part of res.rows as Array<{ name: string }>) {
            const m = /^outbox_p(\d{4})(\d{2})(\d{2})$/.exec(part.name);
            if (!m) continue;
            const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
            if (day < cutoff) {
                await this.db.execute(sql.raw(`DROP TABLE IF EXISTS "${part.name}"`));
            }
        }
    }
}
