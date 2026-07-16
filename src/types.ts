export type ConditionFunction<RuntimeRole, Action, Resource> = (
  role: RuntimeRole,
  action: Action,
  resource: Resource,
  options?: any
) => boolean;

export type RoleResolver<Role> = (role: Role) => string;
export type ActionResolver<Action> = (action: Action) => string;
export type ResourceResolver<Resource> = (resource: Resource) => string;
export type ResourceTypeResolver<ResourceType> = (resourceType: ResourceType) => string;

export type ErrorFactory = (message: string, allowedRoles: string[]) => Error;

export type ConditionExporter = (fn: Function) => string;
export type ConditionImporter = (fnName: string) => Function | undefined;

export interface CanAlreadyOptions<Role, Action, Resource, ResourceType = Resource> {
  debug?: boolean;
  roleResolver: RoleResolver<Role>;
  actionResolver: ActionResolver<Action>;
  resourceResolver: ResourceResolver<Resource>;
  // Resolves a resource TYPE TOKEN (not a record) to its storage key. Required only when the
  // token type differs from Resource (e.g. a model class vs a record instance); otherwise
  // assertAuthorizable falls back to resourceResolver.
  resourceTypeResolver?: ResourceTypeResolver<ResourceType>;
  errorFactory: ErrorFactory;
  conditionExporter?: ConditionExporter;
  conditionImporter?: ConditionImporter;
}

export type PermissionValue<RuntimeRole, Action, Resource> = 
  | boolean 
  | ConditionFunction<RuntimeRole, Action, Resource>;

export type PermissionStorage<RuntimeRole, Action, Resource> = {
  [role: string]: {
    [action: string]: {
      [resource: string]: PermissionValue<RuntimeRole, Action, Resource>;
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