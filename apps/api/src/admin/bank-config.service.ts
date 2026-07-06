import { Injectable, Inject } from '@nestjs/common';

import { bankConfig } from '../database/schema';
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.types';
import { UpdateBankConfigDto } from './dto/update-bank-config.dto';

import { eq } from 'drizzle-orm';

export const BANK_CONFIG_ID = 'singleton';

@Injectable()
export class BankConfigService {

    constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {};

    async get() {

        const [row] = await this.db.select().from(bankConfig)
            .where(eq(bankConfig.id, BANK_CONFIG_ID));

        return row;
    }

    async update(dto: UpdateBankConfigDto) {

        // only patch the fields that were actually provided
        const patch: Partial<typeof bankConfig.$inferInsert> = { updatedAt: new Date() };
        if (dto.mode !== undefined) patch.mode = dto.mode;
        if (dto.latencyMs !== undefined) patch.latencyMs = dto.latencyMs;
        if (dto.failN !== undefined) patch.failN = dto.failN;

        const [row] = await this.db.update(bankConfig).set(patch)
            .where(eq(bankConfig.id, BANK_CONFIG_ID))
            .returning();

        return row;
    }
}
