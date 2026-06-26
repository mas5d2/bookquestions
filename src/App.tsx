import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { QUESTIONS_MARKDOWN } from './questions'

type SelectionMode = 'priority' | 'random'

type Question = {
  id: string
  text: string
  priority: number
  order: number
}

type AnswerRecord = {
  questionId: string
  questionText: string
  answer: string
  updatedAt: string
}

type UserProgress = {
  answersByQuestionId: Record<string, AnswerRecord>
  skippedQuestionIds: string[]
}

type SavedState = {
  users: string[]
  activeUser: string
  selectionMode: SelectionMode
  progressByUser: Record<string, UserProgress>
}

type RemoteResponse = {
  ok: boolean
  responses: AnswerRecord[]
}

const STORAGE_KEY = 'book-questions-v1'

const DEFAULT_USERS = ['Mike', 'Irina']

function parseMarkdownQuestions(markdown: string): Question[] {
  return markdown
    .split('\n')
    .map((line, order) => {
      const match = line.match(/^\s*[-*+]\s+(?:\[(?:x| )\]\s*)?(.*)$/i)
      if (!match) {
        return null
      }

      let text = match[1].trim()
      if (!text) {
        return null
      }

      const priorityMatch = text.match(/^\[p(\d+)\]\s*/i)
      const priority = priorityMatch ? Number(priorityMatch[1]) : 3
      text = text.replace(/^\[p\d+\]\s*/i, '').trim()

      if (!text) {
        return null
      }

      const slug = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')

      return {
        id: `${order + 1}-${slug || 'question'}`,
        text,
        priority,
        order,
      }
    })
    .filter((value): value is Question => Boolean(value))
}

function getEmptyProgress(): UserProgress {
  return { answersByQuestionId: {}, skippedQuestionIds: [] }
}

function sortByPriorityThenOrder(questions: Question[]): Question[] {
  return [...questions].sort((a, b) => {
    if (a.priority === b.priority) {
      return a.order - b.order
    }
    return a.priority - b.priority
  })
}

function pickRandomQuestion(questions: Question[]): Question | null {
  if (questions.length === 0) {
    return null
  }
  const index = Math.floor(Math.random() * questions.length)
  return questions[index]
}

function getNextQuestion(remaining: Question[], mode: SelectionMode): Question | null {
  if (remaining.length === 0) {
    return null
  }

  if (mode === 'priority') {
    return sortByPriorityThenOrder(remaining)[0]
  }

  return pickRandomQuestion(remaining)
}

