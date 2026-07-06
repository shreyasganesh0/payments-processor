import { AppModule } from './app.module';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ProblemDetailFilter } from './common/problem-detail.filter';
import 'reflect-metadata';
import { Logger } from 'nestjs-pino';


async function bootstrap() {

    const app = await NestFactory.create(AppModule, { bufferLogs: true });

    app.useLogger(app.get(Logger));

    app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true
    })); //strip unknown props from req and 400 on extra props
    app.useGlobalFilters(new ProblemDetailFilter()); //exception handling

    app.enableCors({ origin: 'http://localhost:3001' });
    await app.listen(3000);
}

bootstrap();
