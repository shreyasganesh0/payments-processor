import { AppModule } from './app.module';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ProblemDetailFilter } from './common/problem-detail.filter';
import 'reflect-metadata';


async function bootstrap() {

    const app = await NestFactory.create(AppModule);

    app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true
    })); //strip unknown props from req and 400 on extra props
    app.useGlobalFilters(new ProblemDetailFilter()); //exception handling

    await app.listen(3000);
}

bootstrap();
