import { CanAlready } from './src/can-already';

// Define your types
enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator'
}

enum UserAction {
  READ = 'read',
  WRITE = 'write',
  DELETE = 'delete'
}

enum UserResource {
  POST = 'post',
  PROFILE = 'profile',
  COMMENT = 'comment'
}

// Create instance with configuration
const canAlready = new CanAlready<UserRole, UserAction, UserResource>({
  debug: true,
  roleResolver: (role) => role.toString(),
  actionResolver: (action) => action.toString(),
  resourceResolver: (resource) => resource.toString(),
  errorFactory: (message, allowedRoles) => 
    new Error(`${message}. Allowed roles: ${allowedRoles.join(', ')}`),
});

// Use destructured interface (CanCan compatible)
const { allow, can, cannot, authorize } = canAlready;

// Define permissions
console.log('Setting up permissions...');

// Admin can do anything
allow(UserRole.ADMIN, '*' as any, '*' as any);

// Users can read posts
allow(UserRole.USER, UserAction.READ, UserResource.POST);

// Users can update their own profile
allow(UserRole.USER, UserAction.WRITE, UserResource.PROFILE, 
  (role, action, resource, options) => {
    return options?.userId === options?.profileUserId;
  }
);

// Moderators can manage comments
allow(UserRole.MODERATOR, 'manage' as any, UserResource.COMMENT);

// Test permissions
console.log('\nTesting permissions...');

console.log('Admin can delete posts:', can(UserRole.ADMIN, UserAction.DELETE, UserResource.POST));
console.log('User can read posts:', can(UserRole.USER, UserAction.READ, UserResource.POST));
console.log('User cannot delete posts:', cannot(UserRole.USER, UserAction.DELETE, UserResource.POST));

// Test conditional permission
console.log('User can update own profile:', 
  can(UserRole.USER, UserAction.WRITE, UserResource.PROFILE, { userId: 1, profileUserId: 1 }));
console.log('User cannot update others profile:', 
  can(UserRole.USER, UserAction.WRITE, UserResource.PROFILE, { userId: 1, profileUserId: 2 }));

// Test authorization with error
console.log('\nTesting authorization...');
try {
  authorize(UserRole.USER, UserAction.DELETE, UserResource.POST);
} catch (error) {
  console.log('Authorization error:', error.message);
}

// Export permissions
console.log('\nExporting permissions...');
const exported = canAlready.exportPermissions([UserRole.USER, UserRole.ADMIN]);
console.log('Exported permissions:', exported);

console.log('\nCanAlready demo complete!');