import type { ValueTransformer } from 'typeorm';

export const byteSizeTransformer: ValueTransformer = {
  to: (value: number | null) => value,
  from: (value: string | number | null): number | null => {
    if (value === null) return null;
    if (typeof value === 'string' && !/^\d+$/.test(value))
      throw new Error('Invalid stored byte size');
    const size = Number(value);
    if (!Number.isSafeInteger(size) || size < 0)
      throw new Error('Invalid stored byte size');
    return size;
  },
};
