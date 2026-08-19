import { describe, expect, it } from 'vitest';
import { filterGroupSchema, filterSchema } from '../filters';

describe('filterSchema', () => {
  it('accepts a scalar eq filter', () => {
    expect(filterSchema.safeParse({ field: 'status', op: 'eq', value: 'published' }).success).toBe(
      true,
    );
  });

  it('accepts numeric and boolean values', () => {
    expect(filterSchema.safeParse({ field: 'views', op: 'gt', value: 100 }).success).toBe(true);
    expect(filterSchema.safeParse({ field: 'featured', op: 'eq', value: true }).success).toBe(true);
  });

  it('rejects an unknown operator', () => {
    expect(filterSchema.safeParse({ field: 'a', op: 'regex', value: 'x' }).success).toBe(false);
  });

  it('rejects an empty field name', () => {
    expect(filterSchema.safeParse({ field: '', op: 'eq', value: 1 }).success).toBe(false);
  });

  it('rejects non-finite values', () => {
    expect(
      filterSchema.safeParse({ field: 'a', op: 'eq', value: Number.POSITIVE_INFINITY }).success,
    ).toBe(false);
  });

  it('requires an array value for in/notIn', () => {
    expect(filterSchema.safeParse({ field: 'status', op: 'in', value: 'published' }).success).toBe(
      false,
    );
    expect(
      filterSchema.safeParse({ field: 'status', op: 'in', value: ['published', 'draft'] }).success,
    ).toBe(true);
  });

  it('rejects an array value for non-array operators', () => {
    expect(
      filterSchema.safeParse({ field: 'status', op: 'eq', value: ['published'] }).success,
    ).toBe(false);
  });

  it('requires exactly two values for between', () => {
    expect(filterSchema.safeParse({ field: 'views', op: 'between', value: [1] }).success).toBe(
      false,
    );
    expect(
      filterSchema.safeParse({ field: 'views', op: 'between', value: [1, 2, 3] }).success,
    ).toBe(false);
    expect(filterSchema.safeParse({ field: 'views', op: 'between', value: [1, 2] }).success).toBe(
      true,
    );
  });

  it('requires a null value for isNull/isNotNull', () => {
    expect(filterSchema.safeParse({ field: 'a', op: 'isNull', value: 'x' }).success).toBe(false);
    expect(filterSchema.safeParse({ field: 'a', op: 'isNull', value: null }).success).toBe(true);
    expect(filterSchema.safeParse({ field: 'a', op: 'isNotNull', value: null }).success).toBe(true);
  });
});

describe('filterGroupSchema', () => {
  it('accepts a single filter', () => {
    expect(
      filterGroupSchema.safeParse({ op: 'and', children: [{ field: 'a', op: 'eq', value: 1 }] })
        .success,
    ).toBe(true);
  });

  it('accepts an empty group as a no-op', () => {
    expect(filterGroupSchema.safeParse({ op: 'and', children: [] }).success).toBe(true);
  });

  it('accepts nested groups', () => {
    expect(
      filterGroupSchema.safeParse({
        op: 'or',
        children: [
          { op: 'and', children: [{ field: 'a', op: 'eq', value: 1 }] },
          { field: 'b', op: 'ne', value: 2 },
        ],
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown group operator', () => {
    expect(filterGroupSchema.safeParse({ op: 'xor', children: [] }).success).toBe(false);
  });

  it('rejects a nested group that fails its own validation', () => {
    expect(
      filterGroupSchema.safeParse({
        op: 'and',
        children: [{ field: 'a', op: 'in', value: 'not-an-array' }],
      }).success,
    ).toBe(false);
  });
});
