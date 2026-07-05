
import { Module } from "@nestjs/common";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";
import { DatabaseModule } from "../database/database.module";

@Module({

    imports: [DatabaseModule],
    providers: [WebhooksService],
    controllers: [WebhooksController]
})
export class WebhooksModule{}
