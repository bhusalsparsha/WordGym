# Cloudflare Deployment

- Deploy `apps/web` to Vercel.
- Deploy `workers/api` to Cloudflare Workers.
- Bind Cloudflare D1 to the Worker as `DB`.
- Bind Durable Objects as the authoritative room runtime.
- Use Cloudflare KV for optional cached config and Cloudflare Queues for async jobs if needed.
- Keep `NEXT_PUBLIC_API_URL` pointed at the Worker deployment URL.
