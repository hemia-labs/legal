import { isDatabaseSecret } from '../../../../apps/api/src/database/types/database.types';

describe('isDatabaseSecret', () => {
  it('accepts the Vault database contract', () => {
    expect(
      isDatabaseSecret({
        db_database: 'legal',
        db_host: 'localhost',
        db_logging: true,
        db_password: '',
        db_port: 5433,
        db_username: 'legal',
      }),
    ).toBe(true);
  });

  it('rejects the old unprefixed contract', () => {
    expect(
      isDatabaseSecret({
        database: 'legal',
        host: 'localhost',
        password: '',
        port: 5433,
        username: 'legal',
      }),
    ).toBe(false);
  });
});
