import { ProviderError, type ChatMessage, type LLMProvider, type StreamTextOptions } from './types';

export interface OpenAIProviderOptions {
  /** e.g. `https://api.openai.com/v1` (no trailing slash required). */
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  /**
   * Ask the endpoint for `response_format: { type: 'json_object' }`. Disabled
   * automatically with a single retry when the endpoint rejects it (HTTP 400/422).
   */
  responseFormat?: 'json_object' | 'none';
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

/** OpenAI-compatible `/chat/completions` adapter over raw `fetch` + SSE. */
export function createOpenAIProvider(options: OpenAIProviderOptions): LLMProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const responseFormat = options.responseFormat ?? 'json_object';

  return {
    async *streamText(messages: ChatMessage[], streamOptions?: StreamTextOptions) {
      const request = async (format: 'json_object' | 'none') => {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({
            model: options.model,
            messages,
            stream: true,
            temperature: streamOptions?.temperature ?? options.temperature ?? 0,
            max_tokens: streamOptions?.maxTokens ?? options.maxTokens,
            ...(format === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
          }),
        });
        return response;
      };

      const format = streamOptions?.responseFormat ?? responseFormat;

      let response = await request(format);
      if (
        !response.ok &&
        format === 'json_object' &&
        response.status !== 400 &&
        response.status !== 422
      ) {
        throw new ProviderError(`provider returned HTTP ${response.status}`);
      }
      if (!response.ok && format === 'json_object') {
        response = await request('none');
      }
      if (!response.ok || !response.body) {
        throw new ProviderError(`provider returned HTTP ${response.status}`);
      }

      yield* parseSse(response.body);
    },
  };
}

/** Parses an OpenAI-style SSE byte stream into `choices[0].delta.content` chunks. */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;
      if (data === '') continue;

      let json: unknown;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      const chunk = json as { choices?: { delta?: { content?: unknown } }[] };
      const delta = chunk.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta.length > 0) yield delta;
    }
  }
}
