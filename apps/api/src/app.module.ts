import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { PaymentsModule } from "./payments/payments.module";
import { WebhooksModule } from "./webhooks/webhooks.module";

@Module({

    imports: [HealthModule, PaymentsModule, WebhooksModule]
})
export class AppModule{}
