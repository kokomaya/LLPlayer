import { describe, expect, it } from 'vitest';
import { runLLMProviderContract } from '../contract/llm-provider-contract.js';
import type { ILLMProvider, LLMRequest, LLMResponse } from '../port.js';
import { StaticLLMProvider } from './static-llm-provider.js';

// The offline provider satisfies the port contract...
runLLMProviderContract({
  name: 'StaticLLMProvider',
  makeProvider: () => new StaticLLMProvider(),
  prompt: 'Translate into es: hello',
});

// ...and so does a structurally different second implementation, proving the
// contract really pins the port (not one impl) and any provider is swappable.
class UpperEchoProvider implements ILLMProvider {
  readonly id = 'upper-echo';
  complete(req: LLMRequest): Promise<LLMResponse> {
    return Promise.resolve({ text: req.prompt.toUpperCase(), providerId: this.id });
  }
}

runLLMProviderContract({
  name: 'UpperEchoProvider',
  makeProvider: () => new UpperEchoProvider(),
  prompt: 'hola',
});

describe('StaticLLMProvider', () => {
  it('returns a canned response for an exact prompt', async () => {
    const provider = new StaticLLMProvider({
      responses: { 'ping': 'pong' },
    });
    expect((await provider.complete({ prompt: 'ping' })).text).toBe('pong');
  });

  it('falls back deterministically for an unknown prompt', async () => {
    const provider = new StaticLLMProvider();
    const res = await provider.complete({ prompt: 'anything' });
    expect(res.text).toBe('[offline] anything');
    expect(res.providerId).toBe('offline');
  });

  it('honours a custom id and fallback', async () => {
    const provider = new StaticLLMProvider({
      id: 'stub',
      fallback: (req) => `stub:${req.prompt}`,
    });
    const res = await provider.complete({ prompt: 'x' });
    expect(res.text).toBe('stub:x');
    expect(res.providerId).toBe('stub');
  });
});
