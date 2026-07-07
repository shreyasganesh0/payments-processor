import { Module } from "@nestjs/common";
import { RelayService } from "./relay.service";
import { ReaperService } from "./reaper.service";
import { WebhookDispatcherService } from "../webhooks/webhooks-dispatcher.service";
import { WebhookReaperService } from "../webhooks/webhook-reaper.service";
import { DatabaseModule } from "../database/database.module";
import { QueueModule } from "../queue/queue.module";
import { LoggerModule } from 'nestjs-pino';

const logger = LoggerModule.forRoot({});
@Module({

    imports: [DatabaseModule, QueueModule, logger],
    providers: [RelayService, ReaperService, WebhookDispatcherService, WebhookReaperService],
})
export class RelayModule{}
