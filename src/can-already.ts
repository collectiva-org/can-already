import {
  CanAlreadyOptions,
  PermissionStorage,
  PermissionValue,
  ConditionFunction,
  DebugInfo,
  SerializablePermission
} from './types';

export class CanAlready<Role = string, Action = string, Resource = string> {
  private storage: PermissionStorage<Role, Action, Resource> = {};
  private options: CanAlreadyOptions<Role, Action, Resource>;

  constructor(options: CanAlreadyOptions<Role, Action, Resource>) {
    this.options = options;
  }

  allow = (
    role: Role | Role[],
    action: Action | Action[],
    resource: Resource | Resource[],
    condition?: ConditionFunction<Role, Action, Resource>
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

  can = (
    role: Role | Role[],
    action: Action,
    resource: Resource,
    options?: any
  ): boolean => {
    let result = false;
    const roles = Array.isArray(role) ? role : [role];
    
    for (const r of roles) {
      result = this.checkPermission(r, action, resource, options);
      if (result) break;
    }
    
    if (this.options.debug) {
      this.logDebug('can', role, action, resource, result);
    }

    return result;
  };

  cannot = (
    role: Role | Role[],
    action: Action,
    resource: Resource,
    options?: any
  ): boolean => {
    const result = !this.can(role, action, resource, options);
    
    if (this.options.debug) {
      this.logDebug('cannot', role, action, resource, result);
    }

    return result;
  };

  authorize = (
    role: Role | Role[],
    action: Action,
    resource: Resource,
    options?: any
  ): void => {
    const canAccess = this.can(role, action, resource, options);
    
    if (!canAccess) {
      const allowedRoles = this.findAllowedRoles(action, resource, options);
      const roleString = Array.isArray(role) 
        ? role.map(r => this.options.roleResolver(r)).join(',')
        : this.options.roleResolver(role);
      const message = `Access denied for role '${roleString}' to perform '${this.options.actionResolver(action)}' on '${this.options.resourceResolver(resource)}'`;
      throw this.options.errorFactory(message, allowedRoles);
    }

    if (this.options.debug) {
      this.logDebug('authorize', role, action, resource, true);
    }
  };

  exportPermissions = (roles: Role[]): string => {
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
              this.storage[role][action][resource] = condition as ConditionFunction<Role, Action, Resource>;
            }
          }
        }
      }
    }
  };

  private setPermission(
    role: Role,
    action: Action,
    resource: Resource,
    permission: PermissionValue<Role, Action, Resource>
  ): void {
    const roleKey = this.options.roleResolver(role);
    let actionKey = this.options.actionResolver(action);
    const resourceKey = this.options.resourceResolver(resource);

    // Normalize "manage" to "*" for performance optimization
    if (actionKey === 'manage') {
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
    role: Role,
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
          try {
            return permission(role, action, resource, options);
          } catch (error) {
            if (this.options.debug) {
              console.debug('Condition function error:', error);
            }
            return false;
          }
        }
      }
    }

    return false;
  }

  private findAllowedRoles(
    action: Action,
    resource: Resource,
    options?: any
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
        
        if (permission !== undefined) {
          let hasPermission = false;
          
          if (typeof permission === 'boolean') {
            hasPermission = permission;
          } else if (typeof permission === 'function') {
            try {
              hasPermission = permission(
                this.parseRoleFromKey(roleKey),
                action,
                resource,
                options
              );
            } catch (error) {
              hasPermission = false;
            }
          }

          if (hasPermission && !allowedRoles.includes(roleKey)) {
            allowedRoles.push(roleKey);
            break;
          }
        }
      }
    }

    return allowedRoles;
  }

  private parseRoleFromKey(roleKey: string): Role {
    return roleKey as unknown as Role;
  }

  private logDebug(
    operation: 'can' | 'cannot' | 'authorize',
    role: Role | Role[],
    action: Action,
    resource: Resource,
    result: boolean
  ): void {
    const debugInfo: DebugInfo = {
      operation,
      role: Array.isArray(role) 
        ? role.map(r => this.options.roleResolver(r)).join(',')
        : this.options.roleResolver(role),
      action: this.options.actionResolver(action),
      resource: this.options.resourceResolver(resource),
      result,
      timestamp: new Date()
    };

    console.debug('CanAlready:', debugInfo);
  }
}