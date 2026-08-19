import { describe, expect, it } from 'vitest';
import { encodeFilter, encodeFilters, encodeSort } from '../encode';

describe('encodeFilter', () => {
  it('maps ops to Strapi operators', () => {
    expect(encodeFilter({ field: 'status', op: 'eq', value: 'published' })).toEqual({
      status: { $eq: 'published' },
    });
    expect(encodeFilter({ field: 'views', op: 'between', value: [1, 100] })).toEqual({
      views: { $between: [1, 100] },
    });
    expect(encodeFilter({ field: 'author', op: 'isNull', value: null })).toEqual({
      author: { $null: null },
    });
  });
});

describe('encodeFilters', () => {
  it('encodes an and-group', () => {
    expect(
      encodeFilters({
        op: 'and',
        children: [
          { field: 'status', op: 'eq', value: 'published' },
          { field: 'views', op: 'gt', value: 10 },
        ],
      }),
    ).toEqual({
      $and: [{ status: { $eq: 'published' } }, { views: { $gt: 10 } }],
    });
  });

  it('encodes nested or-groups', () => {
    expect(
      encodeFilters({
        op: 'or',
        children: [
          { op: 'and', children: [{ field: 'a', op: 'eq', value: 1 }] },
          { field: 'b', op: 'ne', value: 2 },
        ],
      }),
    ).toEqual({
      $or: [{ $and: [{ a: { $eq: 1 } }] }, { b: { $ne: 2 } }],
    });
  });

  it('encodes an empty group as no constraints', () => {
    expect(encodeFilters({ op: 'and', children: [] })).toEqual({});
  });
});

describe('encodeSort', () => {
  it('encodes field:dir pairs', () => {
    expect(
      encodeSort([
        { field: 'publishedAt', dir: 'desc' },
        { field: 'title', dir: 'asc' },
      ]),
    ).toEqual(['publishedAt:desc', 'title:asc']);
  });
});
