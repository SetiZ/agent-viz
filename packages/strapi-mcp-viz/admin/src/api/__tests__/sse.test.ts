import { describe, expect, it } from 'vitest';
import { createSseParser, parseSseFrame } from '../sse';

describe('parseSseFrame', () => {
  it('extracts the event name and data line', () => {
    const frame = parseSseFrame('event: block\ndata: {"type":"block"}\n');
    expect(frame).toEqual({ event: 'block', data: '{"type":"block"}' });
  });

  it('defaults to the message event when none is declared', () => {
    const frame = parseSseFrame('data: hello\n');
    expect(frame).toEqual({ event: 'message', data: 'hello' });
  });

  it('returns null for empty frames', () => {
    expect(parseSseFrame('')).toBeNull();
  });

  it('joins multi-line data values', () => {
    const frame = parseSseFrame('event: tool_result\ndata: {"a":1}\ndata: {"b":2}\n');
    expect(frame?.data).toBe('{"a":1}{"b":2}');
  });
});

describe('createSseParser', () => {
  it('emits frames as they arrive, tolerating chunk boundaries', () => {
    const frames: string[] = [];
    const parser = createSseParser((frame) => frames.push(`${frame.event}:${frame.data}`));

    parser.push('event: meta\nda');
    parser.push('ta: {"runId":"r1"}\n\nevent: done\ndata: {"runId":"r1"');
    parser.push('}\n\n');

    expect(frames).toEqual(['meta:{"runId":"r1"}', 'done:{"runId":"r1"}']);
  });

  it('ignores keep-alive comment frames without data', () => {
    const frames: string[] = [];
    const parser = createSseParser((frame) => frames.push(frame.data));

    parser.push(': ping\n\ndata: x\n\n');

    expect(frames).toEqual(['x']);
  });
});
