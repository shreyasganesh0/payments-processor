import { Module } from "@nestjs/common";
import { PaymentProcessor } from "./payment.processor";
import { DatabaseModule } from "../database/database.module";
import { QueueModule } from "../queue/queue.module";

@Module({

    imports: [DatabaseModule, QueueModule],
    providers: [PaymentProcessor],
})
export class WorkerModule{}
