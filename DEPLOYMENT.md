# Deployment Checklist

## 1. Create Supabase

1. Go to Supabase and create a new project.
2. Open the SQL editor.
3. Run [supabase/schema.sql](supabase/schema.sql).
4. Copy the project URL and the service role key from the project settings.

## 2. Add Environment Variables

Create `.env.local` in the project root with:

```bash
SUPABASE_URL=your-supabase-project-url
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

Do not put the service role key in the browser. This app only reads it on the server through the API route.

## 3. Test Locally

1. Run `npm install` if needed.
2. Run `npm run dev`.
3. Open the app.
4. Enter the same room code on both devices or browser windows.
5. Create a question on one side and answer it from the other side.

## 4. Deploy

1. Push the repo to GitHub.
2. Connect the repo to your deployment platform.
3. Add the same environment variables in the platform settings.
4. Deploy.

## 5. After Deploy

1. Open the deployed site from two different devices.
2. Use the same room code.
3. Confirm that new questions and answers appear on both sides.

## Notes

- The app is intentionally shared-only and lightweight.
- If you want larger uploads later, swap the data-url attachment approach for Supabase Storage.
- If you want to make the room private later, the next step is adding auth and row-level security.