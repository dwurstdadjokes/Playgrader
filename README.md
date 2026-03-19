# Playgrader

**Is it good for your kids? Snap a photo and find out.**

AI-powered app that lets parents photograph any TV show, book, toy, or food product and get an instant letter grade on how appropriate it is for children ages 2-5.

## Deploy to Vercel (5 minutes)

### Step 1: Get an Anthropic API Key
1. Go to https://console.anthropic.com
2. Sign up or log in
3. Go to API Keys and create a new key
4. Copy the key (starts with `sk-ant-`)

### Step 2: Push to GitHub
1. Create a new repository on GitHub (e.g., `playgrader`)
2. Push this folder to that repository

### Step 3: Deploy on Vercel
1. Go to https://vercel.com and sign up (free) with your GitHub account
2. Click "Add New Project"
3. Import your `playgrader` repository
4. Before deploying, add your Environment Variable:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your API key from Step 1
5. Click Deploy

### Step 4: Share!
Your app will be live at `https://playgrader.vercel.app` (or you can connect your playgrader.app domain later).

## Costs
- Vercel hosting: Free
- Anthropic API: ~$0.02-0.03 per scan
- At 100 scans/day = ~$2-3/day

## Project Structure
```
playgrader-web/
  api/
    grade.js       # Serverless function that calls Claude API
  public/
    index.html     # The app frontend
    manifest.json  # PWA manifest
  package.json
  vercel.json      # Vercel routing config
```
