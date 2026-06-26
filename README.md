# Book Interview Studio

A simple app to collect long-form story answers for a book project.

It supports:
- Multiple people (for example: you and your wife)
- Question lists written in markdown bullets (stored in code)
- Priority mode or random mode for selecting the next question
- Speech-to-text input from the browser mic
- Local persistence in browser storage
- Optional cloud sync through a Vercel API route + Neon/Postgres

## Local run

1. Install dependencies:
   npm install

2. Start dev server:
   npm run dev

3. Open the URL shown by Vite.

## Question markdown format

Questions are defined in `src/questions.ts` and deployed with your code.

Use bullet list items.

Example:
- [p1] What is your first childhood memory?
- [p2] What was your first job?
- [p3] What advice would you give your younger self?

Priority tags are optional. Lower numbers are asked first in priority mode.

## Deploy to Vercel

1. Push this project to GitHub.
2. Import the repo in Vercel.
3. Add a Neon/Postgres database in Vercel Marketplace or connect an existing one.
4. In Vercel Project Settings -> Environment Variables, add:
   DATABASE_URL
5. Redeploy.

The frontend is served from dist and the API route is:
- /api/responses

## Notes about user identity

This version uses a simple name-based user switcher, not full authentication.
For a lightweight family workflow this is usually enough.
If you want real login accounts next, add:
- Vercel Auth provider or Clerk/Auth.js
- A user table with account IDs instead of plain names
