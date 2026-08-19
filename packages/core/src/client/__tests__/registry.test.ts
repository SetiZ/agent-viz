import { describe, expect, it } from 'vitest';
import type { ContentTypeSchema } from '../../plan';
import { buildToolRegistry, isReadTool, normalizeRecords, parseFindResponse } from '../registry';

const article: ContentTypeSchema = {
  uid: 'api::article.article',
  label: 'Article',
  fields: {
    title: { type: 'string' },
    views: { type: 'number' },
  },
};

describe('isReadTool', () => {
  it('recognizes find_* and find_one_* prefixes', () => {
    expect(isReadTool('find_article')).toBe(true);
    expect(isReadTool('find_one_article')).toBe(true);
    expect(isReadTool('create_article')).toBe(false);
  });
});

describe('buildToolRegistry', () => {
  it('builds descriptors with host-provided permissions and schema-derived zod input', () => {
    const registry = buildToolRegistry(
      [
        { name: 'find_article', description: 'Find articles', inputSchema: { type: 'object' } },
        { name: 'create_article', description: 'Create articles' },
      ],
      {
        contentTypes: [article],
        permissionFor: () => 'plugin::mcp-viz.run',
        readOnly: true,
      },
    );

    expect(registry.tools().map((entry) => entry.name)).toEqual(['find_article']);
    expect(registry.contentType(article.uid)).toEqual(article);
    expect(registry.findTool('find_article')).toMatchObject({
      name: 'find_article',
      contentType: article.uid,
      permission: 'plugin::mcp-viz.run',
    });
    expect(registry.toolsForContentType(article.uid)).toHaveLength(1);
  });

  it('falls back to a name-based content-type heuristic', () => {
    const registry = buildToolRegistry([{ name: 'find_article' }], {
      contentTypes: [article],
      permissionFor: () => 'x',
    });
    expect(registry.findTool('find_article')?.contentType).toBe(article.uid);
  });

  it('skips tools it cannot map to a content type', () => {
    const registry = buildToolRegistry([{ name: 'find_unknown_thing' }], {
      contentTypes: [article],
      permissionFor: () => 'x',
    });
    expect(registry.tools()).toHaveLength(0);
  });
});

describe('parseFindResponse', () => {
  it('parses data and pagination total', () => {
    const text = JSON.stringify({
      data: [{ id: 1 }],
      meta: { pagination: { page: 1, pageSize: 10, pageCount: 1, total: 42 } },
    });
    expect(parseFindResponse(text)).toEqual({ data: [{ id: 1 }], total: 42 });
  });

  it('returns empty data on non-JSON', () => {
    expect(parseFindResponse('not json')).toEqual({ data: [] });
  });

  it('returns data without total when pagination is absent', () => {
    expect(parseFindResponse(JSON.stringify({ data: [1] }))).toEqual({ data: [1] });
  });
});

describe('normalizeRecords', () => {
  it('unwraps Strapi REST attributes nests', () => {
    expect(normalizeRecords([{ id: 1, attributes: { title: 'a' } }])).toEqual([
      { id: 1, attributes: { title: 'a' } },
    ]);
  });

  it('moves flat properties into attributes', () => {
    expect(normalizeRecords([{ id: 2, title: 'b' }])).toEqual([
      { id: 2, attributes: { title: 'b' } },
    ]);
  });

  it('drops records without an id and non-objects', () => {
    expect(normalizeRecords([{ title: 'no id' }, null, 'x'])).toEqual([]);
  });
});
