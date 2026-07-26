/**
 * REFERENCE ONLY — excluded from the CI build/test/lint graph (`*.example.ts`).
 *
 * An online {@link ILLMProvider} sketch over an OpenAI-compatible Chat
 * Completions endpoint (works for OpenAI, many local servers, and OpenAI-shaped
 * proxies for Claude). It needs network access and an API key, so it is NOT part
 * of the pure, hermetic core that CI unit-tests — it is validated off-CI against
 * a live endpoint. Its only job is to satisfy the SAME `ILLMProvider` port and
 * pass `runLLMProviderContract`, proving a network backend is a drop-in
 * substitute for the offline one (LSP) — and, behind the hybrid runtime, a
 * source that offline can back up.
 *
 * SECURITY (repo rule §E): never hard-code or commit an API key. Read it from an
 * environment variable / untracked file at the composition root and inject it
 * here. This file contains only a placeholder env lookup.
 *
 * To activate off-CI: drop the `.example` segment and register it as the
 * `online` provider of `createLLMRuntime` (mode `online`/`hybrid`).
 */
import type { ILLMProvider, LLMRequest, LLMResponse } from '../port.js';

export interface OpenAiLLMConfig {
  /** e.g. `https://api.openai.com/v1` or a local `http://localhost:11434/v1`. */
  readonly baseUrl: string;
  /** Injected from `process.env.OPENAI_API_KEY` at the composition root. */
  readonly apiKey: string;
  readonly model: string;
}

export class OpenAiLLMProvider implements ILLMProvider {
  readonly id = 'openai';

  constructor(private readonly config: OpenAiLLMConfig) {}

  async complete(req: LLMRequest, signal?: AbortSignal): Promise<LLMResponse> {
    const messages = [
      ...(req.system !== undefined
        ? [{ role: 'system', content: req.system }]
        : []),
      { role: 'user', content: req.prompt },
    ];
    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        ...(req.temperature !== undefined
          ? { temperature: req.temperature }
          : {}),
        ...(req.maxTokens !== undefined
          ? { max_tokens: req.maxTokens }
          : {}),
      }),
      ...(signal !== undefined ? { signal } : {}),
    });
    if (!res.ok) {
      throw new Error(`LLM API ${res.status}`);
    }
    const body = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return {
      text: body.choices[0]?.message.content ?? '',
      providerId: this.id,
    };
  }
}
