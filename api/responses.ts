import { neon } from '@neondatabase/serverless'

function getSqlClient() {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL
  if (!connectionString) {
    return null
  }
  return neon(connectionString)
}

async function ensureTable(sql: ReturnType<typeof neon>) {
  await sql`
    CREATE TABLE IF NOT EXISTS book_responses (
      id SERIAL PRIMARY KEY,
      user_name TEXT NOT NULL,
      question_id TEXT NOT NULL,
      question_text TEXT NOT NULL,
      answer TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_name, question_id)
    )
  `
}

export default async function handler(req: any, res: any) {
  const sql = getSqlClient()

  if (!sql) {
    res.status(503).json({
      ok: false,
      message: 'Database is not configured. Set DATABASE_URL in Vercel project settings.',
    })
    return
  }

  try {
    await ensureTable(sql)

    if (req.method === 'GET') {
      const user = String(req.query.user || '').trim()
      if (!user) {
        res.status(400).json({ ok: false, message: 'Missing user query parameter.' })
        return
      }

      const rows = await sql`
        SELECT question_id, question_text, answer, updated_at
        FROM book_responses
        WHERE user_name = ${user}
        ORDER BY updated_at DESC
      `

      const responses = rows.map((row) => ({
        questionId: row.question_id,
        questionText: row.question_text,
        answer: row.answer,
        updatedAt: new Date(row.updated_at).toISOString(),
      }))

      res.status(200).json({ ok: true, responses })
      return
    }

    if (req.method === 'POST') {
      const payload =
        typeof req.body === 'string' && req.body ? JSON.parse(req.body) : req.body || {}

      const user = String(payload.user || '').trim()
      const questionId = String(payload.questionId || '').trim()
      const questionText = String(payload.questionText || '').trim()
      const answer = String(payload.answer || '').trim()
      const updatedAt = String(payload.updatedAt || new Date().toISOString())

      if (!user || !questionId || !questionText || !answer) {
        res.status(400).json({ ok: false, message: 'Missing required fields.' })
        return
      }

      await sql`
        INSERT INTO book_responses (user_name, question_id, question_text, answer, updated_at)
        VALUES (${user}, ${questionId}, ${questionText}, ${answer}, ${updatedAt}::timestamptz)
        ON CONFLICT (user_name, question_id)
        DO UPDATE SET
          question_text = EXCLUDED.question_text,
          answer = EXCLUDED.answer,
          updated_at = EXCLUDED.updated_at
      `

      res.status(200).json({ ok: true })
      return
    }

    res.setHeader('Allow', 'GET, POST')
    res.status(405).json({ ok: false, message: 'Method not allowed.' })
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: 'Server error while accessing responses.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
