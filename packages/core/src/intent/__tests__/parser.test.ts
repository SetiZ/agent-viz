import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { LLMProvider } from '../../provider';
import type { ContentTypeSchema, ToolDescriptor, ToolRegistry } from '../../plan';
import { IntentParseError, parseIntent } from '../parser';

const article: ContentTypeSchema = {
  uid: 'api::article.article',
  label: 'Article',
  fields: { views: { type: 'number' }, publishedAt: { type: 'datetime' } },
};

function makeRegistry(): ToolRegistry {
  const schemas = new Map<string, ContentTypeSchema>([[article.uid, article]]);
  const tools: ToolDescriptor[] = [
    {
      name: 'list_article',
      contentType: article.uid,
      description: 'List articles',
      permission: 'plugin::content-manager.explorer.read',
      inputSchema: z.object({}),
    },
  ];
  return {
    contentTypes: () => [...schemas.values()],
    contentType: (uid) => schemas.get(uid),
    findTool: (name) => tools.find((entry) => entry.name === name),
    toolsForContentType: (uid) => tools.filter((entry) => entry.contentType === uid),
    tools: () => [...tools],
  };
}

function validIntentJson(): string {
  return JSON.stringify({
    kind: 'line_chart',
    target: { uid: 'api::article.article', label: 'Article' },
    filters: { op: 'and', children: [] },
    aggregation: {
      fn: 'sum',
      field: 'views',
      timeBucket: { field: 'publishedAt', granularity: 'month' },
    },
    limit: 100,
  });
}

/** A provider that replays queued responses, then a fallback. */
function providerFor(...outputs: string[]): LLMProvider {
  let index = 0;
  return {
    async *streamText() {
      yield outputs[Math.min(index, outputs.length - 1)] ?? '';
      index += 1;
    },
  };
}

describe('parseIntent', () => {
  it('returns the parsed intent for valid JSON', async () => {
    const provider = providerFor(validIntentJson());
    const { intent, raw } = await parseIntent('how many views?', provider, makeRegistry());
    expect(intent.aggregation).toMatchObject({ fn: 'sum', field: 'views' });
    expect(raw).toBe(validIntentJson());
  });

  it('parses JSON inside a fenced code block', async () => {
    const provider = providerFor(`Here is the answer:\n\`\`\`json\n${validIntentJson()}\n\`\`\`\n`);
    const { intent } = await parseIntent('how many views?', provider, makeRegistry());
    expect(intent.kind).toBe('line_chart');
  });

  it('repairs with targeted validation feedback when the first attempt is invalid', async () => {
    const prompts: string[] = [];
    const bad = JSON.stringify({ ...JSON.parse(validIntentJson()), kind: 'histogram' });
    const provider: LLMProvider = {
      async *streamText(messages) {
        const last = messages[messages.length - 1];
        if (last && last.role === 'system') prompts.push(last.content);
        yield messages.length === 2 ? bad : validIntentJson();
      },
    };

    const { intent } = await parseIntent('how many views?', provider, makeRegistry());
    expect(intent.aggregation?.timeBucket?.field).toBe('publishedAt');
    const repairPrompt = prompts.join('\n');
    expect(repairPrompt).toMatch(/kind:/);
  });

  it('throws INTENT_PARSE_FAILED with the first issue when repairs fail', async () => {
    const bad = JSON.stringify({ ...JSON.parse(validIntentJson()), kind: 'histogram' });
    const provider = providerFor(bad);

    let caught: IntentParseError | undefined;
    try {
      await parseIntent('how many views?', provider, makeRegistry());
    } catch (error) {
      caught = error as IntentParseError;
    }
    expect(caught).toBeDefined();
    expect(caught!.code).toBe('INTENT_PARSE_FAILED');
    expect(caught!.message).toMatch(/kind:/);
    expect(caught!.message).toMatch(/Raw output:/);
  });

  it('reports when no JSON object was found', async () => {
    const provider = providerFor('I cannot answer that question.');

    let caught: IntentParseError | undefined;
    try {
      await parseIntent('how many views?', provider, makeRegistry());
    } catch (error) {
      caught = error as IntentParseError;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toMatch(/no JSON object found/);
  });
});
