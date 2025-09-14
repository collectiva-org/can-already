import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CanAlready } from '../src/can-already';
import type { CanAlreadyOptions } from '../src/types';

enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator'
}

enum UserAction {
  READ = 'read',
  WRITE = 'write',
  DELETE = 'delete'
}

enum UserResource {
  POST = 'post',
  PROFILE = 'profile',
  COMMENT = 'comment'
}

describe('CanAlready', () => {
  let canAlready: CanAlready<UserRole, UserAction, UserResource>;
  let consoleDebugSpy: any;

  const defaultOptions: CanAlreadyOptions<UserRole, UserAction, UserResource> = {
    debug: false,
    roleResolver: (role) => role.toString(),
    actionResolver: (action) => action.toString(),
    resourceResolver: (resource) => resource.toString(),
    errorFactory: (message, allowedRoles) => 
      new Error(`${message}. Allowed roles: ${allowedRoles.join(', ')}`),
  };

  beforeEach(() => {
    canAlready = new CanAlready(defaultOptions);
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  describe('Constructor', () => {
    it('should create instance with provided options', () => {
      expect(canAlready).toBeInstanceOf(CanAlready);
    });
  });

  describe('allow()', () => {
    it('should allow single role, action, resource', () => {
      canAlready.allow(UserRole.USER, UserAction.READ, UserResource.POST);
      
      expect(canAlready.can(UserRole.USER, UserAction.READ, UserResource.POST)).toBe(true);
      expect(canAlready.can(UserRole.USER, UserAction.WRITE, UserResource.POST)).toBe(false);
    });

    it('should allow multiple roles', () => {
      canAlready.allow([UserRole.USER, UserRole.MODERATOR], UserAction.READ, UserResource.POST);
      
      expect(canAlready.can(UserRole.USER, UserAction.READ, UserResource.POST)).toBe(true);
      expect(canAlready.can(UserRole.MODERATOR, UserAction.READ, UserResource.POST)).toBe(true);
      expect(canAlready.can(UserRole.ADMIN, UserAction.READ, UserResource.POST)).toBe(false);
    });

    it('should allow multiple actions', () => {
      canAlready.allow(UserRole.USER, [UserAction.READ, UserAction.WRITE], UserResource.POST);
      
      expect(canAlready.can(UserRole.USER, UserAction.READ, UserResource.POST)).toBe(true);
      expect(canAlready.can(UserRole.USER, UserAction.WRITE, UserResource.POST)).toBe(true);
      expect(canAlready.can(UserRole.USER, UserAction.DELETE, UserResource.POST)).toBe(false);
    });

    it('should allow multiple resources', () => {
      canAlready.allow(UserRole.USER, UserAction.READ, [UserResource.POST, UserResource.COMMENT]);
      
      expect(canAlready.can(UserRole.USER, UserAction.READ, UserResource.POST)).toBe(true);
      expect(canAlready.can(UserRole.USER, UserAction.READ, UserResource.COMMENT)).toBe(true);
      expect(canAlready.can(UserRole.USER, UserAction.READ, UserResource.PROFILE)).toBe(false);
    });

    it('should allow with condition function', () => {
      const condition = (role: UserRole, action: UserAction, resource: UserResource, options?: any) => {
        return options?.userId === options?.targetUserId;
      };

      canAlready.allow(UserRole.USER, UserAction.WRITE, UserResource.PROFILE, condition);
      
      expect(canAlready.can(UserRole.USER, UserAction.WRITE, UserResource.PROFILE, { 
        userId: 1, targetUserId: 1 
      })).toBe(true);
      
      expect(canAlready.can(UserRole.USER, UserAction.WRITE, UserResource.PROFILE, { 
        userId: 1, targetUserId: 2 
      })).toBe(false);
    });

    it('should handle condition function errors gracefully', () => {
      const errorCondition = () => {
        throw new Error('Condition error');
      };

      canAlready.allow(UserRole.USER, UserAction.READ, UserResource.POST, errorCondition);
      
      expect(canAlready.can(UserRole.USER, UserAction.READ, UserResource.POST)).toBe(false);
    });
  });

  describe('Wildcard support', () => {
    it('should support "*" wildcard for actions', () => {
      canAlready.allow(UserRole.ADMIN, '*' as any, UserResource.POST);
      
      expect(canAlready.can(UserRole.ADMIN, UserAction.READ, UserResource.POST)).toBe(true);
      expect(canAlready.can(UserRole.ADMIN, UserAction.WRITE, UserResource.POST)).toBe(true);
      expect(canAlready.can(UserRole.ADMIN, UserAction.DELETE, UserResource.POST)).toBe(true);
    });

    it('should support "manage" wildcard for actions (backwards compatibility)', () => {
      canAlready.allow(UserRole.ADMIN, 'manage' as any, UserResource.POST);
      
      expect(canAlready.can(UserRole.ADMIN, UserAction.READ, UserResource.POST)).toBe(true);
      expect(canAlready.can(UserRole.ADMIN, UserAction.WRITE, UserResource.POST)).toBe(true);
      expect(canAlready.can(UserRole.ADMIN, UserAction.DELETE, UserResource.POST)).toBe(true);
    });

    it('should support "*" wildcard for resources', () => {
      canAlready.allow(UserRole.ADMIN, UserAction.READ, '*' as any);
      
      expect(canAlready.can(UserRole.ADMIN, UserAction.READ, UserResource.POST)).toBe(true);
      expect(canAlready.can(UserRole.ADMIN, UserAction.READ, UserResource.PROFILE)).toBe(true);
      expect(canAlready.can(UserRole.ADMIN, UserAction.READ, UserResource.COMMENT)).toBe(true);
    });

    it('should support "*" wildcard for roles', () => {
      canAlready.allow('*' as any, UserAction.READ, UserResource.POST);
      
      expect(canAlready.can(UserRole.USER, UserAction.READ, UserResource.POST)).toBe(true);
      expect(canAlready.can(UserRole.ADMIN, UserAction.READ, UserResource.POST)).toBe(true);
      expect(canAlready.can(UserRole.MODERATOR, UserAction.READ, UserResource.POST)).toBe(true);
    });

    it('should support full wildcard permissions', () => {
      canAlready.allow(UserRole.ADMIN, '*' as any, '*' as any);
      
      expect(canAlready.can(UserRole.ADMIN, UserAction.READ, UserResource.POST)).toBe(true);
      expect(canAlready.can(UserRole.ADMIN, UserAction.WRITE, UserResource.PROFILE)).toBe(true);
      expect(canAlready.can(UserRole.ADMIN, UserAction.DELETE, UserResource.COMMENT)).toBe(true);
    });

    it('should prioritize specific permissions over wildcards', () => {
      canAlready.allow(UserRole.USER, '*' as any, UserResource.POST, () => true);
      canAlready.allow(UserRole.USER, UserAction.DELETE, UserResource.POST, () => false);
      
      expect(canAlready.can(UserRole.USER, UserAction.READ, UserResource.POST)).toBe(true);
      expect(canAlready.can(UserRole.USER, UserAction.DELETE, UserResource.POST)).toBe(false);
    });
  });

  describe('can()', () => {
    beforeEach(() => {
      canAlready.allow(UserRole.USER, UserAction.READ, UserResource.POST);
    });

    it('should return true for allowed permissions', () => {
      expect(canAlready.can(UserRole.USER, UserAction.READ, UserResource.POST)).toBe(true);
    });

    it('should return false for denied permissions', () => {
      expect(canAlready.can(UserRole.USER, UserAction.WRITE, UserResource.POST)).toBe(false);
    });

    it('should log debug info when debug is enabled', () => {
      const debugCanAlready = new CanAlready({ ...defaultOptions, debug: true });
      debugCanAlready.allow(UserRole.USER, UserAction.READ, UserResource.POST);
      
      debugCanAlready.can(UserRole.USER, UserAction.READ, UserResource.POST);
      
      expect(consoleDebugSpy).toHaveBeenCalledWith('CanAlready:', expect.objectContaining({
        operation: 'can',
        role: 'user',
        action: 'read',
        resource: 'post',
        result: true
      }));
    });
  });

  describe('cannot()', () => {
    beforeEach(() => {
      canAlready.allow(UserRole.USER, UserAction.READ, UserResource.POST);
    });

    it('should return false for allowed permissions', () => {
      expect(canAlready.cannot(UserRole.USER, UserAction.READ, UserResource.POST)).toBe(false);
    });

    it('should return true for denied permissions', () => {
      expect(canAlready.cannot(UserRole.USER, UserAction.WRITE, UserResource.POST)).toBe(true);
    });
  });

  describe('authorize()', () => {
    beforeEach(() => {
      canAlready.allow(UserRole.USER, UserAction.READ, UserResource.POST);
      canAlready.allow(UserRole.ADMIN, '*' as any, '*' as any);
    });

    it('should not throw for allowed permissions', () => {
      expect(() => {
        canAlready.authorize(UserRole.USER, UserAction.READ, UserResource.POST);
      }).not.toThrow();
    });

    it('should throw for denied permissions with allowed roles', () => {
      expect(() => {
        canAlready.authorize(UserRole.USER, UserAction.DELETE, UserResource.POST);
      }).toThrow('Access denied for role \'user\' to perform \'delete\' on \'post\'. Allowed roles: admin');
    });

    it('should include multiple allowed roles in error', () => {
      canAlready.allow(UserRole.MODERATOR, UserAction.DELETE, UserResource.POST);
      
      expect(() => {
        canAlready.authorize(UserRole.USER, UserAction.DELETE, UserResource.POST);
      }).toThrow(/Allowed roles: (admin, moderator|moderator, admin)/);
    });
  });

  describe('exportPermissions()', () => {
    beforeEach(() => {
      canAlready.allow(UserRole.USER, UserAction.READ, UserResource.POST);
      canAlready.allow(UserRole.ADMIN, '*' as any, '*' as any);
      canAlready.allow(UserRole.MODERATOR, UserAction.DELETE, UserResource.COMMENT, () => true);
    });

    it('should export permissions for specified roles', () => {
      const exported = canAlready.exportPermissions([UserRole.USER, UserRole.ADMIN]);
      const parsed = JSON.parse(exported);
      
      expect(parsed).toHaveProperty('user.read.post', true);
      expect(parsed).toHaveProperty('admin.*.*', true);
      expect(parsed).not.toHaveProperty('moderator');
    });

    it('should export condition functions as function names by default', () => {
      const namedCondition = function isOwner() { return true; };
      canAlready.allow(UserRole.USER, UserAction.WRITE, UserResource.PROFILE, namedCondition);
      
      const exported = canAlready.exportPermissions([UserRole.USER]);
      const parsed = JSON.parse(exported);
      
      expect(parsed.user.write.profile).toBe('isOwner');
    });

    it('should use custom condition exporter when provided', () => {
      const customCanAlready = new CanAlready({
        ...defaultOptions,
        conditionExporter: (fn) => `custom_${fn.name}`
      });
      
      const namedCondition = function isOwner() { return true; };
      customCanAlready.allow(UserRole.USER, UserAction.WRITE, UserResource.PROFILE, namedCondition);
      
      const exported = customCanAlready.exportPermissions([UserRole.USER]);
      const parsed = JSON.parse(exported);
      
      expect(parsed.user.write.profile).toBe('custom_isOwner');
    });
  });

  describe('importPermissions()', () => {
    it('should import basic permissions', () => {
      const permissions = {
        user: {
          read: {
            post: true
          }
        }
      };
      
      canAlready.importPermissions(JSON.stringify(permissions));
      
      expect(canAlready.can(UserRole.USER, UserAction.READ, UserResource.POST)).toBe(true);
    });

    it('should import condition functions when importer provided', () => {
      const conditionRegistry = {
        isOwner: (role: UserRole, action: UserAction, resource: UserResource, options?: any) => {
          return options?.userId === options?.targetUserId;
        }
      };

      const customCanAlready = new CanAlready({
        ...defaultOptions,
        conditionImporter: (fnName) => conditionRegistry[fnName as keyof typeof conditionRegistry]
      });

      const permissions = {
        user: {
          write: {
            profile: 'isOwner'
          }
        }
      };
      
      customCanAlready.importPermissions(JSON.stringify(permissions));
      
      expect(customCanAlready.can(UserRole.USER, UserAction.WRITE, UserResource.PROFILE, {
        userId: 1, targetUserId: 1
      })).toBe(true);
      
      expect(customCanAlready.can(UserRole.USER, UserAction.WRITE, UserResource.PROFILE, {
        userId: 1, targetUserId: 2
      })).toBe(false);
    });

    it('should merge with existing permissions', () => {
      canAlready.allow(UserRole.USER, UserAction.READ, UserResource.POST);
      
      const newPermissions = {
        user: {
          write: {
            post: true
          }
        }
      };
      
      canAlready.importPermissions(JSON.stringify(newPermissions));
      
      expect(canAlready.can(UserRole.USER, UserAction.READ, UserResource.POST)).toBe(true);
      expect(canAlready.can(UserRole.USER, UserAction.WRITE, UserResource.POST)).toBe(true);
    });
  });

  describe('Complex resolver scenarios', () => {
    interface User {
      id: number;
      role: string;
    }

    interface Post {
      id: number;
      authorId: number;
    }

    it('should work with complex object resolvers', () => {
      const objectCanAlready = new CanAlready<User, string, Post>({
        debug: false,
        roleResolver: (user) => user.role,
        actionResolver: (action) => action,
        resourceResolver: (post) => `post_${post.id}`,
        errorFactory: (message, allowedRoles) => new Error(message)
      });

      const user = { id: 1, role: 'user' };
      const post = { id: 123, authorId: 1 };

      objectCanAlready.allow(user, 'read', post);
      
      expect(objectCanAlready.can(user, 'read', post)).toBe(true);
    });
  });

  describe('Multi-role support', () => {
    beforeEach(() => {
      canAlready.allow(UserRole.USER, UserAction.READ, UserResource.POST);
      canAlready.allow(UserRole.MODERATOR, UserAction.DELETE, UserResource.COMMENT);
      canAlready.allow(UserRole.ADMIN, '*' as any, '*' as any);
    });

    it('should check permissions for multiple roles and return true if any role has permission', () => {
      expect(canAlready.can([UserRole.USER, UserRole.MODERATOR], UserAction.READ, UserResource.POST)).toBe(true);
      expect(canAlready.can([UserRole.USER, UserRole.MODERATOR], UserAction.DELETE, UserResource.COMMENT)).toBe(true);
      expect(canAlready.can([UserRole.USER, UserRole.ADMIN], UserAction.WRITE, UserResource.PROFILE)).toBe(true);
    });

    it('should return false if none of the roles have permission', () => {
      expect(canAlready.can([UserRole.USER, UserRole.MODERATOR], UserAction.WRITE, UserResource.PROFILE)).toBe(false);
    });

    it('should work with single role (backwards compatibility)', () => {
      expect(canAlready.can(UserRole.USER, UserAction.READ, UserResource.POST)).toBe(true);
      expect(canAlready.can(UserRole.USER, UserAction.WRITE, UserResource.POST)).toBe(false);
    });

    it('should work with empty roles array', () => {
      expect(canAlready.can([], UserAction.READ, UserResource.POST)).toBe(false);
    });

    it('should work with condition functions for multi-role', () => {
      const condition = (role: UserRole, action: UserAction, resource: UserResource, options?: any) => {
        return options?.userId === options?.targetUserId;
      };

      canAlready.allow(UserRole.USER, UserAction.WRITE, UserResource.PROFILE, condition);
      
      expect(canAlready.can([UserRole.USER, UserRole.MODERATOR], UserAction.WRITE, UserResource.PROFILE, { 
        userId: 1, targetUserId: 1 
      })).toBe(true);
      
      expect(canAlready.can([UserRole.USER, UserRole.MODERATOR], UserAction.WRITE, UserResource.PROFILE, { 
        userId: 1, targetUserId: 2 
      })).toBe(false);
    });

    it('should support cannot() with multiple roles', () => {
      expect(canAlready.cannot([UserRole.USER, UserRole.MODERATOR], UserAction.READ, UserResource.POST)).toBe(false);
      expect(canAlready.cannot([UserRole.USER, UserRole.MODERATOR], UserAction.WRITE, UserResource.PROFILE)).toBe(true);
    });

    it('should support authorize() with multiple roles', () => {
      expect(() => {
        canAlready.authorize([UserRole.USER, UserRole.MODERATOR], UserAction.READ, UserResource.POST);
      }).not.toThrow();

      expect(() => {
        canAlready.authorize([UserRole.USER, UserRole.MODERATOR], UserAction.WRITE, UserResource.PROFILE);
      }).toThrow('Access denied');
    });

    it('should log debug info for multi-role when debug is enabled', () => {
      const debugCanAlready = new CanAlready({ ...defaultOptions, debug: true });
      debugCanAlready.allow(UserRole.USER, UserAction.READ, UserResource.POST);
      
      debugCanAlready.can([UserRole.USER, UserRole.MODERATOR], UserAction.READ, UserResource.POST);
      
      expect(consoleDebugSpy).toHaveBeenCalledWith('CanAlready:', expect.objectContaining({
        operation: 'can',
        result: true
      }));
    });
  });

  describe('Edge cases', () => {
    it('should handle empty permission storage', () => {
      expect(canAlready.can(UserRole.USER, UserAction.READ, UserResource.POST)).toBe(false);
    });

    it('should handle undefined options in condition functions', () => {
      const condition = (role: UserRole, action: UserAction, resource: UserResource, options?: any) => {
        return options?.userId === 1;
      };

      canAlready.allow(UserRole.USER, UserAction.READ, UserResource.POST, condition);
      
      expect(canAlready.can(UserRole.USER, UserAction.READ, UserResource.POST)).toBe(false);
      expect(canAlready.can(UserRole.USER, UserAction.READ, UserResource.POST, {})).toBe(false);
      expect(canAlready.can(UserRole.USER, UserAction.READ, UserResource.POST, { userId: 1 })).toBe(true);
    });

    it('should handle malformed JSON in importPermissions', () => {
      expect(() => {
        canAlready.importPermissions('invalid json');
      }).toThrow();
    });

    it('should handle missing condition importer gracefully', () => {
      const permissions = {
        user: {
          read: {
            post: 'someFunction'
          }
        }
      };
      
      canAlready.importPermissions(JSON.stringify(permissions));
      
      expect(canAlready.can(UserRole.USER, UserAction.READ, UserResource.POST)).toBe(false);
    });
  });
});