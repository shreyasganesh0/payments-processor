import {
    Inject,
    Injectable,
    OnModuleInit,
    OnApplicationShutdown,
} from '@nestjs/common';

import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.types';
import { BANK } from './bank.constants';
import { SimulatedBankAdapter } from './simulated-bank.adapter';
import { bankConfig } from '../database/schema';
import { BANK_CONFIG_ID } from '../admin/bank-config.service';

import { eq } from 'drizzle-orm';

const SYNC_INTERVAL_MS = 2000;

// Runs IN THE WORKER PROCESS. The chaos endpoint (API process) writes the
// bank_config row; this poll reads it and pushes it onto the in-memory sim
// adapter via setConfig — the cross-process control path (mirrors RelayService).
@Injectable()
export class BankConfigSyncService implements OnModuleInit, OnApplicationShutdown {

    private timer?: ReturnType<typeof setTimeout>;
    private lastAppliedAt: Date | null = null;

    constructor(
        @Inject(DRIZZLE) private readonly db: DrizzleDB,
        @Inject(BANK) private readonly bank: SimulatedBankAdapter,
    ) {};

    onModuleInit() {
        this.scheduleNext();
    }

    private scheduleNext() {
        this.timer = setTimeout(() => this.tick(), SYNC_INTERVAL_MS);
    }

    private async tick() {
        try { await this.sync_once(); }
        catch { /* swallow — a bad poll must not kill the loop */ }
        finally { this.scheduleNext(); }
    }

    private async sync_once() {
        const [row] = await this.db.select().from(bankConfig)
            .where(eq(bankConfig.id, BANK_CONFIG_ID));
        if (!this.lastAppliedAt || this.lastAppliedAt < row.updatedAt) {
            this.bank.setConfig({ mode: row.mode, failN: row.failN, latencyMs: row.latencyMs });
        }
        this.lastAppliedAt = row.updatedAt;
    }

    onApplicationShutdown() {
        clearTimeout(this.timer);
    }
}
