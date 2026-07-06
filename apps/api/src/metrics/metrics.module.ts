import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { makeGaugeProvider } from '@willsoto/nestjs-prometheus';
import { QueueMetricsService } from './queue-metrics.service';

@Module({
    imports: [QueueModule],
    providers: [
        makeGaugeProvider({
            name: 'payments_queue_depth',
            help: 'BullMQ job counts by queue and state',
            labelNames: ['queue', 'state'],
        }),
        QueueMetricsService
    ]
})
export class MetricsModule{};
