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

> For object-level checks (conditions that inspect the record), pass the actual record as the
> third argument — see [Enhanced Approach](#enhanced-approach-dual-generic-record-first).

### Enhanced Approach (Dual-Generic, record-first)

Pass the **actual record** you are authorizing as the third argument. The
`resourceResolver` derives the record's **type** key (used for the O(1) lookup), and
condition functions receive that same record object as their third parameter — so they
read fields straight off it. No side-context bundle needed.

```typescript
import { CanAlready } from 'can-already';

interface UserContext {
  userId: string;
  role: string;
  organisationId: string;
}

interface Team {
  type: 'team';
  id: string;
  organisationId: string;
}

// Clean permission definitions, rich runtime context
const canAlready = new CanAlready<string, UserContext, string, Team>({
  roleResolver: (role) => typeof role === 'string' ? role : role.role,
  actionResolver: (action) => action,
  // resolver returns the record's TYPE, not its identity
  resourceResolver: (record) => record.type,
  errorFactory: (message, allowedRoles) => new Error(`${message}. Allowed: ${allowedRoles.join(', ')}`)
});

// Clean, readable permission definitions
canAlready.allow('admin', '*', '*');
canAlready.allow('user', 'read', 'post');
// condition reads fields directly off the record (4th param unused)
canAlready.allow('manager', 'manage', 'team', (user, action, team) =>
  user.organisationId === team.organisationId
);

// Authorize the real record
const user = { userId: '123', role: 'manager', organisationId: 'acme-corp' };
const team = { type: 'team', id: 't1', organisationId: 'acme-corp' };
canAlready.can(user, 'delete', team); // true
```

> The 4th `options` argument still exists for genuinely external context (see
> [Call forms](#resolving-the-resource)), but the record itself belongs in the 3rd
> argument — not smuggled into `options.record`.

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

const canAlready = new CanAlready<string, UserRole, string, Post>({
  roleResolver: (role) => typeof role === 'string' ? role : role.role,
  actionResolver: (action) => action,
  // derive the TYPE key from the record
  resourceResolver: (record) => record.type,
  errorFactory: (message, allowedRoles) => new Error(`${message}. Allowed: ${allowedRoles.join(', ')}`)
});

// Clean, readable permission definitions using simple strings
const { allow, can, cannot, authorize } = canAlready;
allow('ADMIN', '*', '*');
allow('MODERATOR', 'manage', 'post', isSameOrganisation);
allow('USER', 'read', 'post');

// Condition receives the runtime role and the actual record
const isSameOrganisation = (role: UserRole, action: string, post: Post) =>
  role.organisationId === post.organisationId;

// Runtime calls: pass the record you fetched
const userContext = { userId: '123', role: 'moderator', organisationId: 'org1' };
authorize(userContext, 'delete', targetPost);
```

#### Complex Authorization Scenarios

The dual-generic architecture excels at complex, real-world authorization scenarios:

```typescript
// Define permissions with simple, readable strings
allow('MANAGER', 'read', 'reports', isManagerInSameOrg);
allow('USER', 'edit', 'document', isOwnerOrManager);
allow('ADMIN', '*', '*'); // Admins can do everything

// Condition functions receive the runtime role and the actual record
const isManagerInSameOrg = (user: UserRole, action: string, report: any) => {
  return user.role === 'manager' &&
         user.organisationId === report.organisationId;
};

const isOwnerOrManager = (user: UserRole, action: string, doc: any) => {
  return user.userId === doc.ownerId ||
         (user.role === 'manager' && user.organisationId === doc.organisationId);
};

// Runtime evaluation with the fetched records
const manager = { userId: '1', role: 'manager', organisationId: 'acme-corp' };
const employee = { userId: '2', role: 'user', organisationId: 'acme-corp' };

// Manager can read reports in their organization
can(manager, 'read', { type: 'reports', organisationId: 'acme-corp' }); // true

// Employee can edit their own documents
can(employee, 'edit', { type: 'document', ownerId: '2', organisationId: 'acme-corp' }); // true

// Multi-role users get permissions from any of their roles
can([manager, employee], 'read', { type: 'reports', organisationId: 'acme-corp' }); // true (manager role grants access)
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

Conditions receive `(role, action, resource, options)`. The `resource` is the record you
passed as the 3rd argument — read fields off it directly. Reach for the 4th `options`
argument only for context that is *not* part of the record.

```typescript
// Dynamic permission: user may update their own profile
allow('user', 'update', 'profile',
  (user, action, profile) => user.id === profile.userId
);

// Pass the actual profile record
const user = { id: 1, role: 'user' };
const profile = { type: 'profile', userId: 1 };
can(user, 'update', profile); // true
```

When a check genuinely needs external context alongside the record (e.g. a target OU that
is not a field on the record), put it in the 4th `options` argument:

```typescript
allow('user', 'move', 'document',
  (user, action, doc, options) =>
    doc.ownerId === user.id && options?.targetFolderId != null
);

can(user, 'move', doc, { targetFolderId: 'f-42' });
```

### Complex Object Resolvers

The `resourceResolver` must return the record's **type**, not its identity. Keying on the
instance id (e.g. `` `post_${post.id}` ``) would register a separate permission entry per
record, so an `allow` on one post would never match a `can` on another.

```typescript
interface User { id: number; role: string; }
interface Post { id: number; authorId: number; }

const canAlready = new CanAlready<User, string, Post>({
  roleResolver: (user) => user.role,
  actionResolver: (action) => action,
  resourceResolver: (post) => 'post', // TYPE key, shared by all posts
  errorFactory: (message, allowedRoles) => new Error(message)
});

const author = { id: 1, role: 'author' };
const post = { id: 123, authorId: 1 };

// The condition reads the record; per-record scoping lives here, not in the resolver.
canAlready.allow('author', 'update', 'post', (u, a, p) => u.id === p.authorId);
canAlready.can(author, 'update', post); // true
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

### Resolving the resource

The 3rd argument to `can`/`cannot`/`authorize` is the **actual resource being authorized** —
pass the record you fetched, not a string describing its type.

- `resourceResolver(resource)` must return the resource's **type** key (e.g. `'post'`), never
  its identity. The key drives the O(1) lookup; identity-based keys break `allow`/`can` matching.
- Condition functions receive that same resource object as their 3rd parameter — read fields off
  it directly (`(user, action, post) => user.id === post.authorId`).
- The 4th `options` argument is for context that is **not** part of the record (e.g. a target
  location). Do not put the record itself in `options`.

Accepted call forms:

| Form | When |
| --- | --- |
| `authorize(user, action, record)` | **Canonical.** The record carries everything the condition needs. |
| `authorize(user, action, record, { ...ctx })` | Record + external context a condition needs. |
| `authorize(user, action, 'type')` | Type-only checks with no per-record condition (still supported). |

The bare-string form remains valid for coarse, type-level permissions, but prefer passing the
record whenever a condition inspects it.

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