import { RelayModule } from './relay/relay.module';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import 'reflect-metadata';

async function bootstrap() {

    const relay = await NestFactory.createApplicationContext(
        RelayModule,
        { bufferLogs: true }
    );
    relay.useLogger(relay.get(Logger));
    relay.enableShutdownHooks();

    setInterval(() => console.log("relay up"), 5000);

}

bootstrap();
