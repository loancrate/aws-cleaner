# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AWS Resource Cleaner enumerates and deletes AWS resources in unwanted environments based on tags, resource names, and integration with GitHub PRs and Terraform Cloud workspaces. **This tool permanently deletes AWS resources** - always use dry-run mode first.

## Common Commands

```bash
npm install          # Install dependencies
npm start            # Run the cleaner (uses tsx, pipes to pino-pretty)
npm run build        # TypeScript compilation
npm test             # Run Vitest tests
npm run prettier     # Format code
npm run lint         # Run ESLint with TypeScript type checking
```

## Code Style

- Avoid using deprecated APIs or function calls in new code
- Do not include "Generated with" or "Co-Authored-By" lines in commit messages

## Architecture

### Entry Point & Flow (`src/index.ts`)

1. Load YAML config (first found of `config/local.yaml`, `config/$NODE_ENV.yaml`, `config/default.yaml`)
2. Look up the AWS account and region from the credentials, log them, and pause 2 seconds before a real run
3. Fetch open GitHub PRs (cached for dry runs only) and Terraform Cloud workspaces (cached)
4. Build the environment filter: protected > target > closed PRs
5. Optionally destroy Terraform workspaces for matching environments
6. Discover resources via the AWS Resource Groups Tagging API, IAM roles, ECS task definition families, and EC2 instance names, and match them to environments
7. Build dependency-aware task scheduler
8. Execute deletions respecting concurrency limits and dependencies

### Environment Matching

The rules that decide what gets deleted are kept out of `index.ts`, take configuration as parameters, and are unit-tested:

- `src/environments.ts` - Extracting environments from names, the environment filter, and matching Terraform workspaces to environments
- `src/resourceMatching.ts` - Matching tagged resources, IAM roles, task definition families, and EC2 instances to environments

`index.ts` does the fetching and caching. Keep new matching logic in these modules rather than in `index.ts`.

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
6. Update README.md with the new resource type

### Dependency Graph Semantics

In `ResourceTypeDependencies.ts`, the pattern `A: [B, C]` means:

- "A depends on B and C"
- "A must be deleted BEFORE B and C"
- B and C are deleted AFTER A

Example: `"ec2.instance": ["ec2.security-group", "ec2.subnet"]` means instances must be deleted before security groups and subnets can be deleted.

When adding a new resource type:

- If other resources USE your new type, add your type to THEIR dependency arrays
- Your new type's own array lists what it depends on (usually empty for foundational/root resources that are deleted last)

### Handler Pattern

```typescript
interface ResourceHandler {
  kind: string; // Human-readable name
  describer?: ResourceDescriber; // Fetch description for logging
  destroyer?: ResourceDestroyer; // Execute deletion
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
