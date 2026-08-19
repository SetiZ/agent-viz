export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface StreamTextOptions {
  temperature?: number;
  maxTokens?: number;
  /** Request JSON mode on OpenAI-compatible endpoints. Defaults to the provider option. */
  responseFormat?: 'json_object' | 'none';
}

/**
 * Minimal LLM surface. In the current architecture the model only ever parses
 * intents, so this is plain text streaming; a future agent framework can swap
 * in a tool-calling-capable provider behind the same seam.
 */
export interface LLMProvider {
  streamText(messages: ChatMessage[], options?: StreamTextOptions): AsyncIterable<string>;
}

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}
