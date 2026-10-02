# ADR-008: Frigg CLI Start Command Architecture

**Status**: Accepted
**Date**: 2025-12-14
**Deciders**: Frigg Core Team

## Context

Local development of Frigg applications requires:
1. Database connectivity (MongoDB or PostgreSQL)
2. Prisma client generation
3. Environment variable configuration
4. Serverless offline execution

Developers frequently encounter issues:
- Docker not running
- Database not started
- Missing `.env` file
- Prisma client not generated
- Port conflicts

### Goals

1. **Zero-friction startup**: `frigg start` should "just work"
2. **Clear error messages**: Guide developers to fix issues
3. **Interactive recovery**: Offer to fix problems automatically
4. **Consistent environment**: Same behavior across dev machines

## Decision

### Command Flow

```mermaid
flowchart TB
    Start[frigg start] --> LoadEnv[Load .env]
    LoadEnv --> Interactive{Interactive Mode?}

    Interactive -->|Yes| Preflight[Run Pre-flight Checks]
    Interactive -->|No| Legacy[Legacy Database Checks]

    subgraph "Pre-flight Checks"
        Preflight --> Docker{Docker Running?}
        Docker -->|No| StartDocker[Start Docker]
        Docker -->|Yes| Compose{Docker Compose Up?}
        StartDocker --> Compose
        Compose -->|No| StartCompose[Start Services]
        Compose -->|Yes| EnvFile{.env Exists?}
        StartCompose --> EnvFile
        EnvFile -->|No| CreateEnv[Create from Template]
        EnvFile -->|Yes| DBUrl{DATABASE_URL Set?}
        CreateEnv --> DBUrl
        DBUrl -->|No| PromptDB[Prompt for Config]
        DBUrl -->|Yes| Prisma{Prisma Generated?}
        PromptDB --> Prisma
        Prisma -->|No| GenPrisma[Generate Client]
        Prisma -->|Yes| Ready[Ready to Start]
        GenPrisma --> Ready
    end

    Legacy --> LegacyDB{Validate DATABASE_URL}
    LegacyDB --> LegacyPrisma{Check Prisma Client}
    LegacyPrisma --> Ready

    Ready --> Spawn[Spawn osls offline]
    Spawn --> Running[Server Running]
```

### Pre-flight Check System

```mermaid
sequenceDiagram
    participant CLI as frigg start
    participant Check as RunPreflightChecksUseCase
    participant Docker as DockerAdapter
    participant FS as FileSystemAdapter
    participant Prisma as PrismaAdapter

    CLI->>Check: execute()

    Check->>Docker: isDockerRunning()
    alt Docker not running
        Docker-->>Check: false
        Check->>Docker: startDocker()
        Note over Check,Docker: Opens Docker Desktop
        Check->>Check: Wait for Docker ready
    end

    Check->>Docker: isComposeUp()
    alt Services not running
        Docker-->>Check: false
        Check->>Docker: startCompose()
        Note over Check,Docker: docker compose up -d
    end

    Check->>FS: envFileExists()
    alt No .env file
        FS-->>Check: false
        Check->>FS: copyEnvTemplate()
        Note over Check,FS: Copy .env.example → .env
    end

    Check->>FS: getDatabaseUrl()
    alt DATABASE_URL not set
        FS-->>Check: null
        Check->>CLI: promptForDatabaseConfig()
        CLI-->>Check: { type, url }
        Check->>FS: updateEnvFile()
    end

    Check->>Prisma: isClientGenerated()
    alt Client not generated
        Prisma-->>Check: false
        Check->>Prisma: generateClient()
        Note over Check,Prisma: npx prisma generate
    end

    Check-->>CLI: { ready: true }
```

### DDD Layer Architecture

```mermaid
graph TB
    subgraph "Presentation Layer"
        Cmd[StartCommand]
        Prompt[Interactive Prompts]
    end

    subgraph "Application Layer"
        UC1[RunPreflightChecksUseCase]
        UC2[ValidateDatabaseUseCase]
        UC3[SpawnServerUseCase]
    end

    subgraph "Infrastructure Layer"
        Docker[DockerAdapter]
        FS[FileSystemAdapter]
        Prisma[PrismaAdapter]
        Process[ProcessAdapter]
    end

    Cmd --> UC1 & UC2 & UC3
    Cmd --> Prompt
    UC1 --> Docker & FS & Prisma
    UC2 --> FS & Prisma
    UC3 --> Process
```

### Environment Variable Handling

