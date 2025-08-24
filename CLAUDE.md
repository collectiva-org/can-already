# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build and Type Checking
- `npm run build` - Compile TypeScript to JavaScript in dist/
- `npm run typecheck` - Type check without emitting files
- `npm run dev` - Watch mode compilation

### Testing
- `npm test` - Run all tests with Vitest
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report

### Code Quality
- `npm run lint` - Lint TypeScript files in src/ with ESLint

## Architecture

### Core Structure
This is a TypeScript authorization library with O(1) permission checks. The main components are:

- **src/can-already.ts**: Main `CanAlready` class implementing the permission system
- **src/types.ts**: TypeScript type definitions and interfaces
- **src/index.ts**: Library entry point exporting public API

### Permission System Design
The library uses a nested object storage structure for O(1) lookups:
```
storage[roleKey][actionKey][resourceKey] = permission
```

Key features:
- **Wildcard support**: `*` and `manage` for universal permissions
- **Condition functions**: Dynamic permission evaluation with context
- **Export/Import**: Serializable permission sets
- **Debug mode**: Detailed logging for development

### API Pattern
The library follows a destructurable API pattern similar to CanCan:
```typescript
const { allow, can, cannot, authorize } = canAlready;
```

Main methods:
- `allow()` - Define permissions (supports arrays and conditions)
- `can()` - Check permissions (returns boolean)
- `cannot()` - Inverse permission check
- `authorize()` - Permission check that throws on denial

### Testing Structure
Tests use Vitest with enum-based type definitions for roles, actions, and resources. Test files follow the pattern `*.test.ts` and are located in the `tests/` directory.

### Type Safety
The library is fully generic with type parameters `<Role, Action, Resource>` allowing custom types while maintaining type safety throughout the API.