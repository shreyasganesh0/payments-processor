import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { HealthController } from "./health.controller";
import { PostgresHealthIndicator } from "./postgres.health-indicator";
import { DatabaseModule } from "../database/database.module";

@Module({

    imports: [TerminusModule, DatabaseModule],
    providers: [PostgresHealthIndicator],
    controllers: [HealthController]
})
export class HealthModule{}
