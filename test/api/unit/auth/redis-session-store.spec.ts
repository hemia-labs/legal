import { RedisSessionStore } from '../../../../apps/api/src/modules/auth/redis/redis-session-store';

describe('RedisSessionStore', () => {
  it('deletes only the requested session key', async () => {
    const redis = {
      del: jest.fn(),
    };

    await new RedisSessionStore(
      redis as unknown as ConstructorParameters<typeof RedisSessionStore>[0],
    ).delete('sso:session:session-1');

    expect(redis.del).toHaveBeenCalledWith('sso:session:session-1');
  });
});
