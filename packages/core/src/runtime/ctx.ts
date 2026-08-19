import type { DataClient, PermissionCheck, UserContext } from '../client';
import type { PlannerLimits, ToolRegistry } from '../plan';
import type { LLMProvider } from '../provider';

/** Everything the orchestration layer needs to answer one question. */
export interface RuntimeContext {
  user: UserContext;
  registry: ToolRegistry;
  /** Permission gate injected by the host (Strapi RBAC). */
  check?: PermissionCheck;
  data: DataClient;
  provider: LLMProvider;
  timezone?: string;
  limits?: Partial<PlannerLimits>;
  /** Injectable clock for deterministic `generatedAt`. */
  now?: () => Date;
}
