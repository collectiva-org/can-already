# CanAlready

A high-performance TypeScript authorization library with O(1) permission checks, serving as a drop-in replacement for CanCan.

## Features

- **O(1) Performance**: Constant-time permission lookups using object storage
- **Strong TypeScript Support**: Fully typed with generic support for custom roles, actions, and resources
- **CanCan Compatibility**: Drop-in replacement with familiar API
- **Wildcard Support**: `*` and `manage` wildcard permissions
- **Condition Functions**: Dynamic permission evaluation
- **Export/Import**: Serialize and transfer permission sets
- **Debug Mode**: Detailed logging for development
- **Zero Dependencies**: Minimal bundle size

## Installation

```bash
npm install can-already
```

## Quick Start

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
allow(UserRole.ADMIN, '*', '*');                    // Admin can do anything
allow(UserRole.USER, UserAction.READ, UserResource.POST);  // Users can read posts

// Check permissions
can(UserRole.USER, UserAction.READ, UserResource.POST);    // true
cannot(UserRole.USER, UserAction.DELETE, UserResource.POST); // true

// Authorize with error throwing
try {
  authorize(UserRole.USER, UserAction.DELETE, UserResource.POST);
} catch (error) {
  console.log(error.message); // "Access denied... Allowed roles: admin"
}
```

## Advanced Usage

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

#### `allow(role, action, resource, condition?)`
Define permissions. All parameters accept single values or arrays.

#### `can(role, action, resource, options?)`
Check if permission is granted. Returns boolean.

#### `cannot(role, action, resource, options?)`
Inverse of `can()`. Returns boolean.

#### `authorize(role, action, resource, options?)`
Like `can()` but throws error if access denied.

#### `exportPermissions(roles)`
Export permissions for specified roles as JSON string.

#### `importPermissions(permissionsJson)`
Import permissions from JSON string.

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