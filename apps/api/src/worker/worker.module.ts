import { Module } from "@nestjs/common";
import { PaymentProcessor } from "./payment.processor";
import { WebhookProcessor } from "../webhooks/webhook.processor";
import { DatabaseModule } from "../database/database.module";
import { QueueModule } from "../queue/queue.module";
import { BankModule } from "../bank/bank.module";
import { LoggerModule } from 'nestjs-pino';
import { WorkerMetricsService } from '../metrics/worker-metrics.service';

const loggerModule = LoggerModule.forRoot({});

@Module({

    imports: [DatabaseModule, QueueModule, BankModule, loggerModule],
    providers: [PaymentProcessor, WebhookProcessor, WorkerMetricsService],
})
export class WorkerModule{}
