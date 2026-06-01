# IdeaSpark

A React + Supabase app where developers can post project ideas, upvote ideas, and request collaboration.

## Features

- GitHub OAuth login via Supabase Auth
- Post project ideas
- Upvote / remove upvote on ideas
- Send collaboration requests to idea owners
- TailwindCSS-powered UI

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment variables and fill in your Supabase values:
   ```bash
   cp .env.example .env
   ```
3. In Supabase, enable **GitHub** provider under Authentication.
4. Add your app URL (for local dev: `http://localhost:5173`) to:
   - Supabase Auth redirect URLs
   - GitHub OAuth app callback URL (Supabase callback)

## Database schema (Supabase SQL)

```sql
create table if not exists ideas (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  creator_id uuid,
  creator_email text,
  created_at timestamptz not null default now()
);

create table if not exists idea_upvotes (
  idea_id uuid not null references ideas(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);

create table if not exists collaboration_requests (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  requester_id uuid not null,
  message text,
  created_at timestamptz not null default now()
);
```

## Run

```bash
npm run dev
```

## Validate

```bash
npm run lint
npm run build
```
