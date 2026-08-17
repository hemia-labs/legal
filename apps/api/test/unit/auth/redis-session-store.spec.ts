import { RedisSessionStore } from '../../../src/modules/auth/redis-session-store';

describe('RedisSessionStore', () => {
  it('removes a closed session from the user session index', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue(
        JSON.stringify({
          user: { iss: 'https://identity.hemia.test', sub: 'user-1' },
        }),
      ),
      del: jest.fn(),
      srem: jest.fn(),
    };

    await new RedisSessionStore(redis as any).delete(
      'sso:session:session-1',
    );

    expect(redis.del).toHaveBeenCalledWith(
      'sso:session:session-1',
      'legal:session-context:session-1',
    );
    expect(redis.srem).toHaveBeenCalledWith(
      'legal:user-sessions:https://identity.hemia.test:user-1',
      'session-1',
    );
  });
});
