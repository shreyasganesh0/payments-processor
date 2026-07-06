import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Gauge } from 'prom-client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PAYMENTS_QUEUE, WEBHOOKS_QUEUE } from '../queue/queue.constants';

@Injectable()
export class QueueMetricsService implements OnModuleInit {

    constructor(
      @InjectMetric('payments_queue_depth') private readonly depth: Gauge<string>,
      @InjectQueue(PAYMENTS_QUEUE) private readonly payments: Queue,
      @InjectQueue(WEBHOOKS_QUEUE) private readonly webhooks: Queue,
    ) {}

    onModuleInit() {
        (this.depth as Gauge<string> & { collect: () => Promise<void> }).collect = async () => {
            for (
                const [name, q] of [
                    ['payments', this.payments],
                    ['webhooks', this.webhooks]
                ] as const
            ) {

                const c = await q.getJobCounts('waiting', 'active', 'delayed', 'failed');

                for (const state of ['waiting', 'active', 'delayed', 'failed'] as const) {
                    this.depth.set({ queue: name, state }, c[state] ?? 0);
                }
            }
        };
    }
}
