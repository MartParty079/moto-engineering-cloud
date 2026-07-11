# Moto Engineering Cloud v5 — Server-Side OpenAI

This version adds a secure AI Project Assistant through Supabase Edge Functions.

## What it does

- Keeps the OpenAI API key on the server
- Authenticates the signed-in Supabase user
- Reads only that user's project records through Row Level Security
- Answers questions about roadmap tasks, proof requirements, parts, notes, rides, maintenance, and engineering records
- Can focus on one selected work package
- Creates structured change proposals
- Requires human approval before applying changes
- Records chat messages, proposals, and token usage

## Safety model

The AI cannot silently edit the project. Proposed changes are stored in `ai_change_proposals` and appear in the AI Assistant page. You must approve or reject each proposal.

The apply function only permits a small whitelist of actions and fields:

- Update a task
- Create a task
- Create a note
- Update a part

It does not allow automatic deletion, proof-gate bypass, dependency removal, or unreviewed completion approval.

## 1. Run the database migration

In Supabase SQL Editor, run:

```text
supabase/migration_v5.sql
```

## 2. Add your OpenAI API secret

Create an OpenAI API key in your OpenAI Platform project. Do not put this key in GitHub, Vercel, or any variable beginning with `VITE_`.

Using Supabase CLI:

```bash
supabase secrets set OPENAI_API_KEY=your_openai_api_key
supabase secrets set OPENAI_MODEL=gpt-5-mini
```

`OPENAI_MODEL` is optional. Change it later without editing the application.

You can also add Edge Function secrets through the Supabase dashboard if that option is available in your project.

## 3. Deploy the Edge Functions

Install and sign in to the Supabase CLI, then from the project directory:

```bash
supabase link --project-ref YOUR_PROJECT_REFERENCE
supabase functions deploy ai-chat --no-verify-jwt
supabase functions deploy ai-apply-proposal --no-verify-jwt
```

The functions deliberately use `--no-verify-jwt` because the code manually validates the signed-in user's access token before reading or changing anything.

## 4. Update GitHub

Replace the existing repository files with this package and commit:

```text
Add server-side OpenAI project assistant
```

Vercel will redeploy the front end automatically.

## 5. Test it

1. Sign in to Moto Engineering Cloud.
2. Open **AI Assistant**.
3. Choose the whole project or one work package.
4. Ask: `What is the safest next task and what proof will I need?`
5. Review any pending change proposals.
6. Approve or reject each proposal.

## Current file-reading scope

This first AI release reads:

- Database records
- Work-package fields
- Proof rules
- Attachment names, types, categories, and metadata

It does not yet send the actual contents of private Word, Excel, PDF, CAD, code, image, or video files to OpenAI. That is the next stage: a secure attachment-analysis function with size limits and per-file approval.
