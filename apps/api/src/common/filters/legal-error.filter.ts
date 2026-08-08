import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigError, UnauthorizedError } from '@hemia/auth';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import { LegalRequest } from '../types/legal-request';

@Catch()
export class LegalErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<LegalRequest>();
    const response = ctx.getResponse<Response>();
    const status =
      exception instanceof UnauthorizedError
        ? HttpStatus.UNAUTHORIZED
        : exception instanceof ConfigError
          ? HttpStatus.INTERNAL_SERVER_ERROR
          : exception instanceof HttpException
            ? exception.getStatus()
            : HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      code: codeFor(status),
      message:
        exception instanceof UnauthorizedError ||
        exception instanceof ConfigError
          ? exception.message
          : exception instanceof HttpException
            ? messageFor(exception.getResponse())
            : 'Unexpected error',
      trace_id:
        request.actor?.traceId ?? request.header('x-trace-id') ?? randomUUID(),
    });
  }
}

function messageFor(response: string | object): string {
  if (typeof response === 'string') return response;
  if ('message' in response) {
    const message = response.message;
    return Array.isArray(message) ? message.join(', ') : String(message);
  }
  return 'Request failed';
}

function codeFor(status: number): string {
  return (
    {
      [HttpStatus.BAD_REQUEST]: 'LEGAL_VALIDATION_FAILED',
      [HttpStatus.UNAUTHORIZED]: 'LEGAL_UNAUTHORIZED',
      [HttpStatus.FORBIDDEN]: 'LEGAL_FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'LEGAL_NOT_FOUND',
      [HttpStatus.CONFLICT]: 'LEGAL_CONFLICT',
    }[status] ?? 'LEGAL_INTERNAL_ERROR'
  );
}
