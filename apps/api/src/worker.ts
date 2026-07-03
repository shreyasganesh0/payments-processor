import { AppModule } from './app.module';
import { NestFactory } from '@nestjs/core';
import 'reflect-metadata';

async function bootstrap() {

    const worker = await NestFactory.createApplicationContext(AppModule);

    setInterval(() => console.log("worker up"), 5000);
}

bootstrap();