```mermaid
graph LR
    subgraph "Sources"
        EnvFile[.env file]
        Shell[Shell Environment]
        Default[Defaults]
    end

    subgraph "Priority (High to Low)"
        P1[1. Shell Environment]
        P2[2. .env File]
        P3[3. Defaults]
    end

    subgraph "Key Variables"
        DB[DATABASE_URL]
        Stage[STAGE]
        Skip[FRIGG_SKIP_AWS_DISCOVERY]
    end

    Shell --> P1 --> DB & Stage & Skip
    EnvFile --> P2 --> DB & Stage & Skip
    Default --> P3 --> DB & Stage & Skip
```

### Stage Configuration

| Stage | AWS Discovery | Encryption | Database |
|-------|---------------|------------|----------|
| `local` | Skipped | Bypassed | Docker Compose |
| `dev` | Skipped | Bypassed | Remote or Docker |
| `production` | Enabled | KMS/AES | Remote |

```javascript
// Environment set by start command
AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE=1
FRIGG_SKIP_AWS_DISCOVERY=true  // Always for local dev
STAGE=local|dev|production
```

### Server Process Management

```mermaid
sequenceDiagram
    participant CLI as frigg start
    participant Child as osls offline
    participant Lambda as Lambda Functions

    CLI->>Child: spawn("osls", ["offline"])
    Note over CLI,Child: Inherits stdio for live output

    Child->>Lambda: Load infrastructure.js
    Lambda-->>Child: Functions registered

    Child->>Child: Start HTTP server
    Note over Child: Port 3000 (default)

    loop Server Running
        Child->>Lambda: Handle requests
    end

    alt SIGINT/SIGTERM
        CLI->>Child: Kill signal
        Child-->>CLI: Process exit
    end
```

### Error Recovery Strategies

```mermaid
graph TB
    subgraph "Docker Issues"
        D1[Docker not installed] -->|Message| D1M[Install Docker Desktop]
        D2[Docker not running] -->|Auto-fix| D2M[Open Docker Desktop]
        D3[Compose services down] -->|Auto-fix| D3M[docker compose up -d]
    end

    subgraph "Database Issues"
        DB1[No DATABASE_URL] -->|Prompt| DB1M[Interactive config]
        DB2[Invalid URL format] -->|Message| DB2M[Show correct format]
        DB3[Connection refused] -->|Message| DB3M[Check Docker services]
    end

    subgraph "Prisma Issues"
        P1[Client not generated] -->|Auto-fix| P1M[npx prisma generate]
        P2[Schema mismatch] -->|Auto-fix| P2M[Regenerate client]
        P3[Migration needed] -->|Message| P3M[Run prisma migrate]
    end
```

### Command Options

```bash
frigg start [options]

Options:
  --stage <stage>    Environment stage (local|dev|production)
  --port <port>      Server port (default: 3000)
  --no-preflight     Skip pre-flight checks
  --docker           Require Docker (fail if not available)
  --verbose          Verbose output
```

## Consequences

### Positive

- **Developer experience**: Most issues auto-resolved
- **Consistent environment**: Same setup across machines
- **Clear guidance**: Error messages explain solutions
- **Flexible**: Works with or without Docker
- **Fast iteration**: Hot reload via serverless-offline

### Negative

- **Docker dependency**: Best experience requires Docker
- **Startup time**: Pre-flight checks add ~2-5 seconds
- **Complexity**: Multiple code paths for different scenarios

### Risks Mitigated

- **Port conflicts**: Checks before starting
- **Missing dependencies**: Validates Prisma client
- **Configuration errors**: Interactive prompts for missing config

## Implementation

### File Structure

```
packages/devtools/frigg-cli/start-command/
├── index.js                    # Command entry point
├── application/
│   ├── RunPreflightChecksUseCase.js
│   ├── ValidateDatabaseUseCase.js
│   └── SpawnServerUseCase.js
├── infrastructure/
│   ├── DockerAdapter.js
│   ├── FileSystemAdapter.js
│   ├── PrismaAdapter.js
│   └── ProcessAdapter.js
└── presentation/
    └── InteractivePrompts.js
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Pre-flight check failed (non-recoverable) |
| 2 | User cancelled |
| 3 | Server crashed |
| 130 | SIGINT (Ctrl+C) |

## Related

- [ADR-002: No Database for Local Development Tools](./002-no-database-for-local-dev.md)
- [Frigg CLI](/packages/devtools/frigg-cli/)
- [Start Command Implementation](/packages/devtools/frigg-cli/start-command/index.js)
- [Docker Compose Config](/docker-compose.yml)
