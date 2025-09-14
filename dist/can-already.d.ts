import { CanAlreadyOptions, ConditionFunction } from './types';
export declare class CanAlready<DefinitionRole = string, RuntimeRole = DefinitionRole, Action = string, Resource = string> {
    private storage;
    private options;
    constructor(options: CanAlreadyOptions<DefinitionRole | RuntimeRole, Action, Resource>);
    allow: (role: DefinitionRole | DefinitionRole[], action: Action | Action[], resource: Resource | Resource[], condition?: ConditionFunction<RuntimeRole, Action, Resource>) => void;
    can: (role: RuntimeRole | RuntimeRole[], action: Action, resource: Resource, options?: any) => boolean;
    cannot: (role: RuntimeRole | RuntimeRole[], action: Action, resource: Resource, options?: any) => boolean;
    authorize: (role: RuntimeRole | RuntimeRole[], action: Action, resource: Resource, options?: any) => void;
    exportPermissions: (roles: DefinitionRole[]) => string;
    importPermissions: (permissionsJson: string) => void;
    private setPermission;
    private checkPermission;
    private findAllowedRoles;
    private parseRoleFromKey;
    private logDebug;
}
