import { describe, it, expect, beforeEach } from 'vitest';
import { CanAlready } from '../src/can-already';

describe('CanAlready Integration Tests', () => {
  describe('CanCan Backwards Compatibility', () => {
    it('should support destructured interface like CanCan', () => {
      const canAlready = new CanAlready({
        debug: false,
        roleResolver: (role) => role,
        actionResolver: (action) => action,
        resourceResolver: (resource) => resource,
        errorFactory: (message, allowedRoles) => new Error(message)
      });

      const { allow, can, cannot, authorize } = canAlready;

      allow('user', 'read', 'post');
      
      expect(can('user', 'read', 'post')).toBe(true);
      expect(cannot('user', 'write', 'post')).toBe(true);
      
      expect(() => authorize('user', 'read', 'post')).not.toThrow();
      expect(() => authorize('user', 'write', 'post')).toThrow();
    });

    it('should work with CanCan-style class examples', () => {
      class User {
        constructor(public role: string, public id: number) {}
      }

      class Post {
        constructor(public id: number, public authorId: number) {}
      }

      const canAlready = new CanAlready<User, string, Post>({
        debug: false,
        roleResolver: (user) => user.role,
        actionResolver: (action) => action,
        resourceResolver: (post) => post.constructor.name.toLowerCase(),
        errorFactory: (message, allowedRoles) => new Error(message)
      });

      const { allow, can } = canAlready;

      const user = new User('user', 1);
      const admin = new User('admin', 2);
      const post = new Post(1, 1);

      allow(admin, 'manage', post);
      allow(user, 'read', post);
      allow(user, 'update', post, (u, a, p, options) => u.id === p.authorId);

      expect(can(admin, 'delete', post)).toBe(true);
      expect(can(user, 'read', post)).toBe(true);
      expect(can(user, 'update', post)).toBe(true);
      expect(can(user, 'delete', post)).toBe(false);
    });
  });

  describe('Real-world Blog System', () => {
    interface User {
      id: number;
      role: 'admin' | 'moderator' | 'author' | 'reader';
      organizationId?: number;
    }

    interface BlogPost {
      id: number;
      authorId: number;
      organizationId: number;
      published: boolean;
    }

    interface Comment {
      id: number;
      authorId: number;
      postId: number;
    }

    let canAlready: CanAlready<User, string, BlogPost | Comment | string>;

    beforeEach(() => {
      canAlready = new CanAlready({
        debug: false,
        roleResolver: (user) => user.role,
        actionResolver: (action) => action,
        resourceResolver: (resource) => {
          if (typeof resource === 'string') return resource;
          return resource.constructor.name.toLowerCase();
        },
        errorFactory: (message, allowedRoles) => new Error(`${message}. Allowed roles: ${allowedRoles.join(', ')}`)
      });

      const { allow } = canAlready;

      allow({ role: 'admin' } as User, '*', '*');
      
      allow({ role: 'moderator' } as User, ['read', 'update', 'delete'], 'blogpost');
      allow({ role: 'moderator' } as User, ['read', 'delete'], 'comment');
      
      allow({ role: 'author' } as User, 'read', 'blogpost');
      allow({ role: 'author' } as User, ['create', 'update'], 'blogpost', (user, action, resource, options) => {
        if (action === 'create') return true;
        return options?.resource?.authorId === user.id;
      });
      
      allow({ role: 'reader' } as User, 'read', 'blogpost', (user, action, resource, options) => {
        return options?.resource?.published === true;
      });
    });

    it('should handle complex blog permissions correctly', () => {
      const admin = { id: 1, role: 'admin' as const };
      const moderator = { id: 2, role: 'moderator' as const };
      const author = { id: 3, role: 'author' as const };
      const reader = { id: 4, role: 'reader' as const };

      const publishedPost = { id: 1, authorId: 3, organizationId: 1, published: true };
      const draftPost = { id: 2, authorId: 3, organizationId: 1, published: false };
      const otherAuthorPost = { id: 3, authorId: 5, organizationId: 1, published: true };

      expect(canAlready.can(admin, 'delete', 'blogpost')).toBe(true);
      
      expect(canAlready.can(moderator, 'update', 'blogpost')).toBe(true);
      expect(canAlready.can(moderator, 'create', 'blogpost')).toBe(false);
      
      expect(canAlready.can(author, 'read', 'blogpost')).toBe(true);
      expect(canAlready.can(author, 'create', 'blogpost')).toBe(true);
      expect(canAlready.can(author, 'update', 'blogpost', { resource: publishedPost })).toBe(true);
      expect(canAlready.can(author, 'update', 'blogpost', { resource: otherAuthorPost })).toBe(false);
      
      expect(canAlready.can(reader, 'read', 'blogpost', { resource: publishedPost })).toBe(true);
      expect(canAlready.can(reader, 'read', 'blogpost', { resource: draftPost })).toBe(false);
      expect(canAlready.can(reader, 'create', 'blogpost')).toBe(false);
    });

    it('should provide helpful error messages with allowed roles', () => {
      const reader = { id: 4, role: 'reader' as const };
      
      expect(() => {
        canAlready.authorize(reader, 'create', 'blogpost');
      }).toThrow(/Allowed roles: admin, author/);
    });
  });

  describe('Multi-tenant SaaS Application', () => {
    interface TenantUser {
      id: number;
      tenantId: number;
      role: 'tenant_admin' | 'tenant_user' | 'support_agent' | 'platform_admin';
    }

    interface TenantResource {
      id: number;
      tenantId: number;
      type: 'project' | 'invoice' | 'user';
    }

    let canAlready: CanAlready<TenantUser, string, TenantResource>;

    beforeEach(() => {
      canAlready = new CanAlready({
        debug: false,
        roleResolver: (user) => user.role,
        actionResolver: (action) => action,
        resourceResolver: (resource) => resource.type,
        errorFactory: (message, allowedRoles) => new Error(message)
      });

      const { allow } = canAlready;

      allow({ role: 'platform_admin' } as TenantUser, '*', '*');
      
      allow({ role: 'support_agent' } as TenantUser, 'read', '*');
      
      allow({ role: 'tenant_admin' } as TenantUser, '*', '*', (user, action, resource, options) => {
        return user.tenantId === options?.resource?.tenantId;
      });
      
      allow({ role: 'tenant_user' } as TenantUser, 'read', '*', (user, action, resource, options) => {
        return user.tenantId === options?.resource?.tenantId;
      });
    });

    it('should enforce tenant isolation', () => {
      const tenant1Admin = { id: 1, tenantId: 1, role: 'tenant_admin' as const };
      const tenant2Admin = { id: 2, tenantId: 2, role: 'tenant_admin' as const };
      const tenant1User = { id: 3, tenantId: 1, role: 'tenant_user' as const };
      const supportAgent = { id: 4, tenantId: 0, role: 'support_agent' as const };
      const platformAdmin = { id: 5, tenantId: 0, role: 'platform_admin' as const };

      const tenant1Project = { id: 1, tenantId: 1, type: 'project' as const };
      const tenant2Project = { id: 2, tenantId: 2, type: 'project' as const };

      expect(canAlready.can(tenant1Admin, 'delete', 'project', { resource: tenant1Project })).toBe(true);
      expect(canAlready.can(tenant1Admin, 'delete', 'project', { resource: tenant2Project })).toBe(false);
      
      expect(canAlready.can(tenant2Admin, 'update', 'project', { resource: tenant2Project })).toBe(true);
      expect(canAlready.can(tenant2Admin, 'update', 'project', { resource: tenant1Project })).toBe(false);
      
      expect(canAlready.can(tenant1User, 'read', 'project', { resource: tenant1Project })).toBe(true);
      expect(canAlready.can(tenant1User, 'read', 'project', { resource: tenant2Project })).toBe(false);
      expect(canAlready.can(tenant1User, 'delete', 'project', { resource: tenant1Project })).toBe(false);
      
      expect(canAlready.can(supportAgent, 'read', 'project', { resource: tenant1Project })).toBe(true);
      expect(canAlready.can(supportAgent, 'read', 'project', { resource: tenant2Project })).toBe(true);
      expect(canAlready.can(supportAgent, 'delete', 'project', { resource: tenant1Project })).toBe(false);
      
      expect(canAlready.can(platformAdmin, 'delete', 'project', { resource: tenant1Project })).toBe(true);
      expect(canAlready.can(platformAdmin, 'delete', 'project', { resource: tenant2Project })).toBe(true);
    });
  });

  describe('Permission Export/Import Workflow', () => {
    it('should support complete export/import workflow', () => {
      const sourceCanAlready = new CanAlready({
        debug: false,
        roleResolver: (role) => role,
        actionResolver: (action) => action,
        resourceResolver: (resource) => resource,
        errorFactory: (message, allowedRoles) => new Error(message),
        conditionExporter: (fn) => fn.name,
        conditionImporter: (fnName) => {
          const conditions = {
            isOwnerProfile: (role: string, action: string, resource: string, options?: any) => 
              options?.userId === options?.ownerId
          };
          return conditions[fnName as keyof typeof conditions];
        }
      });

      const targetCanAlready = new CanAlready({
        debug: false,
        roleResolver: (role) => role,
        actionResolver: (action) => action,
        resourceResolver: (resource) => resource,
        errorFactory: (message, allowedRoles) => new Error(message),
        conditionExporter: (fn) => fn.name,
        conditionImporter: (fnName) => {
          const conditions = {
            isOwnerProfile: (role: string, action: string, resource: string, options?: any) => 
              options?.userId === options?.ownerId
          };
          return conditions[fnName as keyof typeof conditions];
        }
      });

      const { allow: sourceAllow } = sourceCanAlready;
      
      const isOwner = function isOwnerProfile(role: string, action: string, resource: string, options?: any) {
        return options?.userId === options?.ownerId;
      };

      sourceAllow('admin', '*', '*');
      sourceAllow('user', 'read', 'post');
      sourceAllow('user', 'update', 'profile', isOwner);

      const exported = sourceCanAlready.exportPermissions(['admin', 'user']);
      targetCanAlready.importPermissions(exported);

      expect(targetCanAlready.can('admin', 'delete', 'anything')).toBe(true);
      expect(targetCanAlready.can('user', 'read', 'post')).toBe(true);
      expect(targetCanAlready.can('user', 'update', 'profile', { userId: 1, ownerId: 1 })).toBe(true);
      expect(targetCanAlready.can('user', 'update', 'profile', { userId: 1, ownerId: 2 })).toBe(false);
    });
  });
});