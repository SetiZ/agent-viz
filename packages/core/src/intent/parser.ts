import type { ToolRegistry } from '../plan';
import type { LLMProvider } from '../provider';
import { intentSchema, type Intent } from './intent';
import { buildIntentSystemPrompt } from './prompt';

export class IntentParseError extends Error {
  readonly code = 'INTENT_PARSE_FAILED';

  constructor(message: string) {
    super(message);
    this.name = 'IntentParseError';
  }
}

export interface ParseIntentOptions {
  maxRepairs?: number;
}

export interface ParsedIntent {
  intent: Intent;
  raw: string;
}

/**
 * The only LLM stage: turns the question into a Zod-validated Intent with one
 * repair pass. Any invalid output becomes an IntentParseError, never a crash
 * or an unvalidated structure.
 */
export async function parseIntent(
  question: string,
  provider: LLMProvider,
  registry: ToolRegistry,
  options: ParseIntentOptions = {},
): Promise<ParsedIntent> {
  const maxRepairs = options.maxRepairs ?? 1;
  const system = buildIntentSystemPrompt(registry);
  const userMessages = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: question },
  ];

  let content = await completeText(provider, userMessages);
  for (let attempt = 0; ; attempt++) {
    const parsed = tryParseIntent(content);
    if (parsed) return parsed;
    if (attempt >= maxRepairs) {
      throw new IntentParseError('model output was not a valid Intent after repairs');
    }
    content = await completeText(provider, [
      ...userMessages,
      {
        role: 'system',
        content: `Your previous answer was not valid. It must be a single JSON object matching the Intent schema. Previous answer:\n${content.slice(0, 2000)}`,
      },
    ]);
  }
}

async function completeText(
  provider: LLMProvider,
  messages: { role: 'system' | 'user'; content: string }[],
): Promise<string> {
  let text = '';
  for await (const chunk of provider.streamText(messages)) {
    text += chunk;
  }
  return text;
}

function tryParseIntent(content: string): ParsedIntent | undefined {
  const json = extractJson(content);
  if (json === undefined) return undefined;
  const result = intentSchema.safeParse(json);
  if (!result.success) return undefined;
  return { intent: result.data, raw: content };
}

function extractJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? (fenced[1] as string) : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return undefined;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return undefined;
  }
}
