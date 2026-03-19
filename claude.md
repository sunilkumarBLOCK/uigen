# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

UIGen is an AI-powered React component generator with live preview. Users describe components in a chat interface, and Claude generates code in real-time using a virtual file system, with instant iframe-based preview.

## Commands

- `npm run dev` — Start dev server (Turbopack, requires `node-compat.cjs` via NODE_OPTIONS)
- `npm run dev:daemon` — Start dev server in background, logs to `logs.txt`
- `npm run build` — Production build
- `npm run start` — Start production server
- `npm run lint` — ESLint
- `npm run test` — Run all tests in watch mode (Vitest)
- `npx vitest run` — Run all tests once (no watch)
- `npx vitest src/lib/__tests__/file-system.test.ts` — Run a single test file
- `npx vitest file-system` — Run tests matching a name pattern
- `npm run setup` — Install deps + generate Prisma client + run migrations
- `npm run db:reset` — Reset database
- `npx prisma generate` — Regenerate Prisma client (needed after schema changes)

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack, Server Components & Actions)
- **Language**: TypeScript (strict mode)
- **React**: 19
- **Styling**: Tailwind CSS v4 via `cn()` utility (clsx + tailwind-merge)
- **UI Components**: shadcn/ui (New York style, Radix UI primitives)
- **Database**: SQLite via Prisma 6.10 (generated client at `src/generated/prisma/`)
- **Auth**: JWT (jose) + bcrypt, HTTP-only cookies
- **AI**: Vercel AI SDK 4.3 with @ai-sdk/anthropic (Claude Haiku-4-5)
- **Editor**: Monaco Editor (@monaco-editor/react)
- **Testing**: Vitest + React Testing Library + jsdom
- **Icons**: lucide-react

## Architecture

### Request Flow

1. User types in chat → `ChatContext` sends POST to `/api/chat` with messages + serialized VFS
2. `/api/chat/route.ts` streams AI response via `streamText()` with two tools: `str_replace_editor` and `file_manager`
3. AI tool calls mutate the `VirtualFileSystem` instance on the server; `onFinish` persists state to SQLite for authenticated users
4. Client-side `FileSystemContext.handleToolCall()` mirrors tool calls into the client VFS, triggering re-renders
5. `PreviewFrame` detects VFS changes via `refreshTrigger`, transforms all files through the JSX pipeline, and updates `iframe.srcdoc`

### Preview Pipeline (non-obvious)

`PreviewFrame` → `jsx-transformer.ts` — a two-pass Babel transform system:
- **Pass 1**: Transform all JSX/TSX files with `@babel/standalone`, create `blob:` URLs, map path variations (with/without extension, `@/` alias, leading `/`)
- **Pass 2**: Create placeholder modules for unresolved imports, map third-party packages to `https://esm.sh/` CDN
- Output: full HTML document with Tailwind CDN, import map, error boundary, and dynamic entry point import

Entry point discovery order: `/App.jsx` → `/App.tsx` → `/index.jsx` → `/index.tsx` → `/src/App.*` → first `.jsx`/`.tsx` file.

### Routing

- `/` — Home page; redirects authenticated users to their project
- `/[projectId]` — Project page (requires auth, redirects to `/` if unauthenticated or project not found)
- `/api/chat` — POST endpoint for AI streaming (`maxDuration = 120`)

Both routes render `MainContent` (`src/app/main-content.tsx`), a shared client component with resizable panels (chat, editor, preview).

### Server Actions

Auth actions (`signUp`, `signIn`, `signOut`, `getUser`) live directly in `src/actions/index.ts`. Project actions (`createProject`, `getProject`, `getProjects`) are in separate files under `src/actions/` and imported directly from their own files (not re-exported from index).

### State Management

React Context API with two main contexts:
- **ChatContext** (`src/lib/contexts/chat-context.tsx`) — wraps Vercel AI SDK's `useChat`, sends serialized VFS with every request, delegates `onToolCall` to FileSystemContext
- **FileSystemContext** (`src/lib/contexts/file-system-context.tsx`) — manages VirtualFileSystem state, selected file, wraps all VFS operations to trigger re-renders via `refreshTrigger` counter

### Authentication

