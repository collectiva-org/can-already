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

export class CanAlready<DefinitionRole = string, RuntimeRole = DefinitionRole, Action = string, Resource = string> {
  private storage: PermissionStorage<RuntimeRole, Action, Resource> = {};
  private options: CanAlreadyOptions<DefinitionRole | RuntimeRole, Action, Resource>;

  constructor(options: CanAlreadyOptions<DefinitionRole | RuntimeRole, Action, Resource>) {
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
    this.assertSpecificAction('can', action, resource);
    return this.evaluateCan(role, action, resource, options);
  };

  cannot = (
    role: RuntimeRole | RuntimeRole[],
    action: Action,
    resource: Resource,
    options?: any
  ): boolean => {
    this.assertSpecificAction('cannot', action, resource);
    return !this.evaluateCan(role, action, resource, options);
  };

  authorize = (
    role: RuntimeRole | RuntimeRole[],
    action: Action,
    resource: Resource | Resource[],
    options?: any
  ): void => {
    const resources = Array.isArray(resource) ? resource : [resource];

    for (const res of resources) {
      this.assertSpecificAction('authorize', action, res);

      if (!this.evaluateCan(role, action, res, options)) {
        const allowedRoles = this.findAllowedRoles(action, res);
        const message = `Access denied for role '${this.resolveRoleString(role)}' to perform '${this.options.actionResolver(action)}' on '${this.options.resourceResolver(res)}'`;
        throw this.options.errorFactory(message, allowedRoles);
      }

      if (this.options.debug) {
        this.logDebug('authorize', role, action, res, true);
      }
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

  private assertSpecificAction(method: 'can' | 'cannot' | 'authorize', action: Action, resource: Resource): void {
    const actionKey = this.options.actionResolver(action);
    if (WILDCARD_ACTIONS.has(actionKey)) {
      throw new Error(
        `${method}() called with wildcard action '${actionKey}' on '${this.options.resourceResolver(resource)}'. ` +
        `Checking a wildcard action is an anti-pattern: it only succeeds when the caller has been granted every action on the resource. ` +
        `Check the specific action the caller is about to perform instead.`
      );
    }
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

    const checkPaths = [
      [roleKey, actionKey, resourceKey],
      [roleKey, '*', resourceKey],
      [roleKey, actionKey, '*'],
      [roleKey, '*', '*'],
      ['*', actionKey, resourceKey],
      ['*', '*', resourceKey],
      ['*', actionKey, '*'],
      ['*', '*', '*']
    ];

    for (const [r, a, res] of checkPaths) {
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

  private findAllowedRoles(
    action: Action,
    resource: Resource,
  ): string[] {
    const actionKey = this.options.actionResolver(action);
    const resourceKey = this.options.resourceResolver(resource);
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