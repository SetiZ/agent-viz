import type { Core } from '@strapi/strapi';
import type { StreamableHttpMcpTransport } from '@mcp-viz/core/client';
import {
  DataClient,
  SimpleOrchestrator,
  createOpenAIProvider,
  type PermissionCheck,
  type SSEEvent,
  type UserContext,
} from '@mcp-viz/core/agent';

export class AgentConfigError extends Error {
  readonly code = 'CONFIG_INCOMPLETE';

  constructor(message: string) {
    super(message);
    this.name = 'AgentConfigError';
  }
}

export default ({ strapi }: { strapi: Core.Strapi }) => {
  const hasContentTypePermission = async (user: UserContext, action: string): Promise<boolean> => {
    try {
      const permissionService = strapi.service('admin::permission') as {
        engine?: {
          generateUserAbility?: (user: unknown) => Promise<unknown>;
          checkMany?: (ability: unknown, permissions: unknown[]) => Promise<boolean[]>;
        };
      };
      const { engine } = permissionService;
      if (!engine?.generateUserAbility || !engine.checkMany) return false;
      const ability = await engine.generateUserAbility(user);
      const results = await engine.checkMany(ability, [{ action }]);
      return Array.isArray(results) && results[0] === true;
    } catch {
      return false;
    }
  };

  return {
    hasContentTypePermission,

    /**
     * Answers a question, streaming SSE events. Creates the transport, provider
     * and registry per run so secrets and connections never outlive a request.
     */
    async run({
      question,
      user,
    }: {
      question: string;
      user: UserContext;
    }): Promise<AsyncIterable<SSEEvent>> {
      const plugin = strapi.plugin('strapi-mcp-viz');
      const config = await plugin.service('config').get();

      if (!config.llmBaseUrl || !config.llmApiKey || !config.llmModel) {
        throw new AgentConfigError(
          'LLM provider is not configured. Set llmBaseUrl, llmApiKey and llmModel in the plugin settings.'
        );
      }
      if (!config.mcpUrl || config.mcpUrl === '/mcp') {
        throw new AgentConfigError(
          'MCP URL is not configured. Point mcpUrl at your Strapi /mcp endpoint.'
        );
      }

      const registry = await plugin.service('mcp-client').getRegistry();
      const transport = await plugin.service('mcp-client').createTransport();
      const data = new DataClient(transport, registry);
      const provider = createOpenAIProvider({
        baseUrl: config.llmBaseUrl,
        apiKey: config.llmApiKey,
        model: config.llmModel,
      });

      const check: PermissionCheck = async ({ user: requestUser, permission }) => {
        return hasContentTypePermission(requestUser, permission);
      };

      const orchestrator = new SimpleOrchestrator();
      const events = orchestrator.run({ user, registry, data, provider, check }, question);
      return closeOnFinish(events, transport);
    },
  };
};

async function* closeOnFinish<T>(
  iterable: AsyncIterable<T>,
  transport: StreamableHttpMcpTransport
): AsyncIterable<T> {
  try {
    yield* iterable;
  } finally {
    await transport.close();
  }
}
