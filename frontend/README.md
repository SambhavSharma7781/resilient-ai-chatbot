# Frontend

Next.js 16 (App Router) + TypeScript + Tailwind chat UI. See the repository root README for the full project.

```bash
cp .env.example .env.local   # NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
npm ci
npm run dev                  # http://localhost:3000
npm run lint && npm run build
```

`NEXT_PUBLIC_API_BASE_URL` is read at **build time**, so after changing it on Vercel, redeploy.
