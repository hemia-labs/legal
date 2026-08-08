import { HttpException, HttpStatus } from '@nestjs/common';

export function requireLegalClearance(result: { canContinue: boolean }) {
  if (!result.canContinue) {
    throw new HttpException(result, HttpStatus.PRECONDITION_REQUIRED);
  }
}
