# Playgrader

**Snap. Grade. Parent like a pro.**

Parents photograph any kids' TV show, book, toy, or food product and get an instant AI letter grade (A+ through F) on how appropriate it is for children ages 2 to 5, plus 2 or 3 better alternatives and a shareable report card.

Live: https://playgrader.vercel.app (custom domain playgrader.app pending DNS)

## What's in v1.1

- Structured grading via a forced Claude tool call (no more brittle JSON parsing)
- Better Alternatives on every grade (2 to 3 real products, each with its own grade)
- Shareable 1080x1350 report card PNG (Web Share on mobile, download on desktop)
- Email Me button (opens a prefilled email with the full report card)
- Recent Scans persist in localStorage (last 10)
- Installable PWA: icons, manifest, service worker, install prompt
- Friendly error copy, 60s timeout, image size guard, model fallback

## Deploy to Vercel

1. Get an Anthropic API key at https://console.anthropic.com
2. Push this repo to GitHub
3. Import the repo in Vercel and add environment variables:
   - `ANTHROPIC_API_KEY` (required)
   - `PLAYGRADE_MODEL` (optional, defaults to `claude-sonnet-4-5`; falls back to `claude-sonnet-4-20250514` if the model is not found)
4. Deploy

## Local dev and tests

```
npm run dev        # mock server on http://localhost:4173 (no API key needed)
npm run test:api   # unit tests for api/grade.js with a mocked Anthropic response
npm run test:ui    # Playwright browser test: scan flow, share, history, PWA, console errors
npm run icons      # regenerate public/icons from scripts/make-icons.py
```

## Project structure

```
api/grade.js        Serverless function: image in, structured report card out
public/index.html   The app (single file, no build step)
public/sw.js        Service worker (app shell cache)
public/manifest.json
public/icons/       PWA icons + OG image
scripts/            Mock server, tests, icon generator
loop-log.md         Build/QA log
```

## Costs

- Vercel hosting: free tier
- Anthropic API: roughly 1 to 3 cents per scan
