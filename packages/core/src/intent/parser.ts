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
    const outcome = tryParseIntent(content);
    if (outcome.ok) return { intent: outcome.intent, raw: content };
    if (attempt >= maxRepairs) {
      throw new IntentParseError(describeFailure(outcome));
    }
    content = await completeText(provider, [
      ...userMessages,
      { role: 'system', content: buildRepairPrompt(content, outcome.issues) },
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

type IntentAttempt =
  { ok: true; intent: Intent; raw: string } | { ok: false; issues: string[]; raw: string };

function tryParseIntent(content: string): IntentAttempt {
  const json = extractJson(content);
  if (json === undefined) return { ok: false, issues: [], raw: content };
  const result = intentSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    });
    return { ok: false, issues, raw: content };
  }
  return { ok: true, intent: result.data, raw: content };
}

function buildRepairPrompt(previous: string, issues: string[]): string {
  const detail =
    issues.length > 0
      ? `Validation problems with the previous answer:\n- ${issues.slice(0, 5).join('\n- ')}`
      : 'The previous answer did not contain a JSON object.';
  return `Your previous answer was not a valid Intent. ${detail}\nReturn only a single JSON object matching the Intent schema. Previous answer:\n${previous.slice(0, 2000)}`;
}

function describeFailure(attempt: IntentAttempt): string {
  const issues = attempt.ok ? [] : attempt.issues;
  const problem =
    issues.length > 0 ? `validation issue: ${issues[0]}` : 'no JSON object found in model output';
  const excerpt = attempt.raw.trim().slice(0, 300);
  return `model output was not a valid Intent after repairs (${problem}). Raw output: ${excerpt.length > 0 ? excerpt : '(empty)'}`;
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
