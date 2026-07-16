import {
  CanAlreadyOptions,
  PermissionStorage,
  PermissionValue,
  ConditionFunction,
  DebugInfo,
  SerializablePermission
} from './types';

const MANAGE_ACTION = 'manage';
const WILDCARD_ACTION = '*';
const WILDCARD_ACTIONS = new Set<string>([MANAGE_ACTION, WILDCARD_ACTION]);

export class CanAlready<DefinitionRole = string, RuntimeRole = DefinitionRole, Action = string, Resource = string, ResourceType = Resource> {
  private storage: PermissionStorage<RuntimeRole, Action, Resource> = {};
  private options: CanAlreadyOptions<DefinitionRole | RuntimeRole, Action, Resource, ResourceType>;

  constructor(options: CanAlreadyOptions<DefinitionRole | RuntimeRole, Action, Resource, ResourceType>) {
    this.options = options;
  }

  allow = (
    role: DefinitionRole | DefinitionRole[],
    action: Action | Action[],
    resource: Resource | Resource[],
    condition?: ConditionFunction<RuntimeRole, Action, Resource>
  ): void => {
    const roles = Array.isArray(role) ? role : [role];
    const actions = Array.isArray(action) ? action : [action];
    const resources = Array.isArray(resource) ? resource : [resource];

    for (const r of roles) {
      for (const a of actions) {
        for (const res of resources) {
          this.setPermission(r, a, res, condition || true);
        }
      }
    }
  };

  copyPermissions = (
    fromRole: DefinitionRole,
    toRole: DefinitionRole,
    options?: { allowOverwrite?: boolean }
  ): void => {
    const fromKey = this.options.roleResolver(fromRole);
    const toKey = this.options.roleResolver(toRole);

    const sourcePermissions = this.storage[fromKey];
    if (!sourcePermissions) {
      throw new Error(`No permissions found for role '${fromKey}'`);
    }

    if (!options?.allowOverwrite) {
      for (const action in sourcePermissions) {
        for (const resource in sourcePermissions[action]) {
          if (this.storage[toKey]?.[action]?.[resource] !== undefined) {
            throw new Error(
              `Permission conflict: role '${toKey}' already has a permission for action '${action}' on resource '${resource}'`
            );
          }
        }
      }
    }

    if (!this.storage[toKey]) {
      this.storage[toKey] = {};
    }

    for (const action in sourcePermissions) {
      if (!this.storage[toKey][action]) {
        this.storage[toKey][action] = {};
      }
      for (const resource in sourcePermissions[action]) {
        this.storage[toKey][action][resource] = sourcePermissions[action][resource];
      }
    }
  };

  can = (
    role: RuntimeRole | RuntimeRole[],
    action: Action,
    resource: Resource,
    options?: any
  ): boolean => {
    this.assertSpecificAction('can', this.options.actionResolver(action), this.options.resourceResolver(resource));
    return this.evaluateCan(role, action, resource, options);
  };

  cannot = (
    role: RuntimeRole | RuntimeRole[],
    action: Action,
    resource: Resource,
    options?: any
  ): boolean => {
    this.assertSpecificAction('cannot', this.options.actionResolver(action), this.options.resourceResolver(resource));
    return !this.evaluateCan(role, action, resource, options);
  };

  authorize = (
    role: RuntimeRole | RuntimeRole[],
    action: Action,
    resource: Resource | Resource[],
    options?: any
  ): void => {
    const resources = Array.isArray(resource) ? resource : [resource];
    const actionKey = this.options.actionResolver(action);

    for (const res of resources) {
      const resourceKey = this.options.resourceResolver(res);
      this.assertSpecificAction('authorize', actionKey, resourceKey);

      if (!this.evaluateCan(role, action, res, options)) {
        throw this.denyError(this.resolveRoleString(role), actionKey, resourceKey);
      }

      if (this.options.debug) {
        this.logDebug('authorize', role, action, res, true);
      }
    }
  };

