export interface SseFrame {
  event: string;
  data: string;
}

export function parseSseFrame(raw: string): SseFrame | null {
  const lines = raw.split('\n');
  let event = 'message';
  let data = '';
  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      data += line.slice('data:'.length).trim();
    }
  }
  if (!data) return null;
  return { event, data };
}

export interface SseParser {
  push(chunk: string): void;
}

export function createSseParser(onFrame: (frame: SseFrame) => void): SseParser {
  let buffer = '';
  return {
    push(chunk: string) {
      buffer += chunk;
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const frame = parseSseFrame(raw);
        if (frame) onFrame(frame);
      }
    },
  };
}
