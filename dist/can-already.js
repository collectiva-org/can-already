"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CanAlready = void 0;
class CanAlready {
    constructor(options) {
        this.storage = {};
        this.allow = (role, action, resource, condition) => {
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
        this.can = (role, action, resource, options) => {
            let result = false;
            const roles = Array.isArray(role) ? role : [role];
            for (const r of roles) {
                result = this.checkPermission(r, action, resource, options);
                if (result)
                    break;
            }
            if (this.options.debug) {
                this.logDebug('can', role, action, resource, result);
            }
            return result;
        };
        this.cannot = (role, action, resource, options) => {
            const result = !this.can(role, action, resource, options);
            if (this.options.debug) {
                this.logDebug('cannot', role, action, resource, result);
            }
            return result;
        };
        this.authorize = (role, action, resource, options) => {
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
        this.exportPermissions = (roles) => {
            const roleKeys = roles.map(role => this.options.roleResolver(role));
            const exportData = {};
            for (const roleKey of roleKeys) {
                if (this.storage[roleKey]) {
                    exportData[roleKey] = {};
                    for (const action in this.storage[roleKey]) {
                        exportData[roleKey][action] = {};
                        for (const resource in this.storage[roleKey][action]) {
                            const permission = this.storage[roleKey][action][resource];
                            if (typeof permission === 'boolean') {
                                exportData[roleKey][action][resource] = permission;
                            }
                            else if (typeof permission === 'function') {
                                const exporter = this.options.conditionExporter || ((fn) => fn.name);
                                exportData[roleKey][action][resource] = exporter(permission);
                            }
                        }
                    }
                }
            }
            return JSON.stringify(exportData);
        };
        this.importPermissions = (permissionsJson) => {
            const importData = JSON.parse(permissionsJson);
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
                        }
                        else if (typeof permission === 'string' && this.options.conditionImporter) {
                            const condition = this.options.conditionImporter(permission);
                            if (condition) {
                                this.storage[role][action][resource] = condition;
                            }
                        }
                    }
                }
            }
        };
        this.options = options;
    }
    setPermission(role, action, resource, permission) {
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
    checkPermission(role, action, resource, options) {
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
                }
                else if (typeof permission === 'function') {
                    try {
                        return permission(role, action, resource, options);
                    }
                    catch (error) {
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
    findAllowedRoles(action, resource, options) {
        const actionKey = this.options.actionResolver(action);
        const resourceKey = this.options.resourceResolver(resource);
        const allowedRoles = [];
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
                    }
                    else if (typeof permission === 'function') {
                        try {
                            hasPermission = permission(this.parseRoleFromKey(roleKey), action, resource, options);
                        }
                        catch (error) {
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
    parseRoleFromKey(roleKey) {
        return roleKey;
    }
    logDebug(operation, role, action, resource, result) {
        const debugInfo = {
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
exports.CanAlready = CanAlready;
//# sourceMappingURL=can-already.js.map