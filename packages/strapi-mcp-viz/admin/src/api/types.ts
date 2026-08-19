import type { Block } from '@mcp-viz/core/spec';

export interface SavedQuery {
  id: number;
  title: string;
  question: string;
  resultBlocks: Block[] | null;
  isPinned: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SavedQueryInput {
  title: string;
  question: string;
  resultBlocks?: Block[];
  isPinned?: boolean;
}

export interface VizSettings {
  mcpUrl: string;
  adminToken: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
}

export const MASKED_SECRET = '****';
