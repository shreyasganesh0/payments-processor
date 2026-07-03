import { AppModule } from './app.module';
import { NestFactory } from '@nestjs/core';
import { PaymentStatus } from '@payments/shared';
import 'reflect-metadata';

async function bootstrap() {

    const relay = await NestFactory.createApplicationContext(AppModule);

    const status: PaymentStatus = "PENDING";
    console.log(status);

    setInterval(() => console.log("relay up"), 5000);

}

bootstrap();
