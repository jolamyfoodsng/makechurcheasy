# MakeChurchEasy Payload CMS

Payload is integrated into the API service and uses the existing MongoDB `blog_posts` collection. This keeps current posts and public `/api/blog` responses in place. The current authenticated `/admin/blog` editor now reads and writes those posts through Payload's Local API.

## Access

- Existing editor: `/admin/blog` on the dashboard site.
- Payload's native CMS: `https://api.makechurcheazy.com/cms` (local API development: `http://localhost:3004/cms`).
- Payload REST API: `/payload-api`; the existing application API remains under `/api`.

The CMS has a separate Payload login. On the first production deployment, visit `/cms/create-first-user` to create its initial administrator. Later account creation is restricted to CMS administrators. The dashboard editor continues to use the existing MakeChurchEasy administrator sign-in.

## Required configuration

Set `PAYLOAD_SECRET` to a unique, long random value in the API environment (including the Cloudflare Worker secret forwarded to its API container). `MONGODB_URI` must point to the existing MakeChurchEasy database. Do not reuse a password or commit the production secret.

## Field compatibility

The Payload `blog-posts` collection maps directly to MongoDB's existing `blog_posts` collection. It retains Markdown content, the current `status` field, cover-image URLs, author details, reading-time values, and string tags. Cover image uploads continue through the existing R2-backed upload endpoint.

If collection fields change, regenerate the Payload admin import map with `npm run payload:importmap` from `api/`.
