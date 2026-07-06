import { WorkerModule } from './worker/worker.module';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import 'reflect-metadata';
import { createServer } from 'node:http';
import { register, collectDefaultMetrics } from 'prom-client';
import { WORKER_METRICS_PORT } from './worker/worker.constants';

async function bootstrap() {

    const worker = await NestFactory.createApplicationContext(
        WorkerModule,
        { bufferLogs: true }
    );
    collectDefaultMetrics();
    createServer(async (req, res) => {
        if (req.url === '/metrics') {
            res.setHeader('Content-Type', register.contentType);
            res.end(await register.metrics());
        } else { res.statusCode = 404; res.end(); }
    })
    .listen(WORKER_METRICS_PORT,
        () => console.log(`worker metrics on ${WORKER_METRICS_PORT}`));

    worker.useLogger(worker.get(Logger));

    worker.enableShutdownHooks();

    setInterval(() => console.log("worker up"), 5000);
}

bootstrap();