function App() {
  const [users, setUsers] = useState<string[]>(DEFAULT_USERS)
  const [activeUser, setActiveUser] = useState<string>(DEFAULT_USERS[0])
  const [newUserName, setNewUserName] = useState('')
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('priority')
  const [progressByUser, setProgressByUser] = useState<Record<string, UserProgress>>({
    [DEFAULT_USERS[0]]: getEmptyProgress(),
    [DEFAULT_USERS[1]]: getEmptyProgress(),
  })
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null)
  const [draftAnswer, setDraftAnswer] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [speechError, setSpeechError] = useState('')
  const [syncStatus, setSyncStatus] = useState('Local only')
  const recognitionRef = useRef<any>(null)

  const questions = useMemo(() => parseMarkdownQuestions(QUESTIONS_MARKDOWN), [])

  const speechSupported = useMemo(() => {
    const speechWindow = window as Window & {
      SpeechRecognition?: new () => any
      webkitSpeechRecognition?: new () => any
    }
    return Boolean(
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition,
    )
  }, [])

  const activeProgress = progressByUser[activeUser] ?? getEmptyProgress()
  const deferredQuestionIds = new Set(activeProgress.skippedQuestionIds ?? [])

  const remainingQuestions = useMemo(() => {
    const answered = activeProgress.answersByQuestionId
    return questions.filter((question) => !answered[question.id])
  }, [questions, activeProgress])

  const prioritizedRemainingQuestions = useMemo(() => {
    const notDeferred = remainingQuestions.filter(
      (question) => !deferredQuestionIds.has(question.id),
    )

    return notDeferred.length > 0 ? notDeferred : remainingQuestions
  }, [remainingQuestions, activeProgress])

  const currentQuestion = useMemo(() => {
    if (!currentQuestionId) {
      return null
    }
    return questions.find((question) => question.id === currentQuestionId) ?? null
  }, [currentQuestionId, questions])

  const answeredCount = questions.length - remainingQuestions.length

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return
    }

    try {
      const saved = JSON.parse(raw) as SavedState
      if (Array.isArray(saved.users) && saved.users.length > 0) {
        setUsers(saved.users)
      }
      if (typeof saved.activeUser === 'string' && saved.activeUser) {
        setActiveUser(saved.activeUser)
      }
      if (saved.selectionMode === 'priority' || saved.selectionMode === 'random') {
        setSelectionMode(saved.selectionMode)
      }
      if (saved.progressByUser && typeof saved.progressByUser === 'object') {
        setProgressByUser(saved.progressByUser)
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    if (!users.includes(activeUser)) {
      setActiveUser(users[0] ?? '')
      return
    }

    if (!progressByUser[activeUser]) {
      setProgressByUser((previous) => ({
        ...previous,
        [activeUser]: getEmptyProgress(),
      }))
    }
  }, [users, activeUser, progressByUser])

  useEffect(() => {
    const state: SavedState = {
      users,
      activeUser,
      selectionMode,
      progressByUser,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [users, activeUser, selectionMode, progressByUser])

  useEffect(() => {
    if (remainingQuestions.length === 0) {
      setCurrentQuestionId(null)
      return
    }

    const stillRemaining = remainingQuestions.some(
      (question) => question.id === currentQuestionId,
    )
    if (stillRemaining) {
      return
    }

    const next = getNextQuestion(prioritizedRemainingQuestions, selectionMode)
    setCurrentQuestionId(next?.id ?? null)
  }, [prioritizedRemainingQuestions, selectionMode, currentQuestionId, remainingQuestions])

  useEffect(() => {
    if (!currentQuestion) {
      setDraftAnswer('')
      return
    }

    const existing = activeProgress.answersByQuestionId[currentQuestion.id]?.answer ?? ''
    setDraftAnswer(existing)
  }, [currentQuestion, activeProgress])

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [])

  useEffect(() => {
    if (!activeUser) {
      return
    }

    let ignore = false

    async function loadRemoteResponses() {
      try {
        const response = await fetch(`/api/responses?user=${encodeURIComponent(activeUser)}`)
        if (!response.ok) {
          throw new Error('Remote API not configured')
        }

        const data = (await response.json()) as RemoteResponse
        if (!data.ok || ignore) {
          return
        }

        const mapped: Record<string, AnswerRecord> = {}
        for (const record of data.responses) {
          mapped[record.questionId] = record
        }

        setProgressByUser((previous) => ({
          ...previous,
          [activeUser]: {
            skippedQuestionIds: previous[activeUser]?.skippedQuestionIds ?? [],
            answersByQuestionId: {
              ...previous[activeUser]?.answersByQuestionId,
              ...mapped,
            },
          },
        }))
        setSyncStatus('Synced with Vercel database')
      } catch {
        if (!ignore) {
          setSyncStatus('Local only (Vercel DB not configured yet)')
        }
      }
    }

    loadRemoteResponses()

    return () => {
      ignore = true
    }
  }, [activeUser])

  function addUser() {
    const trimmed = newUserName.trim()
    if (!trimmed || users.includes(trimmed)) {
      return
    }

    setUsers((previous) => [...previous, trimmed])
    setProgressByUser((previous) => ({
      ...previous,
      [trimmed]: getEmptyProgress(),
    }))
    setActiveUser(trimmed)
    setNewUserName('')
  }

  async function saveAnswer() {
    if (!currentQuestion || !activeUser) {
      return
    }

    const trimmed = draftAnswer.trim()
    if (!trimmed) {
      return
    }

    const record: AnswerRecord = {
      questionId: currentQuestion.id,
      questionText: currentQuestion.text,
      answer: trimmed,
      updatedAt: new Date().toISOString(),
    }

    setProgressByUser((previous) => {
      const existing = previous[activeUser] ?? getEmptyProgress()
      const remainingSkipped = (existing.skippedQuestionIds ?? []).filter(
        (questionId) => questionId !== currentQuestion.id,
      )
      return {
        ...previous,
        [activeUser]: {
          skippedQuestionIds: remainingSkipped,
          answersByQuestionId: {
            ...existing.answersByQuestionId,
            [currentQuestion.id]: record,
          },
        },
      }
    })

    setDraftAnswer('')
    setCurrentQuestionId(null)

    try {
      const response = await fetch('/api/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user: activeUser, ...record }),
      })

      if (!response.ok) {
        throw new Error('Failed to sync')
      }
      setSyncStatus('Synced with Vercel database')
    } catch {
      setSyncStatus('Saved locally. Remote sync unavailable.')
    }
  }

  function skipQuestionForNow() {
    if (!currentQuestion || !activeUser) {
      return
    }

    setProgressByUser((previous) => {
      const existing = previous[activeUser] ?? getEmptyProgress()
      if (existing.answersByQuestionId[currentQuestion.id]) {
        return previous
      }

      const skipped = new Set(existing.skippedQuestionIds ?? [])
      skipped.add(currentQuestion.id)

      return {
        ...previous,
        [activeUser]: {
          ...existing,
          skippedQuestionIds: [...skipped],
        },
      }
    })

    setDraftAnswer('')
    setCurrentQuestionId(null)
  }

  function chooseDifferentRandomQuestion() {
    if (selectionMode !== 'random' || remainingQuestions.length < 2) {
      return
    }

    const withoutCurrent = remainingQuestions.filter(
      (question) => question.id !== currentQuestionId,
    )
    const next = pickRandomQuestion(withoutCurrent)
    setCurrentQuestionId(next?.id ?? null)
  }

  function startListening() {
    setSpeechError('')

    const speechWindow = window as Window & {
      SpeechRecognition?: new () => any
      webkitSpeechRecognition?: new () => any
    }
    const Recognition =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition

    if (!Recognition) {
      setSpeechError('Speech recognition is not supported on this browser.')
      return
    }

    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      setIsListening(true)
    }

    recognition.onerror = (event: any) => {
      const code = event?.error ?? 'unknown'
      setSpeechError(`Speech recognition error: ${code}`)
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
      recognitionRef.current = null
    }

    recognition.onresult = (event: any) => {
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript
        }
      }

      if (finalText.trim()) {
        setDraftAnswer((previous) => {
          const spacer = previous.trim().length > 0 ? ' ' : ''
          return `${previous}${spacer}${finalText.trim()}`
        })
      }
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  function stopListening() {
    recognitionRef.current?.stop()
  }

  const answerList = Object.values(activeProgress.answersByQuestionId).sort((a, b) =>
    a.updatedAt < b.updatedAt ? 1 : -1,
  )

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">Book Interview Studio</p>
        <h1>Capture your stories, one guided question at a time</h1>
        <p className="hero-subtitle">
          Two users can answer the same questionnaire independently. Use typed
          answers or tap the mic and speak.
        </p>
      </header>

      <section className="grid">
        <article className="card">
          <h2>People</h2>
          <p className="muted">Track separate responses for each person.</p>

          <div className="chips" role="list" aria-label="Users">
            {users.map((user) => (
              <button
                key={user}
                type="button"
                className={user === activeUser ? 'chip active' : 'chip'}
                onClick={() => setActiveUser(user)}
              >
                {user}
              </button>
            ))}
          </div>

          <div className="row">
            <input
              className="text-input"
              value={newUserName}
              onChange={(event) => setNewUserName(event.target.value)}
              placeholder="Add another person"
            />
            <button type="button" className="btn btn-secondary" onClick={addUser}>
              Add
            </button>
          </div>
        </article>

        <article className="card">
          <h2>Interview Settings</h2>
          <p className="muted">
            Questions are stored in code at src/questions.ts and deployed by commit.
          </p>

          <div className="row wrap">
            <label className="field-label" htmlFor="mode">
              Selection mode
            </label>
            <select
              id="mode"
              className="select"
              value={selectionMode}
              onChange={(event) => setSelectionMode(event.target.value as SelectionMode)}
            >
              <option value="priority">Priority order</option>
              <option value="random">Random</option>
            </select>
          </div>

          <p className="muted">Parsed questions: {questions.length}</p>
        </article>

        <article className="card card-highlight">
          <div className="row spread">
            <div>
              <h2>Current Prompt</h2>
              <p className="muted">
                {activeUser ? `${activeUser}'s session` : 'Choose a user first'}
              </p>
              <p className="muted small">{syncStatus}</p>
            </div>
            <div className="stats">
              <span>
                {answeredCount}/{questions.length} done
              </span>
            </div>
          </div>

          {currentQuestion ? (
            <>
              <p className="question">{currentQuestion.text}</p>
              <p className="muted small">Priority: P{currentQuestion.priority}</p>

              <textarea
                className="answer-input"
                value={draftAnswer}
                onChange={(event) => setDraftAnswer(event.target.value)}
                placeholder="Type your answer or use the mic"
                rows={7}
              />

              <div className="row wrap">
                {!isListening ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={startListening}
                    disabled={!speechSupported}
                  >
                    Start Mic
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={stopListening}
                  >
                    Stop Mic
                  </button>
                )}

                {selectionMode === 'random' ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={chooseDifferentRandomQuestion}
                    disabled={remainingQuestions.length < 2}
                  >
                    Different Random Question
                  </button>
                ) : null}

                <button type="button" className="btn" onClick={saveAnswer}>
                  Save Answer
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={skipQuestionForNow}
                >
                  Skip For Now
                </button>
              </div>

              {speechError ? <p className="error-text">{speechError}</p> : null}
            </>
          ) : (
            <p className="done-banner">
              All questions are complete for {activeUser}. Nice work.
            </p>
          )}
        </article>

        <article className="card">
          <h2>Saved Answers</h2>
          <p className="muted">Latest answers for {activeUser}</p>

          {answerList.length === 0 ? (
            <p className="muted">No saved answers yet.</p>
          ) : (
            <ul className="answer-list">
              {answerList.map((record) => (
                <li key={record.questionId}>
                  <h3>{record.questionText}</h3>
                  <p>{record.answer}</p>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </main>
  )
}

export default App
