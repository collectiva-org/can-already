import { describe, it, expect, beforeEach } from 'vitest';
import { CanAlready } from '../src/can-already';

describe('CanAlready Performance Tests', () => {
  let canAlready: CanAlready<string, string, string>;

  beforeEach(() => {
    canAlready = new CanAlready({
      debug: false,
      roleResolver: (role) => role,
      actionResolver: (action) => action,
      resourceResolver: (resource) => resource,
      errorFactory: (message, allowedRoles) => new Error(message)
    });
  });

  describe('O(1) Lookup Performance', () => {
    it('should maintain O(1) performance with large permission sets', () => {
      const numPermissions = 10000;
      const roles = Array.from({ length: 100 }, (_, i) => `role${i}`);
      const actions = Array.from({ length: 10 }, (_, i) => `action${i}`);
      const resources = Array.from({ length: 100 }, (_, i) => `resource${i}`);

      for (let i = 0; i < numPermissions; i++) {
        const role = roles[i % roles.length];
        const action = actions[i % actions.length];
        const resource = resources[i % resources.length];
        canAlready.allow(role, action, resource);
      }

      const testRole = 'role50';
      const testAction = 'action5';
      const testResource = 'resource50';

      canAlready.allow(testRole, testAction, testResource);

      const start = performance.now();
      const result = canAlready.can(testRole, testAction, testResource);
      const end = performance.now();

      const lookupTime = end - start;
      
      expect(lookupTime).toBeLessThan(1);
      expect(result).toBe(true);
    });

    it('should have consistent lookup times regardless of permission count', () => {
      const lookupTimes: number[] = [];
      const permissionCounts = [100, 1000, 5000, 10000];

      for (const count of permissionCounts) {
        const testCanAlready = new CanAlready({
          debug: false,
          roleResolver: (role) => role,
          actionResolver: (action) => action,
          resourceResolver: (resource) => resource,
          errorFactory: (message, allowedRoles) => new Error(message)
        });

        for (let i = 0; i < count; i++) {
          testCanAlready.allow(`role${i % 100}`, `action${i % 10}`, `resource${i % 100}`);
        }

        const start = performance.now();
        testCanAlready.can('role50', 'action5', 'resource75');
        const end = performance.now();

        lookupTimes.push(end - start);
      }

      const maxTime = Math.max(...lookupTimes);
      const minTime = Math.min(...lookupTimes);
      const variance = maxTime - minTime;

      expect(variance).toBeLessThan(0.5);
    });
  });

  describe('Memory Usage', () => {
    it('should scale memory linearly with permission count', () => {
      const getMemoryUsage = () => {
        if (typeof process !== 'undefined' && process.memoryUsage) {
          return process.memoryUsage().heapUsed;
        }
        return 0;
      };

      const baseline = getMemoryUsage();
      
      for (let i = 0; i < 10000; i++) {
        canAlready.allow(`role${i % 100}`, `action${i % 10}`, `resource${i % 100}`);
      }

      const afterPermissions = getMemoryUsage();
      const memoryIncrease = afterPermissions - baseline;

      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('Condition Function Performance', () => {
    it('should handle condition functions efficiently', () => {
      const complexCondition = (role: string, action: string, resource: string, options?: any) => {
        let result = true;
        for (let i = 0; i < 100; i++) {
          result = result && (options?.userId !== undefined);
        }
        return result;
      };

      canAlready.allow('user', 'read', 'post', complexCondition);

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        canAlready.can('user', 'read', 'post', { userId: 1 });
      }
      const end = performance.now();

      const avgTime = (end - start) / 1000;
      expect(avgTime).toBeLessThan(0.1);
    });
  });

  describe('Wildcard Performance', () => {
    it('should maintain performance with wildcard rules', () => {
      for (let i = 0; i < 1000; i++) {
        canAlready.allow(`role${i}`, '*', `resource${i}`);
        canAlready.allow(`role${i}`, 'manage', '*');
        canAlready.allow('*', `action${i}`, `resource${i}`);
      }

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        canAlready.can(`role${i % 100}`, `action${i % 10}`, `resource${i % 100}`);
      }
      const end = performance.now();

      const avgTime = (end - start) / 1000;
      expect(avgTime).toBeLessThan(0.01);
    });
  });

  describe('Export/Import Performance', () => {
    it('should export permissions efficiently', () => {
      const roles = Array.from({ length: 100 }, (_, i) => `role${i}`);
      
      for (let i = 0; i < 5000; i++) {
        canAlready.allow(`role${i % 100}`, `action${i % 10}`, `resource${i % 100}`);
      }

      const start = performance.now();
      const exported = canAlready.exportPermissions(roles.slice(0, 50));
      const end = performance.now();

      expect(end - start).toBeLessThan(100);
      expect(exported.length).toBeGreaterThan(0);
    });

    it('should import permissions efficiently', () => {
      const permissions = {};
      for (let i = 0; i < 1000; i++) {
        const role = `role${i % 100}`;
        const action = `action${i % 10}`;
        const resource = `resource${i % 100}`;
        
        if (!permissions[role]) permissions[role] = {};
        if (!permissions[role][action]) permissions[role][action] = {};
        permissions[role][action][resource] = true;
      }

      const permissionsJson = JSON.stringify(permissions);

      const start = performance.now();
      canAlready.importPermissions(permissionsJson);
      const end = performance.now();

      expect(end - start).toBeLessThan(100);
    });
  });
});