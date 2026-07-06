
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.types';
import { outbox } from '../database/schema';
import { PAYMENTS_QUEUE } from '../queue/queue.constants';
import {
    Inject,
    Injectable,
    OnModuleInit,
    OnApplicationShutdown
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { inArray, isNull, and, eq } from 'drizzle-orm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class RelayService implements OnModuleInit, OnApplicationShutdown {

    private timer?: ReturnType<typeof setTimeout>;

    constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB,
                @InjectQueue(PAYMENTS_QUEUE) private readonly queue: Queue,
                @InjectPinoLogger(RelayService.name) private readonly logger: PinoLogger
               ) {};

    async onModuleInit() {

        this.scheduleNext();
    }

    private async tick() {

        try { await this.poll_once(); }
        catch(err) { console.error(err); }
        finally { this.scheduleNext(); }
    }
    
    private scheduleNext() {

        this.timer = setTimeout(() => this.tick(), 5000);
    }

    private async poll_once(): Promise<number> {
        
        return await this.db.transaction(async tx => {

            //rows to submit
            const rows = await tx.select().from(outbox)
            .where(and(
                isNull(outbox.publishedAt), eq(outbox.eventType, 'payment.submitted')
            ))
            .orderBy(outbox.createdAt).limit(100).for('update', { skipLocked: true});

            //submit rows to queue
            await Promise.all(rows.map(row => {
                this.logger.info(
                    {
                        correlationId: (row.payload as { correlationId?: string }).correlationId,
                        outboxId: row.id,
                        eventType: row.eventType
                    },
                    'relay published event'
                );
                return this.queue.add(row.eventType, row.payload, { jobId: row.id });
            }));

            const published_ids = rows.map(row => row.id);

            if (published_ids.length === 0) return 0;
            //update outbox as published
            await tx.update(outbox).set({ publishedAt: new Date() })
                .where(inArray(outbox.id, published_ids));

            return rows.length;
        });
    }

    onApplicationShutdown(signal?: string) {

        clearTimeout(this.timer);
    }
}
