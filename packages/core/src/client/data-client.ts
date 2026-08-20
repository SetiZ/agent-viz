import type { ToolCall, ToolRegistry } from '../plan';
import { parseFindResponse, normalizeRecords } from './registry';
import type { McpTransport } from './mcp';
import type { PermissionCheck, StepResult, ToolResult, UserContext } from './types';

export interface ExecuteStepOptions {
  user: UserContext;
  /** Permission gate enforced before any data is fetched. */
  check?: PermissionCheck;
  /** Target number of records; defaults to the step's pageSize. */
  limit?: number;
}

const MAX_PAGES = 50;

/**
 * Executes a planned tool call against the MCP transport, enforcing the
 * permission gate, normalizing records and paging to the plan's limit.
 */
export class DataClient {
  constructor(
    private readonly transport: McpTransport,
    private readonly registry: ToolRegistry,
  ) {}

  async executeStep(step: ToolCall, options: ExecuteStepOptions): Promise<ToolResult> {
    const descriptor = this.registry.findTool(step.tool);
    if (!descriptor) {
      return {
        ok: false,
        error: { code: 'UNKNOWN_TOOL', message: `tool "${step.tool}" is not in the registry` },
      };
    }

    if (options.check) {
      const allowed = await options.check({
        user: options.user,
        contentType: descriptor.contentType,
        tool: step.tool,
        permission: descriptor.permission,
      });
      if (!allowed) {
        return {
          ok: false,
          error: {
            code: 'PERMISSION_DENIED',
            message: `permission "${descriptor.permission}" is required to call "${step.tool}" on "${descriptor.contentType}"`,
          },
        };
      }
    }

    const pageSize = step.args.pagination.pageSize;
    const target = Math.min(Math.max(1, options.limit ?? pageSize), MAX_PAGES * pageSize);
    const records = [];
    let page = step.args.pagination.page ?? 1;
    let total: number | undefined;
    let truncated = false;
    const retrievedAt = new Date().toISOString();

    for (let iteration = 0; iteration < MAX_PAGES && records.length < target; iteration++) {
      const { pagination: pageSizeContainer, ...rest } = step.args;
      const args = { ...rest, page, pageSize: pageSizeContainer.pageSize };
      let result;
      try {
        result = await this.transport.callTool(step.tool, args);
      } catch (error) {
        return {
          ok: false,
          error: {
            code: 'MCP_CALL_FAILED',
            message: error instanceof Error ? error.message : 'MCP call failed',
          },
        };
      }

      const text = result.content?.[0]?.text ?? '';
      if (result.isError) {
        return {
          ok: false,
          error: { code: 'MCP_ERROR', message: text.slice(0, 500) || 'tool returned an error' },
        };
      }

      const parsed = parseFindResponse(text);
      const pageRecords = normalizeRecords(parsed.data);
      records.push(...pageRecords);
      if (parsed.total !== undefined) total = parsed.total;

      if (pageRecords.length === 0) break;
      if (total !== undefined && records.length >= total) break;
      if (pageRecords.length < pageSize) break;
      page += 1;
    }

    if (total !== undefined && records.length < total) truncated = true;

    const result: StepResult = {
      ok: true,
      records,
      stats: {
        tool: step.tool,
        contentType: descriptor.contentType,
        permission: descriptor.permission,
        user: options.user,
        recordsReturned: records.length,
        recordsMatching: total ?? records.length,
        truncated,
        retrievedAt,
      },
    };
    return result;
  }
}
