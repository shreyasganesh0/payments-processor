
import { Module } from "@nestjs/common";
import { WebhooksController } from "./webhooks.controller";
import { WebhookDeliveriesController } from "./webhook-deliveries.controller";
import { WebhooksService } from "./webhooks.service";
import { DatabaseModule } from "../database/database.module";

@Module({

    imports: [DatabaseModule],
    providers: [WebhooksService],
    controllers: [WebhooksController, WebhookDeliveriesController]
})
export class WebhooksModule{}
