export type ConditionFunction<Role, Action, Resource> = (
  role: Role,
  action: Action,
  resource: Resource,
  options?: any
) => boolean;

export type RoleResolver<Role> = (role: Role) => string;
export type ActionResolver<Action> = (action: Action) => string;
export type ResourceResolver<Resource> = (resource: Resource) => string;

export type ErrorFactory = (message: string, allowedRoles: string[]) => Error;

export type ConditionExporter = (fn: Function) => string;
export type ConditionImporter = (fnName: string) => Function | undefined;

export interface CanAlreadyOptions<Role, Action, Resource> {
  debug?: boolean;
  roleResolver: RoleResolver<Role>;
  actionResolver: ActionResolver<Action>;
  resourceResolver: ResourceResolver<Resource>;
  errorFactory: ErrorFactory;
  conditionExporter?: ConditionExporter;
  conditionImporter?: ConditionImporter;
}

export type PermissionValue<Role, Action, Resource> = 
  | boolean 
  | ConditionFunction<Role, Action, Resource>;

export type PermissionStorage<Role, Action, Resource> = {
  [role: string]: {
    [action: string]: {
      [resource: string]: PermissionValue<Role, Action, Resource>;
    };
  };
};

export interface DebugInfo {
  operation: 'can' | 'cannot' | 'authorize';
  role: string;
  action: string;
  resource: string;
  result: boolean;
  matchedRule?: string;
  conditionEvaluated?: boolean;
  timestamp: Date;
}

export interface SerializablePermission {
  [role: string]: {
    [action: string]: {
      [resource: string]: boolean | string;
    };
  };
}