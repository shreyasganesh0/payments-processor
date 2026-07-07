import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { REDIS_URL, PAYMENTS_QUEUE, WEBHOOKS_QUEUE } from './queue.constants';

const conn = BullModule.forRoot({ connection: { url: REDIS_URL}});
const queue = BullModule.registerQueue(
    { name: PAYMENTS_QUEUE },
    {
        name: WEBHOOKS_QUEUE,
        // webhook_deliveries (Postgres) is the source of truth for delivery state, so a
        // terminal BullMQ job carries no authority — evict it. This also frees the stable
        // jobId the reaper reconstructs (`<id>` / `<id>:retry:<n>`), so a lingering
        // completed/failed job can never wedge a re-drive. (Payments queue keeps defaults.)
        defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
    },
);

@Module({

    imports: [conn, queue],
    exports: [BullModule]
})
export class QueueModule{};


