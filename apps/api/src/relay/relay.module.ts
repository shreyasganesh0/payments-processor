import { Module } from "@nestjs/common";
import { RelayService } from "./relay.service";
import { WebhookDispatcherService } from "../webhooks/webhooks-dispatcher.service";
import { DatabaseModule } from "../database/database.module";
import { QueueModule } from "../queue/queue.module";
import { LoggerModule } from 'nestjs-pino';

const logger = LoggerModule.forRoot({});
@Module({

    imports: [DatabaseModule, QueueModule, logger],
    providers: [RelayService, WebhookDispatcherService],
})
export class RelayModule{}