  /**
   * Condition-blind pre-gate. Passes iff at least one supplied role has a matching allow() rule
   * for `action` on `resourceType`; condition functions are never invoked. Throws the SAME error
   * as authorize()'s denial.
   *
   * Necessary but not sufficient: use it to reject a forbidden request before loading records
   * (so an empty result can't leak resource existence). authorize() remains the authoritative,
   * record-bound decision.
   */
  assertAuthorizable = (
    role: RuntimeRole | RuntimeRole[],
    action: Action,
    resourceType: ResourceType
  ): void => {
    const actionKey = this.options.actionResolver(action);
    // Fallback is valid only in the default case where ResourceType === Resource (token IS the record).
    const resolveType = this.options.resourceTypeResolver
      ?? (this.options.resourceResolver as unknown as (t: ResourceType) => string);
    const resourceKey = resolveType(resourceType);

    if (resourceKey == null || resourceKey === '') {
      throw new Error(
        'assertAuthorizable: could not resolve resource type key. ' +
        'Supply resourceTypeResolver when the type token differs from the Resource record type.'
      );
    }

    this.assertSpecificAction('assertAuthorizable', actionKey, resourceKey);

    const roles = Array.isArray(role) ? role : [role];
    const reachable = roles.some(r =>
      this.roleHasRule(this.options.roleResolver(r), actionKey, resourceKey)
    );

    if (!reachable) {
      throw this.denyError(this.resolveRoleString(role), actionKey, resourceKey);
    }
  };

  exportPermissions = (roles: DefinitionRole[]): string => {
    const roleKeys = roles.map(role => this.options.roleResolver(role));
    const exportData: SerializablePermission = {};

    for (const roleKey of roleKeys) {
      if (this.storage[roleKey]) {
        exportData[roleKey] = {};
        
        for (const action in this.storage[roleKey]) {
          exportData[roleKey][action] = {};
          
          for (const resource in this.storage[roleKey][action]) {
            const permission = this.storage[roleKey][action][resource];
            
            if (typeof permission === 'boolean') {
              exportData[roleKey][action][resource] = permission;
            } else if (typeof permission === 'function') {
              const exporter = this.options.conditionExporter || ((fn: Function) => fn.name);
              exportData[roleKey][action][resource] = exporter(permission);
            }
          }
        }
      }
    }

    return JSON.stringify(exportData);
  };

  importPermissions = (permissionsJson: string): void => {
    const importData: SerializablePermission = JSON.parse(permissionsJson);

    for (const role in importData) {
      if (!this.storage[role]) {
        this.storage[role] = {};
      }

      for (const action in importData[role]) {
        if (!this.storage[role][action]) {
          this.storage[role][action] = {};
        }

        for (const resource in importData[role][action]) {
          const permission = importData[role][action][resource];
          
          if (typeof permission === 'boolean') {
            this.storage[role][action][resource] = permission;
          } else if (typeof permission === 'string' && this.options.conditionImporter) {
            const condition = this.options.conditionImporter(permission);
            if (condition) {
              this.storage[role][action][resource] = condition as ConditionFunction<RuntimeRole, Action, Resource>;
            }
          }
        }
      }
    }
  };

  private assertSpecificAction(
    method: 'can' | 'cannot' | 'authorize' | 'assertAuthorizable',
    actionKey: string,
    resourceLabel: string
  ): void {
    if (WILDCARD_ACTIONS.has(actionKey)) {
      throw new Error(
        `${method}() called with wildcard action '${actionKey}' on '${resourceLabel}'. ` +
        `Checking a wildcard action is an anti-pattern: it only succeeds when the caller has been granted every action on the resource. ` +
        `Check the specific action the caller is about to perform instead.`
      );
    }
  }

  // The role/action/resource lookup paths, most-specific first, with wildcard fallbacks.
  // Single source shared by checkPermission and roleHasRule so the two can't drift.
  private lookupPaths(roleKey: string, actionKey: string, resourceKey: string): string[][] {
    return [
      [roleKey, actionKey, resourceKey],
      [roleKey, '*', resourceKey],
      [roleKey, actionKey, '*'],
      [roleKey, '*', '*'],
      ['*', actionKey, resourceKey],
      ['*', '*', resourceKey],
      ['*', actionKey, '*'],
      ['*', '*', '*']
    ];
  }

