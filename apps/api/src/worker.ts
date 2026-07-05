import { WorkerModule } from './worker/worker.module';
import { NestFactory } from '@nestjs/core';
import 'reflect-metadata';

async function bootstrap() {

    const worker = await NestFactory.createApplicationContext(WorkerModule);

    worker.enableShutdownHooks();

    setInterval(() => console.log("worker up"), 5000);
}

bootstrap();
