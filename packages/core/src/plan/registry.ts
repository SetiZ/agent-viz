import type { z } from 'zod';

/**
 * Contract for the tool registry that backs the planner. The client entry
 * implements this from Strapi MCP `tools/list` output. The planner only ever
 * sees the content-type schemas and read tool descriptors — never raw MCP
 * tool responses — keeping all data access behind typed tools.
 */

export type FieldType =
  | 'string'
  | 'text'
  | 'email'
  | 'uid'
  | 'password'
  | 'number'
  | 'integer'
  | 'float'
  | 'decimal'
  | 'biginteger'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'time'
  | 'timestamp'
  | 'json'
  | 'enumeration'
  | 'relation'
  | 'richtext'
  | 'media'
  | 'component'
  | 'dynamiczone';

export interface ContentTypeField {
  type: FieldType;
  enum?: (string | number)[];
  /** Content type uid for relation fields. */
  target?: string;
  required?: boolean;
  /**
   * Whether Strapi's MCP tool accepts this field in `filters`/`sort`.
   * `false` means the field is present in the returned records (usable for
   * client-side aggregation, e.g. `publishedAt`) but cannot be used to query.
   * `undefined` defaults to filterable.
   */
  filterable?: boolean;
}

export interface ContentTypeSchema {
  uid: string;
  label?: string;
  fields: Record<string, ContentTypeField>;
}

export interface ToolDescriptor {
  name: string;
  contentType: string;
  description: string;
  /** RBAC permission key that must be granted before calling this tool. */
  permission: string;
  inputSchema: z.ZodType<unknown>;
}

export interface ToolRegistry {
  contentTypes(): ContentTypeSchema[];
  contentType(uid: string): ContentTypeSchema | undefined;
  findTool(name: string): ToolDescriptor | undefined;
  toolsForContentType(uid: string): ToolDescriptor[];
  /** All registered read tools (used by the intent prompt). */
  tools(): ToolDescriptor[];
}