  // Condition-blind reachability: mirrors checkPermission's paths but NEVER invokes condition
  // functions — a stored `true` or `function` both count as "a rule exists".
  private roleHasRule(roleKey: string, actionKey: string, resourceKey: string): boolean {
    return this.lookupPaths(roleKey, actionKey, resourceKey).some(([r, a, res]) => {
      const permission = this.storage[r]?.[a]?.[res];
      return permission === true || typeof permission === 'function';
    });
  }

  // Shared deny path for authorize() and assertAuthorizable() — keeps the ForbiddenError shape and
  // allowedRoles identical across both.
  private denyError(roleLabel: string, actionKey: string, resourceKey: string): Error {
    const allowedRoles = this.findAllowedRolesByKey(actionKey, resourceKey);
    const message = `Access denied for role '${roleLabel}' to perform '${actionKey}' on '${resourceKey}'`;
    return this.options.errorFactory(message, allowedRoles);
  }

  private evaluateCan(
    role: RuntimeRole | RuntimeRole[],
    action: Action,
    resource: Resource,
    options?: any
  ): boolean {
    const roles = Array.isArray(role) ? role : [role];
    const result = roles.some(r => this.checkPermission(r, action, resource, options));

    if (this.options.debug) {
      this.logDebug('can', role, action, resource, result);
    }

    return result;
  }

  private setPermission(
    role: DefinitionRole,
    action: Action,
    resource: Resource,
    permission: PermissionValue<RuntimeRole, Action, Resource>
  ): void {
    const roleKey = this.options.roleResolver(role);
    let actionKey = this.options.actionResolver(action);
    const resourceKey = this.options.resourceResolver(resource);

    // 'manage' is an alias for the wildcard action key; collapse for storage.
    if (actionKey === MANAGE_ACTION) {
      actionKey = '*';
    }

    if (!this.storage[roleKey]) {
      this.storage[roleKey] = {};
    }
    if (!this.storage[roleKey][actionKey]) {
      this.storage[roleKey][actionKey] = {};
    }

    this.storage[roleKey][actionKey][resourceKey] = permission;
  }

  private checkPermission(
    role: RuntimeRole,
    action: Action,
    resource: Resource,
    options?: any
  ): boolean {
    const roleKey = this.options.roleResolver(role);
    const actionKey = this.options.actionResolver(action);
    const resourceKey = this.options.resourceResolver(resource);

    for (const [r, a, res] of this.lookupPaths(roleKey, actionKey, resourceKey)) {
      const permission = this.storage[r]?.[a]?.[res];
      
      if (permission !== undefined) {
        if (typeof permission === 'boolean') {
          return permission;
        } else if (typeof permission === 'function') {
          return permission(role, action, resource, options);
        }
      }
    }

    return false;
  }

  private findAllowedRolesByKey(
    actionKey: string,
    resourceKey: string,
  ): string[] {
    const allowedRoles: string[] = [];

    for (const roleKey in this.storage) {
      const checkPaths = [
        [actionKey, resourceKey],
        ['*', resourceKey],
        [actionKey, '*'],
        ['*', '*']
      ];

      for (const [a, res] of checkPaths) {
        const permission = this.storage[roleKey]?.[a]?.[res];
        if (permission === true || typeof permission === 'function') {
          if (!allowedRoles.includes(roleKey)) {
            allowedRoles.push(roleKey);
          }
          break;
        }
      }
    }

    return allowedRoles;
  }

  private resolveRoleString(role: RuntimeRole | RuntimeRole[]): string {
    return Array.isArray(role)
      ? role.map(r => this.options.roleResolver(r)).join(',')
      : this.options.roleResolver(role);
  }

  private logDebug(
    operation: 'can' | 'cannot' | 'authorize',
    role: RuntimeRole | RuntimeRole[],
    action: Action,
    resource: Resource,
    result: boolean
  ): void {
    const debugInfo: DebugInfo = {
      operation,
      role: this.resolveRoleString(role),
      action: this.options.actionResolver(action),
      resource: this.options.resourceResolver(resource),
      result,
      timestamp: new Date()
    };

    console.debug('CanAlready:', debugInfo);
  }
}