import { describe, expect, it } from 'vitest';
import { createOpenAIProvider, parseSse } from '../openai';
import { ProviderError } from '../types';

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

/** Builds a well-formed SSE `data:` frame from a single content string. */
function frame(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

describe('parseSse', () => {
  it('yields delta.content across frames until [DONE]', async () => {
    const body = sseStream([
      frame('{"kind'),
      frame('": "table"}'),
      'data: [DONE]\n\n',
      frame('ignored-after-done'),
    ]);
    const chunks: string[] = [];
    for await (const chunk of parseSse(body)) chunks.push(chunk);
    expect(chunks).toEqual(['{"kind', '": "table"}']);
  });

  it('skips malformed and non-content lines', async () => {
    const body = sseStream([
      'event: ping\n\n',
      frame(''), // empty content should not be yielded
      `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] })}\n\n`,
      'data: not-json\n\n',
      frame('ok'),
    ]);
    const chunks: string[] = [];
    for await (const chunk of parseSse(body)) chunks.push(chunk);
    expect(chunks).toEqual(['ok']);
  });
});

describe('createOpenAIProvider', () => {
  it('posts to /chat/completions and streams content chunks', async () => {
    let captured: { url: string; headers: Record<string, string>; body: string } | undefined;
    const fetchImpl = async (input: URL | RequestInfo, init?: RequestInit) => {
      captured = {
        url: String(input),
        headers: init?.headers as Record<string, string>,
        body: init?.body as string,
      };
      return new Response(
        sseStream([frame('count'), frame('- '), frame('7'), 'data: [DONE]\n\n']),
        {
          status: 200,
        },
      );
    };

    const provider = createOpenAIProvider({
      baseUrl: 'https://example.com/v1/',
      apiKey: 'sk-test',
      model: 'gpt-test',
      fetchImpl,
    });

    const chunks: string[] = [];
    for await (const chunk of provider.streamText([{ role: 'user', content: 'how many?' }])) {
      chunks.push(chunk);
    }
    expect(chunks.join('')).toBe('count- 7');
    expect(captured?.url).toBe('https://example.com/v1/chat/completions');
    expect(captured?.headers.Authorization).toBe('Bearer sk-test');
    const parsed = JSON.parse(captured!.body);
    expect(parsed).toMatchObject({
      model: 'gpt-test',
      stream: true,
      messages: [{ role: 'user', content: 'how many?' }],
    });
  });

  it('throws ProviderError on a non-OK response', async () => {
    const provider = createOpenAIProvider({
      baseUrl: 'https://example.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-test',
      fetchImpl: async () => new Response('denied', { status: 401 }),
    });

    await expect(async () => {
      const iterator = provider
        .streamText([{ role: 'user', content: 'x' }])
        [Symbol.asyncIterator]();
      await iterator.next();
    }).rejects.toBeInstanceOf(ProviderError);
  });
});
