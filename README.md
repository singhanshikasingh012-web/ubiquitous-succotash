# Quiet Questions

A cozy two-person question room for thoughtful prompts, answers, photos, and voice notes.

## Getting Started

1. Create a Supabase project.
2. Run the SQL in [supabase/schema.sql](supabase/schema.sql).
3. Copy [.env.example](.env.example) to `.env.local` and fill in:

```bash
SUPABASE_URL=your-supabase-project-url
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

4. Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and enter the same room code on both devices.

## Deploy

See [DEPLOYMENT.md](DEPLOYMENT.md) for the exact Supabase and hosting checklist.

## Notes

- Questions and answers are stored remotely, so the room works across distant devices.
- Attachments are saved as data URLs for simplicity, which is fine for small images, audio clips, and short videos.
- The shared room is intentionally lightweight, so it can feel more like a private journal than a social app.