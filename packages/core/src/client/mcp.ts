import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

type ConnectTransport = Parameters<Client['connect']>[0];

/**
 * Minimal transport abstraction so unit tests can inject a fake MCP server
 * and the runtime stays independent of the transport mechanics.
 */
export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpTextContent {
  type: 'text';
  text: string;
}

export interface McpToolResult {
  content?: McpTextContent[];
  isError?: boolean;
}

export interface McpTransport {
  listTools(): Promise<McpToolInfo[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
  close(): Promise<void>;
}

export interface StreamableHttpOptions {
  url: string;
  /** Read-only admin token used as the MCP Bearer credential. */
  token?: string;
}

/** Streamable-HTTP transport against a Strapi `/mcp` endpoint (Bearer auth). */
export class StreamableHttpMcpTransport implements McpTransport {
  private readonly client: Client;
  private readonly transport: StreamableHTTPClientTransport;
  private connected = false;

  constructor(options: StreamableHttpOptions) {
    this.transport = new StreamableHTTPClientTransport(new URL(options.url), {
      ...(options.token
        ? { requestInit: { headers: { Authorization: `Bearer ${options.token}` } } }
        : {}),
    });
    this.client = new Client({ name: 'mcp-viz', version: '0.1.0' });
  }

  private async connect(): Promise<void> {
    if (this.connected) return;
    await this.client.connect(this.transport as unknown as ConnectTransport);
    this.connected = true;
  }

  async listTools(): Promise<McpToolInfo[]> {
    await this.connect();
    const result = await this.client.listTools();
    return result.tools.map((tool) => {
      const entry: McpToolInfo = { name: tool.name };
      if (tool.description !== undefined) entry.description = tool.description;
      if (tool.inputSchema !== undefined)
        entry.inputSchema = tool.inputSchema as Record<string, unknown>;
      return entry;
    });
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    await this.connect();
    const result = await this.client.callTool({ name, arguments: args });
    const content = Array.isArray(result.content)
      ? result.content
          .filter(
            (entry): entry is McpTextContent =>
              entry.type === 'text' && typeof entry.text === 'string',
          )
          .map((entry) => ({ type: 'text' as const, text: entry.text }))
      : undefined;
    const output: McpToolResult = { isError: Boolean(result.isError) };
    if (content && content.length > 0) output.content = content;
    return output;
  }

  async close(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }
}
