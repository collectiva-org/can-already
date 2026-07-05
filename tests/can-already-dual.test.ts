import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CanAlready } from '../src/can-already';
import type { CanAlreadyOptions } from '../src/types';

interface UserRole {
  userId: string;
  role: string;
  organisationId: string;
}

enum SimpleRole {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator'
}

describe('CanAlready with Dual Generics', () => {
  let canAlready: CanAlready<SimpleRole, UserRole, string, any>;
  let consoleDebugSpy: any;

  const defaultOptions: CanAlreadyOptions<SimpleRole | UserRole, string, any> = {
    debug: false,
    roleResolver: (role) => typeof role === 'string' ? role : role.role,
    actionResolver: (action) => action,
    // Record-first: derive the TYPE key from the record; bare strings stay type-level.
    resourceResolver: (resource) => typeof resource === 'string' ? resource : resource.type,
    errorFactory: (message, allowedRoles) =>
      new Error(`${message}. Allowed roles: ${allowedRoles.join(', ')}`),
  };

  const createUserRole = (role: string, userId: string, organisationId: string): UserRole => ({
    userId,
    role,
    organisationId
  });

  beforeEach(() => {
    canAlready = new CanAlready(defaultOptions);
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  describe('Constructor', () => {
    it('should create instance with dual-generic options', () => {
      expect(canAlready).toBeInstanceOf(CanAlready);
    });
  });

  describe('Dual-generic functionality', () => {
    beforeEach(() => {
      const isSameOrganisation = (role: UserRole, action: string, post: any) =>
        role.organisationId === post.organisationId;

      canAlready.allow(SimpleRole.ADMIN, '*', '*');
      canAlready.allow(SimpleRole.USER, 'read', 'post');
      canAlready.allow(SimpleRole.MODERATOR, 'manage', 'post', isSameOrganisation);
    });

    it('should use simple role types for permission definitions', () => {
      expect(() => {
        canAlready.allow(SimpleRole.USER, 'write', 'comment');
        canAlready.allow([SimpleRole.USER, SimpleRole.MODERATOR], 'read', ['post', 'comment']);
      }).not.toThrow();
    });

    it('should use rich context objects for runtime evaluation', () => {
      const adminUser = createUserRole('admin', '1', 'org1');
      const regularUser = createUserRole('user', '2', 'org1');
      const moderatorUser = createUserRole('moderator', '3', 'org1');

      expect(canAlready.can(adminUser, 'delete', 'post')).toBe(true);
      expect(canAlready.can(regularUser, 'read', 'post')).toBe(true);
      expect(canAlready.can(regularUser, 'write', 'post')).toBe(false);
      
      expect(canAlready.can(moderatorUser, 'delete', {
        type: 'post', organisationId: 'org1'
      })).toBe(true);

      expect(canAlready.can(moderatorUser, 'delete', {
        type: 'post', organisationId: 'org2'
      })).toBe(false);
    });

    it('should work with condition functions reading fields off the record', () => {
      const ownershipCondition = (role: UserRole, action: string, profile: any) => {
        return role.userId === profile.ownerId;
      };

      canAlready.allow(SimpleRole.USER, 'edit', 'profile', ownershipCondition);

      const user1 = createUserRole('user', '1', 'org1');
      const user2 = createUserRole('user', '2', 'org1');

      expect(canAlready.can(user1, 'edit', {
        type: 'profile', ownerId: '1'
      })).toBe(true);

      expect(canAlready.can(user1, 'edit', {
        type: 'profile', ownerId: '2'
      })).toBe(false);

      expect(canAlready.can(user2, 'edit', {
        type: 'profile', ownerId: '2'
      })).toBe(true);
    });

    it('should read genuinely external context from the 4th options argument', () => {
      const canMoveWithinOrg = (role: UserRole, action: string, doc: any, options?: any) =>
        doc.organisationId === role.organisationId && options?.targetFolderId != null;

      canAlready.allow(SimpleRole.USER, 'move', 'document', canMoveWithinOrg);

      const user = createUserRole('user', '1', 'org1');
      const doc = { type: 'document', organisationId: 'org1' };

      expect(canAlready.can(user, 'move', doc, { targetFolderId: 'f-1' })).toBe(true);
      expect(canAlready.can(user, 'move', doc)).toBe(false);
    });

    it('should support multi-role runtime evaluation', () => {
      const user = createUserRole('user', '1', 'org1');
      const moderator = createUserRole('moderator', '1', 'org1');

      expect(canAlready.can([user, moderator], 'read', 'post')).toBe(true);
      expect(canAlready.can([user, moderator], 'delete', {
        type: 'post', organisationId: 'org1'
      })).toBe(true);
    });

    it('should work with cannot() method', () => {
      const user = createUserRole('user', '1', 'org1');
      
      expect(canAlready.cannot(user, 'write', 'post')).toBe(true);
      expect(canAlready.cannot(user, 'read', 'post')).toBe(false);
    });

    it('should work with authorize() method', () => {
      const user = createUserRole('user', '1', 'org1');
      const admin = createUserRole('admin', '2', 'org1');

      expect(() => {
        canAlready.authorize(user, 'read', 'post');
      }).not.toThrow();

      expect(() => {
        canAlready.authorize(user, 'delete', 'post');
      }).toThrow(/Access denied for role 'user'/);

      expect(() => {
        canAlready.authorize(admin, 'delete', 'post');
      }).not.toThrow();
    });
  });

  describe('Complex scenarios', () => {
    it('should handle complex organizational permissions', () => {
      const isManagerInSameOrg = (role: UserRole, action: string, report: any) => {
        return role.role === 'manager' &&
               role.organisationId === report.organisationId;
      };

      const isOwnerOrManager = (role: UserRole, action: string, doc: any) => {
        return role.userId === doc.ownerId ||
               (role.role === 'manager' && role.organisationId === doc.organisationId);
      };

      canAlready.allow('manager', 'read', 'reports', isManagerInSameOrg);
      canAlready.allow('user', 'edit', 'document', isOwnerOrManager);

      const manager = createUserRole('manager', '1', 'org1');
      const user = createUserRole('user', '2', 'org1');
      const userDiffOrg = createUserRole('user', '3', 'org2');

      expect(canAlready.can(manager, 'read', {
        type: 'reports', organisationId: 'org1'
      })).toBe(true);

      expect(canAlready.can(manager, 'read', {
        type: 'reports', organisationId: 'org2'
      })).toBe(false);

      expect(canAlready.can(user, 'edit', {
        type: 'document', ownerId: '2', organisationId: 'org1'
      })).toBe(true);

      expect(canAlready.can(userDiffOrg, 'edit', {
        type: 'document', ownerId: '2', organisationId: 'org1'
      })).toBe(false);
    });

    it('should handle role resolver correctly for both definition and runtime types', () => {
      const customOptions: CanAlreadyOptions<string | { name: string; level: number }, string, string> = {
        roleResolver: (role) => typeof role === 'string' ? role : `${role.name}_${role.level}`,
        actionResolver: (action) => action,
        resourceResolver: (resource) => resource,
        errorFactory: (message) => new Error(message)
      };

      const dualCanAlready = new CanAlready<string, { name: string; level: number }, string, string>(customOptions);

      dualCanAlready.allow('premium_user_5', 'access', 'feature');

      const runtimeRole = { name: 'premium_user', level: 5 };
      
      expect(dualCanAlready.can(runtimeRole, 'access', 'feature')).toBe(true);
    });
  });

  describe('Export/Import with dual generics', () => {
    beforeEach(() => {
      canAlready.allow(SimpleRole.ADMIN, '*', '*');
      canAlready.allow(SimpleRole.USER, 'read', 'post');
    });

    it('should export permissions using definition role types', () => {
      const exported = canAlready.exportPermissions([SimpleRole.ADMIN, SimpleRole.USER]);
      const parsed = JSON.parse(exported);
      
      expect(parsed).toHaveProperty('admin.*.*', true);
      expect(parsed).toHaveProperty('user.read.post', true);
    });

    it('should import permissions correctly', () => {
      const permissions = {
        moderator: {
          '*': {
            comment: true
          }
        }
      };
      
      canAlready.importPermissions(JSON.stringify(permissions));
      
      const moderator = createUserRole('moderator', '1', 'org1');
      expect(canAlready.can(moderator, 'delete', 'comment')).toBe(true);
    });
  });

  describe('Debug mode with dual generics', () => {
    it('should log debug info with proper role resolution', () => {
      const debugCanAlready = new CanAlready<SimpleRole, UserRole, string, any>({ ...defaultOptions, debug: true });
      debugCanAlready.allow(SimpleRole.USER, 'read', 'post');
      
      const user = createUserRole('user', '1', 'org1');
      debugCanAlready.can(user, 'read', 'post');
      
      expect(consoleDebugSpy).toHaveBeenCalledWith('CanAlready:', expect.objectContaining({
        operation: 'can',
        role: 'user',
        action: 'read',
        resource: 'post',
        result: true
      }));
    });
  });

  describe('Error handling', () => {
    it('should let condition function errors bubble up', () => {
      const errorCondition = () => {
        throw new Error('Condition error');
      };

      canAlready.allow(SimpleRole.USER, 'read', 'post', errorCondition);

      const user = createUserRole('user', '1', 'org1');
      expect(() => canAlready.can(user, 'read', 'post')).toThrow('Condition error');
    });

    it('should handle empty roles array', () => {
      const user = createUserRole('user', '1', 'org1');
      canAlready.allow(SimpleRole.USER, 'read', 'post');
      
      expect(canAlready.can([], 'read', 'post')).toBe(false);
    });
  });
});