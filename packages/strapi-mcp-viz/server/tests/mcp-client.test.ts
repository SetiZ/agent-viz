import { describe, it, expect } from 'vitest';
import { contentTypeSchemas, permissionFor } from '../src/services/mcp-client';

const strapi = {
  contentTypes: {
    'api::article.article': {
      info: { displayName: 'Article' },
      attributes: {
        title: { type: 'string' },
        status: { type: 'enumeration', enum: ['draft', 'published'] },
        author: { type: 'relation', target: 'plugin::users-permissions.user' },
        body: { type: 'text' },
      },
    },
    'api::author.author': {
      info: { displayName: 'Author' },
      attributes: { name: { type: 'string' } },
    },
    'plugin::users-permissions.user': {
      info: { displayName: 'User' },
      attributes: { username: { type: 'string' } },
    },
    'admin::user': { attributes: { email: { type: 'email' } } },
    'strapi::core-store': { attributes: {} },
    'api::empty.empty': {},
  },
} as never;

describe('contentTypeSchemas', () => {
  it('skips admin/plugin/strapi namespaces and cts without attributes', () => {
    const schemas = contentTypeSchemas(strapi);
    const uids = schemas.map((s) => s.uid);
    expect(uids).toEqual(['api::article.article', 'api::author.author']);
  });

  it('maps fields with type, enum, and target', () => {
    const [article] = contentTypeSchemas(strapi);
    expect(article).toEqual({
      uid: 'api::article.article',
      label: 'Article',
      fields: {
        title: { type: 'string' },
        status: { type: 'enumeration', enum: ['draft', 'published'] },
        author: { type: 'relation', target: 'plugin::users-permissions.user' },
        body: { type: 'text' },
      },
    });
  });

  it('omits the label when displayName is missing', () => {
    const schemas = contentTypeSchemas(strapi);
    const author = schemas.find((s) => s.uid === 'api::author.author');
    expect(author?.label).toBe('Author');
  });
});

describe('permissionFor', () => {
  it('maps to the content-manager read action used by the RBAC gate', () => {
    expect(permissionFor('api::article.article')).toBe('plugin::content-manager.explorer.read');
  });
});
