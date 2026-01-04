# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AWS Resource Cleaner enumerates and deletes AWS resources in unwanted environments based on tags, resource names, and integration with GitHub PRs and Terraform Cloud workspaces. **This tool permanently deletes AWS resources** - always use dry-run mode first.

## Common Commands

```bash
npm install          # Install dependencies
npm start            # Run the cleaner (uses tsx, pipes to pino-pretty)
npm run build        # TypeScript compilation
npm test             # Run Jest tests
npm run prettier     # Format code
npm run lint         # Run ESLint with TypeScript type checking
```

## Code Style

- Avoid using deprecated APIs or function calls in new code

## Architecture

### Entry Point & Flow (`src/index.ts`)

1. Load YAML config (`config/default.yaml`, overridable via `NODE_ENV`)
2. Fetch GitHub open PRs and Terraform Cloud workspaces (with caching)
3. Filter environments: protected > target > PR-based
4. Discover resources via AWS Resource Groups Tagging API, IAM roles, and ECS task definitions
5. Build dependency-aware task scheduler
6. Execute deletions respecting concurrency limits and dependencies

### Resource Type System

Resource types follow `service.resourceType` naming (e.g., `ec2.instance`, `iam.role`, `s3`).

**Key files:**
- `src/ResourceType.ts` - Type definitions and validation
- `src/ResourceHandler.ts` - Handler registry mapping types to delete/describe functions
- `src/ResourceTypeDependencies.ts` - Static dependency graph (what must delete before what)
- `src/resources/*.ts` - Per-service AWS SDK implementations

### Adding a New Resource Type

1. Create handler in `src/resources/{service}.ts` with `delete*` and optional `describe*` functions
2. Add type string to `resourceTypes` array in `src/ResourceType.ts`
3. Register handler in `resourceHandlers` map in `src/ResourceHandler.ts`
4. Declare dependencies in `src/ResourceTypeDependencies.ts`
5. Install AWS SDK client if needed

### Handler Pattern

```typescript
interface ResourceHandler {
  kind: string;                              // Human-readable name
  describer?: ResourceDescriber;             // Fetch description for logging
  destroyer?: ResourceDestroyer;             // Execute deletion
  dependencyEnumerator?: DependencyEnumerator; // Dynamic dependency discovery
}
```

### Integrations

- **GitHub** (`src/github.ts`) - GraphQL queries for open PRs to protect active PR environments
- **Terraform Cloud** (`src/tfe.ts`) - Workspace management, destroy runs before resource deletion
- **Caching** (`src/cache.ts`) - TTL-based JSON cache in `/tmp/aws-cleaner.json`

### Scheduler (`src/scheduler.ts`)

Tasks grouped by `(environment, resourceType)`, ordered by dependency graph, executed with configurable concurrency (default 20). Same resource types in different environments run in parallel.

## Configuration

Copy `config/sample.yaml` to `config/default.yaml`. Key settings:
- `dryRun: true` (default) - Log what would be deleted without deleting
- `awsEnvironmentTags` - Tag keys that identify environments
- `protectedEnvironments` / `targetEnvironments` - Environment filtering
- `maximumConcurrency` - Parallel deletion limit

AWS credentials come from `~/.aws/credentials` or environment variables.
