# MakeChurchEasy Blog

This is the MakeChurchEasy version of Vercel's Next.js `blog-starter` example. The public pages keep the starter's layout and reading experience, while the content and branding are specific to MakeChurchEasy.

The app lives at `blog/` inside the main MakeChurchEasy repository. It remains a self-contained Next.js app so its Markdown content, content API, and Vercel deployment can evolve independently from the desktop app.

## Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

From the MakeChurchEasy repository root, use `npm --prefix blog run dev`.

Posts in `_posts` are Markdown files with front matter. They are the source used to generate the public pages.

## Content API

The API is intended for an AI writer or an automation service. Write requests require a Bearer token matching `BLOG_API_TOKEN`.

- `GET /api/posts` lists published post metadata.
- `GET /api/posts/:slug` returns one published post.
- `POST /api/posts` creates a post.
- `PUT /api/posts/:slug` updates a post.

Example create request:

```bash
curl -X POST http://localhost:3000/api/posts \
  -H 'Authorization: Bearer replace-with-a-long-random-secret' \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "A helpful church media guide",
    "excerpt": "A short description for the card and search results.",
    "content": "## The guide\n\nWrite the article in Markdown.",
    "category": "Church Media",
    "tags": ["church media", "worship"]
  }'
```

### Production storage

Set the variables in `.env.example` in Vercel. In production, a successful API write commits the Markdown post to the configured GitHub repository. Vercel then rebuilds the site automatically, so the AI can publish without anyone manually editing files or using a separate paid CMS.

For local development, if the GitHub variables are absent, writes go directly to `_posts`. Production refuses to write unless GitHub storage is configured.

Keep `BLOG_API_TOKEN` and `GITHUB_CONTENT_TOKEN` private. Store them in Vercel environment variables or a local `.env.local` file; never put them in browser code or committed files.

## SEO and distribution

The project includes:

- per-post title, description, canonical URL, Open Graph, and Twitter metadata;
- `sitemap.xml` and `robots.txt`;
- an RSS feed at `/feed.xml`;
- static generation for the published Markdown posts.

## Deployment shape

Deploy this as its own Vercel project with `blog/` as the project root and connect `blog.makechurcheazy.com` to it. A `/blog` path on the main MakeChurchEasy site can be added later with a rewrite, but the subdomain keeps the blog deployment, SEO URLs, and content automation independent.
