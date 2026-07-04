import { STATUS_CODES } from 'http';
import { Catch, HttpException, ArgumentsHost} from '@nestjs/common';
import { Request, Response } from 'express';


@Catch()
export class ProblemDetailFilter {

    catch (exception: unknown, host: ArgumentsHost) {

        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        let detail = "Internal server error occurred";
        let status = 500;
        let errors: string[] | undefined;

        if (exception instanceof HttpException) {

            status = exception.getStatus();
            const responseMsg = exception.getResponse()

            const message = typeof responseMsg === 'string' 
                ? responseMsg
                : (responseMsg as {message?: string | string[] }).message ?? 'Unknown error';

            if (Array.isArray(message)) {

                errors = message;
                detail = 'Validation Error';
            } else {
                detail = message;
            }
        } else {

            console.error(exception);
        }

        const problem = {
            type: 'about:blank',
            title: STATUS_CODES[status],
            status: status,
            detail: detail,
            instance: request.url,
            ...(errors ? { errors } : {}), //omit if undefined used for validation errors
        }

        response.status(status).type('application/problem+json').send(problem);
    }
}
