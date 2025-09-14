# CanAlready

A high-performance TypeScript authorization library with O(1) permission checks, serving as a drop-in replacement for CanCan.

## Features

- **O(1) Performance**: Constant-time permission lookups using object storage
- **Dual-Generic Architecture**: Separate types for clean definitions and rich runtime context
- **Multi-Role Support**: Check permissions for users with multiple roles
- **Strong TypeScript Support**: Fully typed with generic support for custom roles, actions, and resources
- **CanCan Compatibility**: Drop-in replacement with familiar API
- **Wildcard Support**: `*` and `manage` wildcard permissions
- **Condition Functions**: Dynamic permission evaluation with runtime context
- **Export/Import**: Serialize and transfer permission sets
- **Debug Mode**: Detailed logging for development
- **Zero Dependencies**: Minimal bundle size

## Installation

```bash
npm install can-already
```

## Quick Start

### Traditional Approach (CanCan Compatible)
```typescript
import { CanAlready } from 'can-already';

// Define your types
enum UserRole { ADMIN = 'admin', USER = 'user' }
enum UserAction { READ = 'read', WRITE = 'write', DELETE = 'delete' }
enum UserResource { POST = 'post', PROFILE = 'profile' }

// Create instance
const canAlready = new CanAlready<UserRole, UserAction, UserResource>({
  roleResolver: (role) => role.toString(),
  actionResolver: (action) => action.toString(),
  resourceResolver: (resource) => resource.toString(),
  errorFactory: (message, allowedRoles) => 
    new Error(`${message}. Allowed roles: ${allowedRoles.join(', ')}`)
});

// Use destructured interface (CanCan compatible)
const { allow, can, cannot, authorize } = canAlready;

// Define permissions
allow(UserRole.ADMIN, '*', '*');
allow(UserRole.USER, UserAction.READ, UserResource.POST);

// Check permissions
can(UserRole.USER, UserAction.READ, UserResource.POST); // true
cannot(UserRole.USER, UserAction.DELETE, UserResource.POST); // true
```

### Enhanced Approach (Dual-Generic)
```typescript
import { CanAlready } from 'can-already';

interface UserContext {
  userId: string;
  role: string;
  organisationId: string;
}

// Clean permission definitions, rich runtime context
const canAlready = new CanAlready<string, UserContext, string, string>({
  roleResolver: (role) => typeof role === 'string' ? role : role.role,
  actionResolver: (action) => action,
  resourceResolver: (resource) => resource,
  errorFactory: (message, allowedRoles) => new Error(`${message}. Allowed: ${allowedRoles.join(', ')}`)
});

// Clean, readable permission definitions
canAlready.allow('admin', '*', '*');
canAlready.allow('user', 'read', 'post');
canAlready.allow('manager', 'manage', 'team', (user, action, resource, context) => 
  user.organisationId === context.record?.organisationId
);

// Rich runtime context for authorization
const user = { userId: '123', role: 'manager', organisationId: 'acme-corp' };
canAlready.can(user, 'delete', 'team', { record: { organisationId: 'acme-corp' } }); // true
```

## Advanced Usage

### Dual-Generic Architecture

CanAlready supports separate types for permission definitions and runtime evaluation, enabling clean, readable permission definitions while providing rich context for authorization checks:

```typescript
import { CanAlready } from 'can-already';

interface UserRole {
  userId: string;
  role: string;
  organisationId: string;
}

const canAlready = new CanAlreadyDual<string, UserRole, string, string>({
  roleResolver: (role) => typeof role === 'string' ? role : role.role,
  actionResolver: (action) => action,
  resourceResolver: (resource) => resource,
  errorFactory: (message, allowedRoles) => new Error(`${message}. Allowed: ${allowedRoles.join(', ')}`)
});

// Clean, readable permission definitions using simple strings
const { allow, can, cannot, authorize } = canAlready;
allow('ADMIN', '*', '*');
allow('MODERATOR', 'manage', 'post', isSameOrganisation);
allow('USER', 'read', 'post');

// Rich context available in conditions
const isSameOrganisation = (role: UserRole, action: string, resource: string, context: any) => 
  role.organisationId === context.record?.organisationId;

// Runtime calls with full user context objects
const userContext = { userId: '123', role: 'moderator', organisationId: 'org1' };
authorize(userContext, 'delete', 'post', { record: targetPost });
```

#### Complex Authorization Scenarios

The dual-generic architecture excels at complex, real-world authorization scenarios:

```typescript
// Define permissions with simple, readable strings
allow('MANAGER', 'read', 'reports', isManagerInSameOrg);
allow('USER', 'edit', 'document', isOwnerOrManager);
allow('ADMIN', '*', '*'); // Admins can do everything

// Condition functions receive rich runtime context
const isManagerInSameOrg = (user: UserRole, action: string, resource: string, context: any) => {
  return user.role === 'manager' && 
         user.organisationId === context.record?.organisationId;
};

const isOwnerOrManager = (user: UserRole, action: string, resource: string, context: any) => {
  return user.userId === context.record?.ownerId || 
         (user.role === 'manager' && user.organisationId === context.record?.organisationId);
};

// Runtime evaluation with complete user context
const manager = { userId: '1', role: 'manager', organisationId: 'acme-corp' };
const employee = { userId: '2', role: 'user', organisationId: 'acme-corp' };

// Manager can read reports in their organization
can(manager, 'read', 'reports', { 
  record: { organisationId: 'acme-corp' } 
}); // true

// Employee can edit their own documents
can(employee, 'edit', 'document', { 
  record: { ownerId: '2', organisationId: 'acme-corp' } 
}); // true

// Multi-role users get permissions from any of their roles
can([manager, employee], 'read', 'reports', { 
  record: { organisationId: 'acme-corp' } 
}); // true (manager role grants access)
```

