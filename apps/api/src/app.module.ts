import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { PaymentsModule } from "./payments/payments.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { LoggerModule } from 'nestjs-pino';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsModule } from './metrics/metrics.module';
import { AdminModule } from './admin/admin.module';
import { ulid } from 'ulid';

const prometheusModule = PrometheusModule.register();
const logger = LoggerModule.forRoot({ 
    pinoHttp: {
        genReqId: (req, res) => {
            const id = (req.headers['x-correlation-id'] as string)?.trim() || ulid();
            res.setHeader('X-Correlation-Id', id);
            return id;
        }, // set id from header or mint from ulid

        //moves req.id to a top level field for grep
        customProps: (req) => ({ correlationId: req.id }) 
}});

@Module({

    imports: [HealthModule, PaymentsModule, WebhooksModule, prometheusModule, MetricsModule, AdminModule, logger]
})
export class AppModule{}
