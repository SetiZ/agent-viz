import type { ContentRecord } from '../aggregate';

/** Who is running this query. Preserved through every tool call and response. */
export interface UserContext {
  id: string | number;
  roles: string[];
}

/**
 * Injected by the host (the Strapi plugin) to keep data access behind the
 * current user's Strapi permissions. Returning false denies the call before
 * any data is fetched.
 */
export type PermissionCheck = (request: {
  user: UserContext;
  contentType: string;
  tool: string;
  permission: string;
}) => boolean | Promise<boolean>;

export class PermissionDeniedError extends Error {
  readonly code = 'PERMISSION_DENIED';

  constructor(contentType: string, tool: string, permission: string) {
    super(
      `permission "${permission}" is required to call "${tool}" on "${contentType}" for the current user`,
    );
    this.name = 'PermissionDeniedError';
  }
}

export interface StepResult {
  ok: true;
  records: ContentRecord[];
  stats: {
    tool: string;
    contentType: string;
    permission: string;
    user: UserContext;
    recordsReturned: number;
    recordsMatching: number;
    truncated: boolean;
    retrievedAt: string;
  };
}

export type StepError = {
  ok: false;
  error: { code: string; message: string };
};

export type ToolResult = StepResult | StepError;
