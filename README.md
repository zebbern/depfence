# depfence

> Detect dependency confusion attack vectors in Node.js projects by analyzing registries, lockfiles, and scoped packages.

## Features

- **10 detection rules** — From missing registry configs (DC-001) to mixed scope registries (DC-009)
- **Multi-lockfile support** — npm (v1/v2/v3), yarn (v1), pnpm (v5/v6+/v9)
- **Online checks** — Verifies if scoped packages exist on public npm (DC-008)
- **Multiple output formats** — Terminal (colored), JSON, Markdown
- **Severity filtering** — Focus on critical/high issues or see everything
- **Scope filtering** — Scan only specific scopes

## Installation

```bash
npm install -g depfence
# or use npx
npx depfence
```

## Quick Start

```bash
# Scan current directory
depfence

# Scan specific directory
depfence --root ./my-project

# Offline mode (skip public npm checks)
depfence --offline

# JSON output for CI
depfence --format json

# Only critical and high findings
depfence --severity high

# Check only specific scopes
depfence --scopes @company,@internal
```

## Detection Rules

| Rule | Severity | Description |
|------|----------|-------------|
| DC-001 | High | No registry configuration found |
| DC-002 | Critical | Scoped package without registry mapping |
| DC-003 | Critical | Scoped package resolved from public registry |
| DC-004 | High | No lockfile found |
| DC-005 | Medium | Missing integrity hash in lockfile |
| DC-006 | Medium/High | Install scripts detected (project or scoped deps) |
| DC-007 | Medium | Unpinned version on scoped package |
| DC-008 | High | Scoped package exists on public npm |
| DC-009 | High | Mixed registries for same scope |
| DC-010 | Info | Private registry configured (positive) |

## Programmatic API

```typescript
import { scanForConfusion } from 'depfence';

const result = await scanForConfusion({
  rootDir: './my-project',
  offline: false,
  format: 'json',
});

if (result.summary.critical > 0) {
  process.exit(1);
}
```

## CI Integration

### Quick (npx)

```yaml
- name: Check dependency confusion
  run: npx depfence --format json --severity high
```

### GitHub Action

```yaml
- name: Check dependency confusion
  uses: your-org/depfence@v1
  with:
    severity: high
    fail-on: high
```

#### Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `severity` | `high` | Minimum severity to report |
| `fail-on` | `high` | Fail if findings at this severity or above |
| `online` | `false` | Check packages against public npm registry |
| `workspace` | `false` | Scan monorepo workspace packages |
| `scopes` | | Space-separated scopes to check (e.g., `@company @internal`) |
| `ignore` | | Space-separated packages to skip |

#### Outputs

| Output | Description |
|--------|-------------|
| `findings` | Total finding count |
| `critical` | Critical finding count |
| `high` | High finding count |
| `result-json` | Full scan result as JSON |

#### Example: Fail on critical only

```yaml
- uses: your-org/depfence@v1
  with:
    fail-on: critical
```

#### Example: Monorepo with scoped packages

```yaml
- uses: your-org/depfence@v1
  with:
    workspace: true
    scopes: '@company @internal'
```

#### Example: Online registry checks

```yaml
- uses: your-org/depfence@v1
  with:
    online: true
    fail-on: high
```

See [action/example-workflow.yml](action/example-workflow.yml) for a complete workflow example.

## License

MIT
