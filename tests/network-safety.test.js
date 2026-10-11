import { describe, expect, it } from 'vitest';
import { isLoopbackHostname } from '../src/core/networkSafety.js';
import { installAIAuthority, AI_SESSION_KEY } from '../src/core/aiAuthority.js';

// The same utility must guard AI persistence, runtime requests, translation and settings.
describe('literal loopback host validation', () => {
  it.each(['localhost', 'LOCALHOST', '[::1]', '::1', '127.0.0.1', '127.0.0.2', '127.255.255.254'])(
    'accepts %s', (host) => expect(isLoopbackHostname(host)).toBe(true),
  );
  it.each(['', '127.attacker.example', '127.0.0.1.attacker.example', 'localhost.evil.example', '127.256.1.1', '127.1', '128.0.0.1'])(
    'rejects %s', (host) => expect(isLoopbackHostname(host)).toBe(false),
  );
  it('rejects a public 127-prefixed HTTP origin before persisting API credentials', async () => {
    const data = new Map([[AI_SESSION_KEY, 'session-private-key']]);
    const session = {
      getItem: key => data.get(key) ?? null,
      setItem: (key, value) => data.set(key, String(value)),
      removeItem: key => data.delete(key),
    };
    let stored = null;
    const root = {
      sessionStorage: session,
      DB: {
        getSetting: async () => stored,
        saveSetting: async (_key, value) => { stored = value; },
      },
    };
    installAIAuthority(root);
    await expect(root.DB.saveSetting('ocd_ai_settings', {
      mode: 'custom-api', model: 'demo', endpoint: 'http://127.attacker.example/v1',
      approvedEndpointOrigin: 'http://127.attacker.example',
    })).rejects.toThrow(/HTTPS/);
    expect(stored).toBeNull();
  });
});
