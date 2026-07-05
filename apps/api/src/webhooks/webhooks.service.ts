import { Injectable, Inject, NotFoundException } from '@nestjs/common';

import { webhookEndpoints } from '../database/schema';
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.types';

import { ulid } from 'ulid';
import { randomBytes } from 'node:crypto';
import { eq, getTableColumns } from 'drizzle-orm';

@Injectable()
export class WebhooksService {

    constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {};

    async insert_endpoint(url: string) {

        const id = ulid();
        const secret = randomBytes(32).toString('hex');

        const [row] = await this.db.insert(webhookEndpoints).values({
            id: id,
            url: url,
            secret: secret,
        }).returning();

        return row;
    }

    async delete(id: string) {

        const rows = await this.db.update(webhookEndpoints).set({ active: false })
            .where(eq(webhookEndpoints.id, id))
            .returning();

        if (rows.length === 0) throw new NotFoundException('Endpoint for given id was not found');

        return rows[0];
    }

    async list() {

        // drop `secret` from the selected columns so it's never returned in a list
        const { secret, ...rest } = getTableColumns(webhookEndpoints);

        return await this.db.select(rest).from(webhookEndpoints)
            .where(eq(webhookEndpoints.active, true));
    }
}
