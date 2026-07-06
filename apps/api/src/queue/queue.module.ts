import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { REDIS_URL, PAYMENTS_QUEUE, WEBHOOKS_QUEUE } from './queue.constants';

const conn = BullModule.forRoot({ connection: { url: REDIS_URL}});
const queue = BullModule.registerQueue({ name: PAYMENTS_QUEUE }, { name: WEBHOOKS_QUEUE });

@Module({

    imports: [conn, queue],
    exports: [BullModule]
})
export class QueueModule{};


