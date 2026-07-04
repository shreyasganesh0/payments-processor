import { Controller, Get } from "@nestjs/common";
import { 
    HealthCheck,
    HealthCheckService,
    HealthCheckResult
} from "@nestjs/terminus";

import { PostgresHealthIndicator } from './postgres.health-indicator';


@Controller('health')
export class HealthController {
    constructor(
        private health: HealthCheckService,
        private postgres: PostgresHealthIndicator
    ){}

    @Get('live') live(): {status: string} { return { status : "ok" }; }
    @Get('ready') @HealthCheck() ready(): Promise<HealthCheckResult> {
        return this.health.check([() => this.postgres.pingCheck('postgres')])
    }
}
