# Soft WAV

Soft WAV is a music-discovery experience that keeps its own recommendation logic and uses external providers only for supplemental discovery and preview support.

## Email confirmation redirects

Signup confirmation returns to the page where the user created their account. In the hosted Supabase project, set **Authentication → URL Configuration → Site URL** to the public site origin and add the deployed site URL (for example, `https://your-site.example/**`) to **Redirect URLs**. Supabase only accepts confirmation redirects that are on this allowlist. `supabase/config.toml` configures local development only.

## Deezer integration

The project now includes a modular Deezer provider and backend proxy layer that keeps all external API calls on the server side.

### Security and compliance rules

- No Deezer credentials are exposed in frontend JavaScript.
- Public preview URLs are used only when Deezer provides them.
- Full-song downloads, scraping, or redistribution are not implemented.
- The Soft WAV recommendation engine remains independent from Deezer.

### Environment variables

Use the template in `.env.example` and keep your real values in `.env` locally.

```bash
cp .env.example .env
```

### Endpoints

- `GET /api/deezer/health`
- `GET /api/deezer/search?q=artist+track&limit=5`
- `GET /api/deezer/track/:id`
- `GET /api/deezer/artist/:id`
- `GET /api/deezer/album/:id`

### Provider structure

```text
providers/
  deezer/
    index.js
backend/
  deezer.js
```

This keeps the Deezer logic replaceable without rewriting the rest of the platform.
