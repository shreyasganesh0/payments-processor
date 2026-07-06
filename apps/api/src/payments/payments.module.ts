
import { Module } from "@nestjs/common";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { DatabaseModule } from "../database/database.module";
import { makeHistogramProvider } from '@willsoto/nestjs-prometheus';

const histogramProvider = makeHistogramProvider({
    name: 'payment_submit_duration_seconds',
    help: 'Latency of POST /v1/payments',
    labelNames: ['outcome'],
    buckets: [0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
});

@Module({

    imports: [DatabaseModule],
    providers: [PaymentsService, histogramProvider],
    controllers: [PaymentsController]
})
export class PaymentsModule{}
