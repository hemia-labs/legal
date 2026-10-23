import { byteSizeTransformer } from '../../../../apps/api/src/modules/legal/entities/byte-size.transformer';
describe('PostgreSQL byte size', () => {
  it('returns exact numeric byte sizes for storage event serialization', () => {
    expect(byteSizeTransformer.from('161')).toBe(161);
    expect(byteSizeTransformer.from(null)).toBeNull();
    for (const value of ['-1', '1.5', '9007199254740992', ''])
      expect(() => {
        byteSizeTransformer.from(value);
      }).toThrow();
  });
});