### Multi-Role Support

Users can have multiple roles and CanAlready will check all roles for permissions:

```typescript
// Check permissions for multiple roles
can([UserRole.USER, UserRole.MODERATOR], UserAction.DELETE, UserResource.COMMENT); // true if ANY role has permission

// Works with all permission methods
cannot([UserRole.USER, UserRole.GUEST], UserAction.WRITE, UserResource.POST);
authorize([UserRole.USER, UserRole.MODERATOR], UserAction.READ, UserResource.POST);

// Maintains O(1) performance per role
const userRoles = [UserRole.USER, UserRole.PREMIUM, UserRole.BETA];
can(userRoles, UserAction.READ, UserResource.FEATURE); // Still very fast!
```

### Condition Functions

```typescript
// Dynamic permissions with conditions
allow(UserRole.USER, UserAction.UPDATE, UserResource.PROFILE, 
  (role, action, resource, options) => {
    return options?.userId === options?.profileUserId;
  }
);

// Check with context
can(UserRole.USER, UserAction.UPDATE, UserResource.PROFILE, {
  userId: 1,
  profileUserId: 1
}); // true
```

### Complex Object Resolvers

```typescript
interface User { id: number; role: string; }
interface Post { id: number; authorId: number; }

const canAlready = new CanAlready<User, string, Post>({
  roleResolver: (user) => user.role,
  actionResolver: (action) => action,
  resourceResolver: (post) => `post_${post.id}`,
  errorFactory: (message, allowedRoles) => new Error(message)
});

const user = { id: 1, role: 'author' };
const post = { id: 123, authorId: 1 };

allow(user, 'update', post, (u, a, p) => u.id === p.authorId);
```

### Export/Import Permissions

```typescript
// Export permissions for specific roles
const permissions = canAlready.exportPermissions([UserRole.USER, UserRole.ADMIN]);

// Import to another instance
const newCanAlready = new CanAlready(options);
newCanAlready.importPermissions(permissions);
```

### Debug Mode

```typescript
const canAlready = new CanAlready({
  debug: true,  // Enable debug logging
  // ... other options
});

// Logs detailed information about each permission check
can(UserRole.USER, UserAction.READ, UserResource.POST);
```

## API Reference

### CanAlready Class

```typescript
class CanAlready<DefinitionRole = string, RuntimeRole = DefinitionRole, Action = string, Resource = string>
```

Enhanced single class supporting both traditional single-type usage and dual-generic architecture:

- **Single-type usage**: `CanAlready<UserRole>` (fully backward compatible with CanCan)
- **Dual-generic usage**: `CanAlready<string, UserContext>` (clean definitions, rich runtime context)

### Constructor Options

```typescript
interface CanAlreadyOptions<Role, Action, Resource> {
  debug?: boolean;
  roleResolver: (role: Role) => string;
  actionResolver: (action: Action) => string;
  resourceResolver: (resource: Resource) => string;
  errorFactory: (message: string, allowedRoles: string[]) => Error;
  conditionExporter?: (fn: Function) => string;
  conditionImporter?: (fnName: string) => Function | undefined;
}
```

### Methods

#### Permission Definition
- `allow(definitionRole | definitionRole[], action, resource, condition?)` - Define permissions using definition types (e.g., simple strings)

#### Runtime Authorization  
- `can(runtimeRole | runtimeRole[], action, resource, options?)` - Check permissions using runtime types (e.g., user context objects)
- `cannot(runtimeRole | runtimeRole[], action, resource, options?)` - Inverse of `can()`
- `authorize(runtimeRole | runtimeRole[], action, resource, options?)` - Like `can()` but throws error if access denied

#### Data Management
- `exportPermissions(definitionRoles[])` - Export permissions for specified roles as JSON string
- `importPermissions(permissionsJson)` - Import permissions from JSON string

## Wildcard Support

- `"*"` - Universal wildcard for any role, action, or resource
- `"manage"` - Action wildcard (backwards compatibility with CanCan)

```typescript
allow(UserRole.ADMIN, '*', '*');           // Admin can do anything
allow(UserRole.MODERATOR, 'manage', UserResource.POST); // Moderator can manage posts
allow('*', UserAction.READ, UserResource.POST);         // Anyone can read posts
```

## Performance

CanAlready is optimized for O(1) permission checks:

- Direct object property access for lookups
- No iteration through permission lists  
- Consistent performance regardless of permission set size
- Memory usage scales linearly with permission count
- **Dual-generic architecture has zero runtime overhead** - type separation happens at compile time

## Migration from CanCan

CanAlready is designed as a drop-in replacement:

```typescript
// CanCan
const CanCan = require('cancan');
const cancan = new CanCan();
const { allow, can, cannot, authorize } = cancan;

// CanAlready
import { CanAlready } from 'can-already';
const canAlready = new CanAlready(options);
const { allow, can, cannot, authorize } = canAlready;

// Same API, better performance!
```

## License

MIT

## Contributing

Contributions welcome! Please read our contributing guidelines and submit pull requests.