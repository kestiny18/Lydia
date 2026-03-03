import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from './index.js';

describe('server API contract', () => {
  const originalToken = process.env.LYDIA_API_TOKEN;

  function createMemoryStub(): any {
    return {
      cleanupStaleCheckpoints: () => 0,
      cleanupStaleObservationFrames: () => 0,
      listEpisodes: () => [],
      listTaskReports: () => [],
      listCheckpoints: () => [],
      getFactsByTag: () => [],
      getAllFacts: () => [],
      deleteFactById: () => true,
      deleteFactByKey: () => true,
      listStrategyProposals: () => [],
      listObservationFramesByTask: () => [],
      listObservationFramesBySession: () => [],
      getEpisode: () => undefined,
      getTraces: () => [],
      summarizeEpisodesByStrategy: () => ({
        strategy_id: 's',
        strategy_version: '1.0.0',
        total: 0,
        success: 0,
        failure: 0,
        avg_duration_ms: 0,
      }),
      rememberFact: () => {},
      loadCheckpoint: () => null,
      getFactByKey: () => undefined,
    };
  }

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.LYDIA_API_TOKEN;
    } else {
      process.env.LYDIA_API_TOKEN = originalToken;
    }
  });

  it('serves status and replay endpoints without auth when no token is configured', async () => {
    delete process.env.LYDIA_API_TOKEN;
    const server = createServer(0, { silent: true, memoryManager: createMemoryStub() });

    const statusRes = await server.app.request('/api/status');
    expect(statusRes.status).toBe(200);
    const status = await statusRes.json();
    expect(status.status).toBe('ok');

    const replayRes = await server.app.request('/api/replay');
    expect(replayRes.status).toBe(200);
    const replay = await replayRes.json();
    expect(Array.isArray(replay)).toBe(true);
  });

  it('enforces token/session auth for protected APIs when token is configured', async () => {
    process.env.LYDIA_API_TOKEN = 'test-server-token';
    const server = createServer(0, { silent: true, memoryManager: createMemoryStub() });

    const protectedRes = await server.app.request('/api/replay');
    expect(protectedRes.status).toBe(401);

    const setupRes = await server.app.request('/api/setup');
    expect(setupRes.status).toBe(200);

    const invalidSessionRes = await server.app.request('/api/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'wrong-token' }),
    });
    expect(invalidSessionRes.status).toBe(401);

    const sessionRes = await server.app.request('/api/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'test-server-token' }),
    });
    expect(sessionRes.status).toBe(200);
    const sessionPayload = await sessionRes.json();
    expect(typeof sessionPayload.sessionId).toBe('string');
    expect(typeof sessionPayload.expiresAt).toBe('number');

    const sessionAccessRes = await server.app.request('/api/replay', {
      headers: { 'x-lydia-session': sessionPayload.sessionId },
    });
    expect(sessionAccessRes.status).toBe(200);

    const bearerAccessRes = await server.app.request('/api/replay', {
      headers: { authorization: 'Bearer test-server-token' },
    });
    expect(bearerAccessRes.status).toBe(200);
  });
});
