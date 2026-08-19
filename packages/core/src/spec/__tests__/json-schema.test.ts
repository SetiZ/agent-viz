import { describe, expect, it } from 'vitest';
import { analyticalResponseJsonSchema, blockJsonSchema } from '../json-schema';

interface JsonSchemaView {
  oneOf?: { properties: { type: { const?: string } } }[];
  anyOf?: { properties: { type: { const?: string } } }[];
  properties?: Record<string, unknown>;
  required?: string[];
}

describe('blockJsonSchema', () => {
  it('is a JSON Schema object covering every block variant', () => {
    const schema = blockJsonSchema as unknown as JsonSchemaView;
    const variants = schema.oneOf ?? schema.anyOf;
    expect(variants?.length).toBe(7);

    const consts = (variants ?? [])
      .map((variant) => variant.properties?.type?.const)
      .filter((value): value is string => value !== undefined)
      .sort();
    expect(consts).toEqual(
      ['bar_chart', 'error', 'kpi', 'line_chart', 'pie_chart', 'table', 'text'].sort(),
    );
  });

  it('never exposes free-form HTML/script fields', () => {
    const json = JSON.stringify(blockJsonSchema);
    expect(json).not.toMatch(/dangerouslySetInnerHTML|innerHTML|script/i);
  });
});

describe('analyticalResponseJsonSchema', () => {
  it('declares the provenance-bearing fields as required', () => {
    const schema = analyticalResponseJsonSchema as unknown as JsonSchemaView;
    expect(schema.properties).toBeDefined();

    const required: string[] = schema.required ?? [];
    for (const field of [
      'summary',
      'blocks',
      'sources',
      'filters',
      'caveats',
      'generatedAt',
      'runtime',
    ]) {
      expect(required).toContain(field);
    }
  });
});
