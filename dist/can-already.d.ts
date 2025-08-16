import { CanAlreadyOptions, ConditionFunction } from './types';
export declare class CanAlready<Role = string, Action = string, Resource = string> {
    private storage;
    private options;
    constructor(options: CanAlreadyOptions<Role, Action, Resource>);
    allow: (role: Role | Role[], action: Action | Action[], resource: Resource | Resource[], condition?: ConditionFunction<Role, Action, Resource>) => void;
    can: (role: Role, action: Action, resource: Resource, options?: any) => boolean;
    cannot: (role: Role, action: Action, resource: Resource, options?: any) => boolean;
    authorize: (role: Role, action: Action, resource: Resource, options?: any) => void;
    exportPermissions: (roles: Role[]) => string;
    importPermissions: (permissionsJson: string) => void;
    private setPermission;
    private checkPermission;
    private findAllowedRoles;
    private parseRoleFromKey;
    private logDebug;
}
