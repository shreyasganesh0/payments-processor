import { RelayModule } from './relay/relay.module';
import { NestFactory } from '@nestjs/core';
import 'reflect-metadata';

async function bootstrap() {

    const relay = await NestFactory.createApplicationContext(RelayModule);

    relay.enableShutdownHooks();

    setInterval(() => console.log("relay up"), 5000);

}

bootstrap();
