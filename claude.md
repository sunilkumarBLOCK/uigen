# UIGen - Project Instructions

## Overview

UIGen is an AI-powered React component generator with live preview. Users describe components in a chat interface, and Claude generates code in real-time using a virtual file system, with instant iframe-based preview.

## Tech Stack

- **Framework**: Next.js 15.3 (App Router, Turbopack, Server Components & Actions)
- **Language**: TypeScript (strict mode)
- **React**: 19
- **Styling**: Tailwind CSS v4 via `cn()` utility (clsx + tailwind-merge)
- **UI Components**: shadcn/ui (New York style, Radix UI primitives)
- **Database**: SQLite via Prisma 6.10
- **Auth**: JWT (jose) + bcrypt, HTTP-only cookies
- **AI**: Vercel AI SDK 4.3 with @ai-sdk/anthropic (Claude Haiku-4-5)
- **Editor**: Monaco Editor (@monaco-editor/react)
- **Testing**: Vitest + React Testing Library + jsdom
- **Icons**: lucide-react

## Commands

- `npm run dev` — Start dev server (Turbopack)
- `npm run build` — Production build
- `npm run test` — Run tests (Vitest)
- `npm run lint` — ESLint
- `npm run setup` — Install deps + generate Prisma client + run migrations
- `npm run db:reset` — Reset database

## Architecture

```
src/
  app/                    # Next.js App Router pages & API routes
    api/chat/route.ts     # AI streaming endpoint (POST)
    [projectId]/page.tsx  # Dynamic project pages
  actions/                # Server actions ("use server") — one per file, re-exported from index.ts
  components/             # React components (PascalCase files)
    chat/                 # Chat UI (ChatInterface, MessageInput, MessageList)
    editor/               # Code editor (CodeEditor, FileTree)
    preview/              # Iframe preview (PreviewFrame)
    ui/                   # shadcn/ui primitives (button, dialog, input, etc.)
    auth/                 # Auth dialogs (AuthDialog, SignInForm, SignUpForm)
  lib/
    contexts/             # React Context providers (chat-context, file-system-context)
    prompts/              # AI system prompts
    tools/                # AI tool definitions (str-replace, file-manager)
    auth.ts               # JWT session management
    file-system.ts        # VirtualFileSystem class (in-memory tree)
    prisma.ts             # Prisma client singleton
    provider.ts           # AI model provider (real or mock based on API key)
    utils.ts              # cn() utility
  hooks/                  # Custom hooks (use-auth)
  generated/prisma/       # Generated Prisma client (do not edit)
prisma/
  schema.prisma           # Database schema (User, Project models)
```

## Key Patterns

### Server Actions
Each action is in its own file under `src/actions/`, uses `"use server"` directive, checks auth via `getSession()`, and is re-exported from `src/actions/index.ts`.

### State Management
React Context API with two main contexts:
- **ChatContext** — wraps Vercel AI SDK's `useChat`, manages messages and streaming state
- **FileSystemContext** — virtual file system state, selected file, tool call handling

### Authentication
JWT stored in HTTP-only `auth-token` cookie (7-day expiry). Middleware protects `/api/projects` and `/api/filesystem`. Anonymous users can work without auth; their work migrates on sign-in via sessionStorage.

### AI Integration
POST `/api/chat` streams responses using `streamText()`. Two AI tools: `str_replace_editor` (view/create/edit files) and `file_manager` (rename/delete). Without `ANTHROPIC_API_KEY`, a mock provider returns static examples.

### Virtual File System
`VirtualFileSystem` class in `src/lib/file-system.ts` — Map-based in-memory tree with serialization support. Persisted as JSON string in the Project model's `data` field.

## Code Conventions

### File Naming
- **Components**: PascalCase (`ChatInterface.tsx`)
- **Utilities/hooks/contexts/actions**: kebab-case (`file-system.ts`, `use-auth.ts`, `chat-context.tsx`, `create-project.ts`)
- **Tests**: `__tests__/` directory, same base name with `.test.tsx` or `.test.ts`

### Code Style
- Arrow functions for components and utilities
- Named exports for components and utilities; default exports for pages/layout
- `"use client"` directive on interactive components; `"use server"` on server actions
- `@/*` import alias for `src/`
- Import order: React/Next → third-party → `@/*` absolute imports
- Tailwind classes only (no inline styles), composed with `cn()`
- async/await over `.then()` chains
- Explicit TypeScript types (strict mode enabled)

### Testing
- Vitest with jsdom environment
- React Testing Library for component tests
- `vi.mock()` for mocking hooks and context
- `@testing-library/user-event` for interaction simulation

## Database

SQLite with two models:
- **User**: id (cuid), email (unique), password (bcrypt), projects relation
- **Project**: id (cuid), name, userId (optional for anonymous), messages (JSON string), data (JSON string for VFS), user relation (cascade delete)