JWT stored in HTTP-only `auth-token` cookie (7-day expiry). Core auth utilities (`createSession`, `getSession`, `deleteSession`, `verifySession`) live in `src/lib/auth.ts` (server-only). Middleware (`src/middleware.ts`) protects `/api/projects` and `/api/filesystem` paths. Anonymous users can work without auth; their work is tracked in sessionStorage via keys `uigen_has_anon_work` and `uigen_anon_data` (see `src/lib/anon-work-tracker.ts`). The `useAuth` hook (`src/hooks/use-auth.ts`) orchestrates client-side auth flows including anonymous work migration on sign-in and post-auth project routing. `JWT_SECRET` env var falls back to `"development-secret-key"` in dev.

### Virtual File System

`VirtualFileSystem` class in `src/lib/file-system.ts` — Map-based in-memory tree with `/` root. Key methods: `createFileWithParents`, `viewFile`, `replaceInFile` (replaces ALL occurrences), `insertInFile`, `serialize`/`deserialize`. A singleton `fileSystem` is exported for server-side use.

### Database Client

`src/lib/prisma.ts` exports a singleton Prisma client using the `globalForPrisma` pattern for dev hot-reload safety. Imported by actions and API routes.

### AI Integration

- `src/lib/provider.ts`: `getLanguageModel()` returns real Anthropic model if `ANTHROPIC_API_KEY` is set, otherwise `MockLanguageModel` that generates static counter/form/card examples
- `maxSteps`: 4 for mock provider, 40 for real API; `maxTokens`: 10,000
- AI system prompt (`src/lib/prompts/generation.tsx`): requires `/App.jsx` as root entry point, Tailwind for styling, no HTML files, `@/` import alias
- AI tools are defined in `src/lib/tools/` — `str-replace.ts` and `file-manager.ts`, using Zod schemas for parameter validation

### Node Compatibility

`node-compat.cjs` is loaded via `NODE_OPTIONS='--require ./node-compat.cjs'` in dev/build/start scripts. It deletes `globalThis.localStorage`/`sessionStorage` on the server to fix Node.js 25+ SSR compatibility where these exist but are non-functional.

## Environment Variables

- `ANTHROPIC_API_KEY` — Optional. Without it, mock provider returns static examples
- `JWT_SECRET` — Optional. Falls back to `"development-secret-key"`

## Code Conventions

### File Naming
- **Components**: PascalCase (`ChatInterface.tsx`)
- **Utilities/hooks/contexts/actions**: kebab-case (`file-system.ts`, `use-auth.ts`, `chat-context.tsx`, `create-project.ts`)
- **Tests**: `__tests__/` directory alongside source, same base name with `.test.tsx` or `.test.ts`

### Code Style
- Arrow functions for components and utilities
- Named exports for components and utilities; default exports for pages/layout
- `"use client"` directive on interactive components; `"use server"` on server actions
- `@/*` import alias for `src/`
- Import order: React/Next → third-party → `@/*` absolute imports
- Tailwind classes only (no inline styles), composed with `cn()`
- async/await over `.then()` chains
- Explicit TypeScript types (strict mode enabled)

### Testing Patterns
- Vitest with jsdom environment, configured in `vitest.config.mts`
- `vite-tsconfig-paths` plugin enables `@/*` alias in tests
- `afterEach(() => cleanup())` in component tests
- `beforeEach(() => vi.clearAllMocks())` when mocks are used
- Component tests mock child components and context hooks via `vi.mock()`
- `@testing-library/user-event` for interaction simulation

## Key Directories

- `src/components/auth/` — Auth dialog, sign-in/sign-up forms
- `src/components/chat/` — Chat interface, message list, input, markdown renderer
- `src/components/editor/` — Code editor (Monaco), file tree
- `src/components/preview/` — Preview iframe with JSX transform pipeline
- `src/components/ui/` — shadcn/ui primitives
- `src/lib/tools/` — AI tool definitions (str-replace, file-manager)
- `src/lib/transform/` — Babel JSX transformation pipeline
- `src/lib/contexts/` — React context providers
- `src/lib/prompts/` — AI system prompts
- `src/hooks/` — Custom hooks (e.g., `use-auth.ts` for auth flows and anonymous work migration)

## Database

SQLite with Prisma; schema at `prisma/schema.prisma`, generated client at `src/generated/prisma/`.

Two models:
- **User**: id (cuid), email (unique), password (bcrypt), projects relation
- **Project**: id (cuid), name, userId (optional for anonymous), messages (JSON string), data (JSON string for VFS), user relation (cascade delete)
