import { Module } from "@nestjs/common";
import { PaymentProcessor } from "./payment.processor";
import { WebhookProcessor } from "../webhooks/webhook.processor";
import { DatabaseModule } from "../database/database.module";
import { QueueModule } from "../queue/queue.module";
import { BankModule } from "../bank/bank.module";

@Module({

    imports: [DatabaseModule, QueueModule, BankModule],
    providers: [PaymentProcessor, WebhookProcessor],
})
export class WorkerModule{}
