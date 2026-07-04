import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { PaymentsModule } from "./payments/payments.module";

@Module({

    imports: [HealthModule, PaymentsModule]
})
export class AppModule{}
