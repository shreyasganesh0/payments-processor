import { Injectable, Inject, NotFoundException } from '@nestjs/common';

import { webhookEndpoints, webhookDeliveries } from '../database/schema';
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.types';
import { ListDeliveriesQueryDto } from './dto/list-deliveries.query.dto';

import { ulid } from 'ulid';
import { randomBytes } from 'node:crypto';
import { eq, and, lt, desc, getTableColumns } from 'drizzle-orm';

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


    async list_deliveries({ status, cursor, limit }: ListDeliveriesQueryDto) {

        // drop the heavy `payload` column; join the endpoint url for display
        const { payload, ...rest } = getTableColumns(webhookDeliveries);

        const conds = [];
        if (status) conds.push(eq(webhookDeliveries.status, status));
        if (cursor) conds.push(lt(webhookDeliveries.id, cursor));
        const where = conds.length ? and(...conds) : undefined;

        return await this.db.select({ ...rest, url: webhookEndpoints.url })
            .from(webhookDeliveries)
            .leftJoin(webhookEndpoints, eq(webhookDeliveries.endpointId, webhookEndpoints.id))
            .where(where)
            .orderBy(desc(webhookDeliveries.id))
            .limit(limit + 1);
    }
}


