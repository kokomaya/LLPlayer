import { describe, expect, it } from 'vitest';
import type { ILLMProvider, LLMRequest, LLMResponse } from './port.js';
import { createLLMRuntime } from './registry.js';
import { StaticLLMProvider } from './providers/static-llm-provider.js';

const offline = new StaticLLMProvider({ id: 'offline' });

/** An online provider that always fails, to exercise hybrid degradation. */
class FailingProvider implements ILLMProvider {
  readonly id = 'online';
  complete(): Promise<LLMResponse> {
    return Promise.reject(new Error('network down'));
  }
}

/** A working online provider. */
class OnlineProvider implements ILLMProvider {
  readonly id = 'online';
  complete(req: LLMRequest): Promise<LLMResponse> {
    return Promise.resolve({ text: `online:${req.prompt}`, providerId: this.id });
  }
}

const req: LLMRequest = { prompt: 'hi' };

describe('createLLMRuntime', () => {
  it('offline mode always uses the offline provider', async () => {
    const rt = createLLMRuntime({ mode: 'offline', offline, online: new OnlineProvider() });
    expect((await rt.complete(req)).providerId).toBe('offline');
  });

  it('online mode uses the online provider', async () => {
    const rt = createLLMRuntime({ mode: 'online', offline, online: new OnlineProvider() });
    const res = await rt.complete(req);
    expect(res.providerId).toBe('online');
    expect(res.text).toBe('online:hi');
  });

  it('online mode without an online provider throws', () => {
    expect(() => createLLMRuntime({ mode: 'online', offline })).toThrow(
      /online provider/,
    );
  });

  it('hybrid prefers online when it succeeds', async () => {
    const rt = createLLMRuntime({ mode: 'hybrid', offline, online: new OnlineProvider() });
    expect((await rt.complete(req)).providerId).toBe('online');
  });

  it('hybrid degrades to offline when online fails', async () => {
    const rt = createLLMRuntime({ mode: 'hybrid', offline, online: new FailingProvider() });
    const res = await rt.complete(req);
    expect(res.providerId).toBe('offline');
    expect(res.text).toBe('[offline] hi');
  });

  it('hybrid with no online provider is just offline', async () => {
    const rt = createLLMRuntime({ mode: 'hybrid', offline });
    expect((await rt.complete(req)).providerId).toBe('offline');
    expect(rt.id).toBe('offline');
  });
});
