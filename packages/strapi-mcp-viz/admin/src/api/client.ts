import { getFetchClient } from '@strapi/admin/strapi-admin';
import type { SSEEvent } from '@mcp-viz/core/agent';
import { getAuthToken } from './auth';
import { createSseParser } from './sse';
import type { SavedQuery, SavedQueryInput, VizSettings } from './types';

const BASE = '/strapi-mcp-viz';

export interface RunHandlers {
  onEvent: (event: SSEEvent) => void;
  onDone: () => void;
  onError: (message: string, code?: string) => void;
}

function backendUrl(): string {
  if (typeof window === 'undefined') return '';
  const strapiGlobal = (window as unknown as { strapi?: { backendURL?: string } }).strapi;
  return strapiGlobal?.backendURL ?? '';
}

export async function listQueries(): Promise<SavedQuery[]> {
  const { get } = getFetchClient();
  const { data } = await get<SavedQuery[]>(`${BASE}/queries`);
  return data;
}

export async function createQuery(payload: SavedQueryInput): Promise<SavedQuery> {
  const { post } = getFetchClient();
  const { data } = await post<SavedQuery>(`${BASE}/queries`, payload);
  return data;
}

export async function updateQuery(
  id: number,
  payload: Partial<SavedQueryInput>
): Promise<SavedQuery> {
  const { put } = getFetchClient();
  const { data } = await put<SavedQuery>(`${BASE}/queries/${id}`, payload);
  return data;
}

export async function deleteQuery(id: number): Promise<void> {
  const { del } = getFetchClient();
  await del(`${BASE}/queries/${id}`);
}

export async function getSettings(): Promise<VizSettings> {
  const { get } = getFetchClient();
  const { data } = await get<{ data: VizSettings }>(`${BASE}/config`);
  return data.data;
}

export async function updateSettings(payload: Partial<VizSettings>): Promise<VizSettings> {
  const { put } = getFetchClient();
  const { data } = await put<{ data: VizSettings }>(`${BASE}/config`, payload);
  return data.data;
}

export async function listTools(): Promise<string[]> {
  const { get } = getFetchClient();
  const { data } = await get<{ data: { name: string }[] }>(`${BASE}/tools`);
  return (data.data ?? []).map((tool) => tool.name);
}

export async function streamRun(
  payload: { question: string; savedQueryId?: string },
  handlers: RunHandlers,
  signal?: AbortSignal
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${backendUrl()}${BASE}/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal,
    credentials: 'include',
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body && typeof body === 'object' && typeof body.error === 'string') {
        message = body.error;
      }
    } catch {
      // keep the default message
    }
    throw new Error(message);
  }

  if (!response.body) {
    throw new Error('Streaming response has no body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser((frame) => {
    try {
      const event = JSON.parse(frame.data) as SSEEvent;
      handlers.onEvent(event);
    } catch {
      // ignore malformed frames
    }
  });

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true }));
  }
  parser.push(decoder.decode());

  handlers.onDone();
}
