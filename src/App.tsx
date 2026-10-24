import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  chapterKey,
  emptyChapterEvidence,
  emptyExamIntelligenceDatabase,
  examIntegrations,
  EXAM_INTELLIGENCE_KEY,
  isOfficialIatSource,
  normalizeExamIntelligenceDatabase,
  officialIatSource,
  type ChapterEvidence,
  type ExamIntelligenceDatabase,
} from './data/examIntelligence'
import './index.css'

type Priority = 'High' | 'Medium' | 'Low'
type Subject = 'Physics' | 'Chemistry' | 'Mathematics' | 'Biology'
type TaskStatus = 'Not Started' | 'In Progress' | 'Ongoing' | 'Completed' | 'Cancelled'
type TaskType = 'Concepts' | 'Practice' | 'Revision' | 'PYQs'
type TaskCheckpointKey = 'conceptRevision' | 'solvedExamples' | 'pyqs' | 'errorAnalysis'
type TaskCheckpoints = Record<TaskCheckpointKey, boolean>
type Page =
  | 'Dashboard'
  | 'Today’s Tasks'
  | 'Weekly Planner'
  | 'Syllabus'
  | 'Exam Intelligence'
  | 'AI Exam Analyst'
  | 'Exam Trend Explorer'
  | 'Prerequisites'
  | 'Learning Paths'
  | 'Revision'
  | 'Performance'
  | 'Settings'

type Task = {
  id: string
  userId: string | null
  title: string
  topic: string
  subject: Subject
  chapter: string
  taskType: TaskType
  questionTarget: number
  questionsCompleted: number
  checkpoints: TaskCheckpoints
  status: TaskStatus
  priority: Priority
  deadline: string
  estimateMinutes: number
  actualMinutes: number
  progress: number
  done: boolean
  revision: boolean
  createdAt: string
  completedAt?: string
}

type StudyLog = {
  id: string
  userId: string | null
  date: string
  subject: Subject
  chapter: string
  taskId: string | null
  minutes: number
  source: 'timer' | 'manual'
  seconds?: number
  sessionId?: string
}

type RevisionRecord = {
  id: string
  userId: string | null
  taskId: string
  title: string
  subject: Subject
  chapter: string
  dueDate: string
  cycle: number
  completed: boolean
  completedAt?: string
  revisionNumber?: number
  reason?: string
  lastRevisedAt?: string
  recallRating?: 'forgotten' | 'partial' | 'recalled'
  attemptedQuestions?: number
  correctQuestions?: number
}

type PlannedTask = {
  id: string
  userId: string | null
  taskId: string
  date: string
}

type DailyStudyLogNote = {
  tagline: string
  reflection: string
}

type Profile = {
  userId: string | null
  stage: string
  stream: string
  exam: string
  examDate: string
  planningStart: string
}

const TASK_KEY = 'zenora-tasks-v1'
const LOG_KEY = 'zenora-study-logs-v1'
const REVISION_KEY = 'zenora-revisions-v1'
const PLAN_KEY = 'zenora-weekly-plan-v1'
const PROFILE_KEY = 'zenora-profile-v1'
const STREAK_KEY = 'zenora-streak-days-v1'
const SETTINGS_KEY = 'zenora-settings-v1'
const DAILY_LOG_NOTE_KEY = 'zenora-daily-study-log-notes-v1'

const subjects: Subject[] = ['Physics', 'Chemistry', 'Mathematics', 'Biology']
const priorities: Priority[] = ['High', 'Medium', 'Low']
const taskTypes: TaskType[] = ['Concepts', 'Practice', 'Revision', 'PYQs']
const taskStatuses: TaskStatus[] = ['Not Started', 'In Progress', 'Ongoing', 'Completed', 'Cancelled']
const taskCheckpointLabels: { key: TaskCheckpointKey; label: string }[] = [
  { key: 'conceptRevision', label: 'Concept revision' },
  { key: 'solvedExamples', label: 'Solved examples' },
  { key: 'pyqs', label: 'PYQs' },
  { key: 'errorAnalysis', label: 'Error analysis' },
]
const emptyTaskCheckpoints = (): TaskCheckpoints => ({
  conceptRevision: false,
  solvedExamples: false,
  pyqs: false,
  errorAnalysis: false,
})
const DAILY_STREAK_GOAL = 45
const examOptions = [
  { name: 'IAT 2027', date: '2027-05-25T09:00' },
  { name: 'NEST 2027', date: '2027-06-20T09:00' },
  { name: 'JEE Main 2027', date: '2027-01-20T09:00' },
  { name: 'JEE Advanced 2027', date: '2027-05-23T09:00' },
  { name: 'NEET 2027', date: '2027-05-02T09:00' },
]

const quotes = [
  { text: 'Great things are done by a series of small things brought together.', author: 'Vincent van Gogh' },
  { text: 'It always seems impossible until it’s done.', author: 'Nelson Mandela' },
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'Nothing in life is to be feared, it is only to be understood.', author: 'Marie Curie' },
  { text: 'Somewhere, something incredible is waiting to be known.', author: 'Carl Sagan' },
  { text: 'The important thing is to never stop questioning.', author: 'Albert Einstein' },
  { text: 'Well done is better than well said.', author: 'Benjamin Franklin' },
  { text: 'A little progress each day adds up to big results.', author: 'Unknown' },
]

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const shiftDate = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const shiftMonth = (month: string, offset: number) => {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(year, monthNumber - 1 + offset, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
const readJSON = <T,>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as T : fallback
  } catch {
    return fallback
  }
}
const formatDate = (date: string) =>
  date ? new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'No date'
const formatMinutes = (minutes: number) => {
  const safe = Math.max(0, Math.round(minutes))
  const h = Math.floor(safe / 60)
  const m = safe % 60
  return h ? `${h}h ${m}m` : `${m}m`
}
const studyMinutes = (log: StudyLog) => Math.max(0, log.seconds === undefined ? log.minutes : log.seconds / 60)
const timeLabel = (seconds: number) =>
  `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0')}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`
const safeNumber = (value: string, fallback: number) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}
const parseHistoricalCounts = (value: string) => {
  if (!value.trim()) return []
  const parsed = value.split(',').map(entry => {
    const match = entry.trim().match(/^(\d{4})\s*:\s*(\d+)$/)
    return match ? { year: Number(match[1]), questions: Number(match[2]) } : null
  })
  if (parsed.some(entry => !entry || entry.year < 1900 || entry.year > new Date().getFullYear() || entry.questions < 0)) return null
  const counts = parsed as { year: number; questions: number }[]
  return new Set(counts.map(entry => entry.year)).size === counts.length ? counts.sort((a, b) => a.year - b.year) : null
}
const statusProgress: Record<TaskStatus, number> = {
  'Not Started': 0,
  'In Progress': 35,
  Ongoing: 70,
  Completed: 100,
  Cancelled: 0,
}

const defaultTasks: Task[] = [
  {
    id: 'starter-1', userId: null, title: 'Rotational Motion — concepts', topic: 'Rotational Motion — concepts', subject: 'Physics', chapter: 'Rotational Motion', taskType: 'Concepts', questionTarget: 0, questionsCompleted: 0, checkpoints: emptyTaskCheckpoints(), priority: 'High', deadline: '', estimateMinutes: 90, actualMinutes: 0, progress: 0, done: false, revision: false, createdAt: todayISO(),
    status: 'Not Started'
  },
  {
    id: 'starter-2', userId: null, title: 'Chemical Bonding practice', topic: 'Chemical Bonding practice', subject: 'Chemistry', chapter: 'Chemical Bonding', taskType: 'Practice', questionTarget: 0, questionsCompleted: 0, checkpoints: emptyTaskCheckpoints(), priority: 'Medium', deadline: '', estimateMinutes: 60, actualMinutes: 0, progress: 0, done: false, revision: true, createdAt: todayISO(),
    status: 'Not Started'
  },
  {
    id: 'starter-3', userId: null, title: 'Cell: The Unit of Life', topic: '', subject: 'Biology', chapter: 'Cell: The Unit of Life', taskType: 'Revision', questionTarget: 0, questionsCompleted: 0, checkpoints: emptyTaskCheckpoints(), priority: 'Low', deadline: '', estimateMinutes: 45, actualMinutes: 45, progress: 100, done: true, revision: true, createdAt: todayISO(), completedAt: todayISO(),
    status: 'Completed'
  },
]

function normalizeTask(t: Partial<Task>, i: number): Task {
  const status = taskStatuses.includes(t.status as TaskStatus)
    ? t.status as TaskStatus
    : t.done || (t.progress || 0) >= 100 ? 'Completed' : (t.progress || 0) > 0 ? 'In Progress' : 'Not Started'
  return {
    id: t.id || `migrated-${i}-${uid()}`,
    userId: t.userId ?? null,
    title: t.title || 'Untitled task',
    topic: typeof t.topic === 'string' ? t.topic : (t.chapter && t.chapter !== t.title ? t.title || '' : ''),
    subject: subjects.includes(t.subject as Subject) ? t.subject as Subject : 'Physics',
    chapter: t.chapter || t.title || '',
    taskType: taskTypes.includes(t.taskType as TaskType) ? t.taskType as TaskType : t.revision ? 'Revision' : 'Concepts',
    questionTarget: Math.max(0, Math.round(t.questionTarget ?? 0)),
    questionsCompleted: Math.max(0, Math.min(Math.round(t.questionTarget ?? 0), Math.round(t.questionsCompleted ?? 0))),
    checkpoints: {
      conceptRevision: Boolean(t.checkpoints?.conceptRevision),
      solvedExamples: Boolean(t.checkpoints?.solvedExamples),
      pyqs: Boolean(t.checkpoints?.pyqs),
      errorAnalysis: Boolean(t.checkpoints?.errorAnalysis),
    },
    status,
    priority: priorities.includes(t.priority as Priority) ? t.priority as Priority : 'Medium',
    deadline: t.deadline || '',
    estimateMinutes: Math.max(0, t.estimateMinutes ?? 60),
    actualMinutes: Math.max(0, t.actualMinutes ?? 0),
    progress: statusProgress[status],
    done: status === 'Completed',
    revision: Boolean(t.revision),
    createdAt: t.createdAt || todayISO(),
    completedAt: t.completedAt,
  }
}

function readTasks(): Task[] {
  const saved = readJSON<Partial<Task>[]>(TASK_KEY, [])
  return saved.length ? saved.map(normalizeTask) : defaultTasks
}

function addRevisionCycles(records: RevisionRecord[], task: Task, startDate: string): RevisionRecord[] {
  const existingCycles = new Set(records.filter(record => record.taskId === task.id && !record.completed).map(record => record.cycle))
  return [
    ...records,
    ...([3, 7, 30] as const)
      .filter(cycle => !existingCycles.has(cycle))
      .map(cycle => ({
        id: uid(), userId: null, taskId: task.id, title: task.title,
        subject: task.subject, chapter: task.chapter, dueDate: shiftDate(startDate, cycle),
        cycle, revisionNumber: cycle === 3 ? 1 : cycle === 7 ? 2 : 3,
        reason: 'Scheduled spaced repetition review.',
        completed: false,
      })),
  ]
}

function revisionStageNumber(record: RevisionRecord) {
  return record.revisionNumber ?? (record.cycle === 3 ? 1 : record.cycle === 7 ? 2 : record.cycle === 30 ? 3 : 1)
}

const defaultProfile: Profile = {
  userId: null,
  stage: 'Dropper',
  stream: 'PCMB',
  exam: 'IAT 2027',
  examDate: '2027-05-25T09:00',
  planningStart: todayISO(),
}
const initialPageList: Page[] = ['Dashboard', 'Today’s Tasks', 'Weekly Planner', 'Syllabus', 'Exam Intelligence', 'Revision', 'Performance', 'Settings']
const examIntelligencePages: { page: Page; label: string; icon: string; status: 'Active' | 'In Progress' }[] = [
  { page: 'AI Exam Analyst', label: 'AI Exam Analyst', icon: '✧', status: 'Active' },
  { page: 'Exam Trend Explorer', label: 'Exam Trend Explorer', icon: '⌁', status: 'In Progress' },
  { page: 'Prerequisites', label: 'Prerequisites', icon: '↗', status: 'In Progress' },
  { page: 'Learning Paths', label: 'Learning Paths', icon: '⇢', status: 'In Progress' },
]
const icons: Record<Page, string> = {
  Dashboard: '⌂',
  'Today’s Tasks': '▤',
  'Weekly Planner': '▦',
  Syllabus: '▧',
  'Exam Intelligence': '✧',
  'AI Exam Analyst': '✧',
  'Exam Trend Explorer': '⌁',
  Prerequisites: '↗',
  'Learning Paths': '⇢',
  Revision: '↻',
  Performance: '⌁',
  Settings: '⚙',
}

function App() {
  const [tasks, setTasks] = useState<Task[]>(readTasks)
  const [logs, setLogs] = useState<StudyLog[]>(() => readJSON(LOG_KEY, []))
  const [revisions, setRevisions] = useState<RevisionRecord[]>(() => readJSON(REVISION_KEY, []))
  const [planned, setPlanned] = useState<PlannedTask[]>(() => readJSON(PLAN_KEY, []))
  const [streakDays, setStreakDays] = useState<string[]>(() => readJSON(STREAK_KEY, []))
  const [profile, setProfile] = useState<Profile>(() => ({ ...defaultProfile, ...readJSON(PROFILE_KEY, {}) }))
  const [settings, setSettings] = useState<{ [key: string]: unknown; dailyGoal: number; theme: 'light' | 'dark'; readingTone: number }>(() => {
    const savedSettings = readJSON<Record<string, unknown>>(SETTINGS_KEY, {})
    return {
      ...savedSettings,
      dailyGoal: DAILY_STREAK_GOAL,
      theme: savedSettings.theme === 'dark' ? 'dark' : 'light',
      readingTone: typeof savedSettings.readingTone === 'number'
        ? Math.min(100, Math.max(0, savedSettings.readingTone))
        : 0,
    }
  })
  const [dailyLogNotes, setDailyLogNotes] = useState<Record<string, DailyStudyLogNote>>(() => readJSON(DAILY_LOG_NOTE_KEY, {}))
  const [dailyLogPreview, setDailyLogPreview] = useState('')
  const [tasksView, setTasksView] = useState<'tasks' | 'daily-log'>('tasks')
  const [examDatabase, setExamDatabase] = useState<ExamIntelligenceDatabase>(() =>
    normalizeExamIntelligenceDatabase(readJSON<unknown>(EXAM_INTELLIGENCE_KEY, emptyExamIntelligenceDatabase())),
  )
  const [page, setPage] = useState<Page>('Dashboard')
  const [now, setNow] = useState(() => Date.now())
  const [timerSettingsExpanded, setTimerSettingsExpanded] = useState(false)
  const [timerSessionActive, setTimerSessionActive] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [dashboardTasksExpanded, setDashboardTasksExpanded] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [taskForm, setTaskForm] = useState({
    title: '', subject: 'Physics' as Subject, chapter: '', taskType: 'Concepts' as TaskType,
    priority: 'Medium' as Priority, deadline: '', status: 'Not Started' as TaskStatus,
    revision: false, estimateMinutes: '60', questionTarget: '0',
  })
  const [openTaskMenuId, setOpenTaskMenuId] = useState<string | null>(null)
  const [rescheduleTaskId, setRescheduleTaskId] = useState<string | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState(todayISO())
  const [timerMode, setTimerMode] = useState<'Focus' | 'Break'>('Focus')
  const [focusDuration, setFocusDuration] = useState(25)
  const [breakDuration, setBreakDuration] = useState(5)
  const [secondsLeft, setSecondsLeft] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const timerSessionRef = useRef({
    sessionId: null as string | null,
    startedAt: null as number | null,
    elapsedMs: 0,
    recordedSeconds: 0,
    durationMs: 0,
    mode: 'Focus' as 'Focus' | 'Break',
    subject: 'Physics' as Subject,
    chapter: '',
    taskId: '',
  })
  const [selectedSubject, setSelectedSubject] = useState<Subject>('Physics')
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [selectedChapter, setSelectedChapter] = useState('')
  const [manualMinutes, setManualMinutes] = useState('30')
  const [manualSubject, setManualSubject] = useState<Subject>('Physics')
  const [manualTaskId, setManualTaskId] = useState('')
  const [manualChapter, setManualChapter] = useState('')
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [planTaskId, setPlanTaskId] = useState('')
  const [planDate, setPlanDate] = useState(todayISO())
  const [selectedWeekDay, setSelectedWeekDay] = useState(todayISO())
  const [activityMonth, setActivityMonth] = useState(() => todayISO().slice(0, 7))
  const [revisionTaskId, setRevisionTaskId] = useState('')
  const [revisionStart, setRevisionStart] = useState(todayISO())
  const [reviewingRevisionId, setReviewingRevisionId] = useState<string | null>(null)
  const [revisionRecallRating, setRevisionRecallRating] = useState<'forgotten' | 'partial' | 'recalled'>('partial')
  const [revisionAttempted, setRevisionAttempted] = useState('0')
  const [revisionCorrect, setRevisionCorrect] = useState('0')
  const [reschedulingRevisionId, setReschedulingRevisionId] = useState<string | null>(null)
  const [revisionRescheduleDate, setRevisionRescheduleDate] = useState(todayISO())
  const [notice, setNotice] = useState('')
  const [evidenceDrafts, setEvidenceDrafts] = useState<Record<string, {
    syllabusStatus: ChapterEvidence['syllabusStatus']
    syllabusSource: string
    historicalCounts: string
    historicalSource: string
    prerequisites: string
    prerequisiteSource: string
  }>>({})

  useEffect(() => { localStorage.setItem(TASK_KEY, JSON.stringify(tasks)) }, [tasks])
  useEffect(() => { localStorage.setItem(LOG_KEY, JSON.stringify(logs)) }, [logs])
  useEffect(() => { localStorage.setItem(REVISION_KEY, JSON.stringify(revisions)) }, [revisions])
  useEffect(() => { localStorage.setItem(PLAN_KEY, JSON.stringify(planned)) }, [planned])
  useEffect(() => { localStorage.setItem(STREAK_KEY, JSON.stringify(streakDays)) }, [streakDays])
  useEffect(() => { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)) }, [profile])
  useEffect(() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, dailyGoal: DAILY_STREAK_GOAL })) }, [settings])
  useEffect(() => { localStorage.setItem(DAILY_LOG_NOTE_KEY, JSON.stringify(dailyLogNotes)) }, [dailyLogNotes])
  useEffect(() => { localStorage.setItem(EXAM_INTELLIGENCE_KEY, JSON.stringify(examDatabase)) }, [examDatabase])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const recordStudy = useCallback((
    minutes: number, subject: Subject, chapter: string, taskId: string, source: 'timer' | 'manual',
    session?: { id: string; seconds: number },
  ) => {
    const seconds = session?.seconds ?? Math.round(minutes * 60)
    if (!Number.isFinite(seconds) || seconds <= 0) return
    const date = todayISO()
    setLogs(previous => {
      const sessionId = session?.id
      const existing = sessionId ? previous.find(log => log.sessionId === sessionId) : undefined
      if (existing) {
        return previous.map(log => log.sessionId === sessionId ? {
          ...log,
          date,
          seconds: (log.seconds ?? Math.round(log.minutes * 60)) + seconds,
          minutes: ((log.seconds ?? Math.round(log.minutes * 60)) + seconds) / 60,
        } : log)
      }
      const log: StudyLog = {
        id: session?.id || uid(), userId: null, date, subject, chapter: chapter.trim(),
        taskId: taskId || null, minutes: seconds / 60, seconds, source,
        ...(session ? { sessionId: session.id } : {}),
      }
      return [...previous, log]
    })
    setStreakDays(previous => previous.includes(date) ? previous : [...previous, date])
    if (taskId) {
      setTasks(previous => previous.map(task => {
        if (task.id !== taskId) return task
        const status = task.status === 'Not Started' ? 'In Progress' : task.status
        const progress = status === 'In Progress' || status === 'Ongoing'
          ? Math.max(statusProgress[status], Math.min(99, Math.round((task.actualMinutes + seconds / 60) / Math.max(1, task.estimateMinutes) * 100)))
          : statusProgress[status]
        return {
          ...task,
          actualMinutes: task.actualMinutes + seconds / 60,
          status,
          done: status === 'Completed',
          progress,
        }
      }))
    }
  }, [])

  const flushTimerSession = useCallback(() => {
    const session = timerSessionRef.current
    if (session.mode !== 'Focus' || !session.sessionId) return
    const elapsedMs = session.elapsedMs + (session.startedAt === null ? 0 : Date.now() - session.startedAt)
    const elapsedSeconds = Math.floor(elapsedMs / 1000)
    const secondsToRecord = elapsedSeconds - session.recordedSeconds
    if (secondsToRecord > 0) {
      recordStudy(secondsToRecord / 60, session.subject, session.chapter, session.taskId, 'timer', {
        id: session.sessionId,
        seconds: secondsToRecord,
      })
      session.recordedSeconds = elapsedSeconds
    }
  }, [recordStudy])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      const session = timerSessionRef.current
      const elapsedMs = session.elapsedMs + (session.startedAt === null ? 0 : Date.now() - session.startedAt)
      const remainingMs = Math.max(0, session.durationMs - elapsedMs)
      setSecondsLeft(Math.ceil(remainingMs / 1000))
      setElapsedSeconds(Math.floor(elapsedMs / 1000))
      if (remainingMs === 0) {
        session.elapsedMs = session.durationMs
        session.startedAt = null
        flushTimerSession()
        session.sessionId = null
        session.elapsedMs = 0
        session.recordedSeconds = 0
        setElapsedSeconds(0)
        setTimerSessionActive(false)
        setRunning(false)
        setNotice(session.mode === 'Focus' ? 'Focus session saved.' : 'Break complete. Ready when you are.')
      }
    }
    const interval = window.setInterval(tick, 250)
    return () => window.clearInterval(interval)
  }, [running, flushTimerSession])

  const updateProfile = (field: keyof Profile, value: string) => {
    setProfile(previous => ({ ...previous, [field]: value }))
  }

  const updateTaskForm = (field: string, value: string | boolean) => {
    setTaskForm(previous => ({ ...previous, [field]: value }))
  }

  const resetTaskForm = () => {
    setTaskForm({ title: '', subject: 'Physics', chapter: '', taskType: 'Concepts', priority: 'Medium', deadline: '', status: 'Not Started', revision: false, estimateMinutes: '60', questionTarget: '0' })
    setEditingId(null)
    setShowForm(false)
  }

  const addOrUpdateTask = () => {
    if (!taskForm.title.trim() && !taskForm.chapter.trim()) {
      setNotice('Enter a topic or chapter name.')
      return
    }
    const existing = tasks.find(task => task.id === editingId)
    const done = taskForm.status === 'Completed'
    const updated: Task = {
      id: editingId || uid(),
      userId: existing?.userId ?? null,
      title: taskForm.title.trim() || taskForm.chapter.trim(),
      topic: taskForm.title.trim(),
      subject: taskForm.subject,
      chapter: taskForm.chapter.trim(),
      taskType: taskForm.taskType,
      questionTarget: Math.max(0, Math.round(safeNumber(taskForm.questionTarget, 0))),
      questionsCompleted: Math.min(existing?.questionsCompleted ?? 0, Math.max(0, Math.round(safeNumber(taskForm.questionTarget, 0)))),
      checkpoints: existing?.checkpoints ?? emptyTaskCheckpoints(),
      status: taskForm.status,
      priority: taskForm.priority,
      deadline: taskForm.deadline,
      estimateMinutes: Math.max(1, safeNumber(taskForm.estimateMinutes, existing?.estimateMinutes ?? 60)),
      actualMinutes: existing?.actualMinutes ?? 0,
      progress: statusProgress[taskForm.status],
      done,
      revision: taskForm.revision,
      createdAt: existing?.createdAt || todayISO(),
      completedAt: done ? (existing?.completedAt || todayISO()) : undefined,
    }
    setTasks(previous => editingId ? previous.map(t => t.id === editingId ? updated : t) : [updated, ...previous])
    setShowForm(false)
    setEditingId(null)
    setNotice(editingId ? 'Task updated.' : 'Task added.')
    if (taskForm.revision) {
      setRevisions(previous => addRevisionCycles(previous, updated, todayISO()))
    }
    setTaskForm({ title: '', subject: 'Physics', chapter: '', taskType: 'Concepts', priority: 'Medium', deadline: '', status: 'Not Started', revision: false, estimateMinutes: '60', questionTarget: '0' })
  }

  const editTask = (task: Task) => {
    setTaskForm({
      title: task.topic, subject: task.subject, chapter: task.chapter, taskType: task.taskType,
      priority: task.priority, deadline: task.deadline, status: task.status, revision: task.revision,
      estimateMinutes: String(task.estimateMinutes), questionTarget: String(task.questionTarget),
    })
    setEditingId(task.id)
    setShowForm(true)
    setPage('Today’s Tasks')
  }

  const toggleTask = (id: string) => {
    setTasks(previous => previous.map(task => {
      if (task.id !== id) return task
      const status: TaskStatus = task.status === 'Completed' ? 'In Progress' : 'Completed'
      const done = status === 'Completed'
      return { ...task, status, done, progress: statusProgress[status], completedAt: done ? todayISO() : undefined }
    }))
  }

  const toggleTaskCheckpoint = (id: string, checkpoint: TaskCheckpointKey) => {
    setTasks(previous => previous.map(task => task.id === id
      ? { ...task, checkpoints: { ...task.checkpoints, [checkpoint]: !task.checkpoints[checkpoint] } }
      : task))
  }

  const updateQuestionCount = (task: Task, increment: boolean) => {
    setTasks(previous => previous.map(item => item.id === task.id
      ? { ...item, questionsCompleted: Math.max(0, Math.min(item.questionTarget, item.questionsCompleted + (increment ? 1 : -1))) }
      : item))
  }

  const duplicateTask = (task: Task) => {
    const copy: Task = {
      ...task,
      id: uid(),
      title: task.title,
      status: 'Not Started',
      done: false,
      progress: 0,
      actualMinutes: 0,
      questionsCompleted: 0,
      checkpoints: emptyTaskCheckpoints(),
      createdAt: todayISO(),
      completedAt: undefined,
    }
    setTasks(previous => [copy, ...previous])
    setOpenTaskMenuId(null)
    setNotice('Task duplicated.')
  }

  const rescheduleTask = (task: Task) => {
    if (!rescheduleDate) {
      setNotice('Choose a date to reschedule this task.')
      return
    }
    setTasks(previous => previous.map(item => item.id === task.id ? { ...item, deadline: rescheduleDate } : item))
    setOpenTaskMenuId(null)
    setRescheduleTaskId(null)
    setNotice(`Task rescheduled for ${formatDate(rescheduleDate)}.`)
  }

  const getTaskProgress = (task: Task) => {
    if (task.status === 'Completed') return 100
    const checkpointProgress = taskCheckpointLabels.reduce((count, checkpoint) => count + Number(task.checkpoints[checkpoint.key]), 0) / taskCheckpointLabels.length
    const questionProgress = task.questionTarget ? task.questionsCompleted / task.questionTarget : null
    const progress = questionProgress === null
      ? checkpointProgress
      : (checkpointProgress + questionProgress) / 2
    return Math.round(progress * 100)
  }

  const toggleRevisionFlag = (id: string) => {
    const task = tasks.find(t => t.id === id)
    if (!task) return
    const flag = !task.revision
    setTasks(previous => previous.map(t => t.id === id ? { ...t, revision: flag } : t))
    if (flag) {
      setRevisions(previous => addRevisionCycles(previous, task, todayISO()))
    }
  }

  const deleteTask = (id: string) => {
    setTasks(previous => previous.filter(task => task.id !== id))
    setPlanned(previous => previous.filter(item => item.taskId !== id))
    setNotice('Task deleted.')
  }

  const recordManualTime = () => {
    const mins = safeNumber(manualMinutes, 0)
    if (mins <= 0) {
      setNotice('Enter a study duration greater than zero.')
      return
    }
    const task = tasks.find(t => t.id === manualTaskId)
    recordStudy(mins, manualSubject, manualChapter || task?.chapter || '', manualTaskId, 'manual')
    setManualMinutes('30')
    setNotice(`${formatMinutes(mins)} of study time logged.`)
  }

  const startTimer = (task?: Task) => {
    const session = timerSessionRef.current
    const switchingTask = Boolean(task && timerSessionActive && session.taskId !== task.id)
    if (running && !switchingTask) return
    const mode = task ? 'Focus' : timerMode
    const duration = mode === 'Focus' ? focusDuration : breakDuration
    if (task) {
      setTimerMode('Focus')
      setSelectedSubject(task.subject)
      setSelectedTaskId(task.id)
      setSelectedChapter(task.chapter)
    }
    if (switchingTask && task) {
      if (session.startedAt !== null) {
        session.elapsedMs += now - session.startedAt
        session.startedAt = null
      }
      flushTimerSession()
      session.sessionId = uid()
      session.elapsedMs = 0
      session.recordedSeconds = 0
      session.durationMs = duration * 60_000
      session.mode = mode
      session.subject = task.subject
      session.chapter = task.chapter
      session.taskId = task.id
      setElapsedSeconds(0)
    } else if (!timerSessionActive) {
      session.sessionId = mode === 'Focus' ? uid() : null
      session.elapsedMs = 0
      session.recordedSeconds = 0
      session.durationMs = duration * 60_000
      session.mode = mode
      session.subject = task?.subject ?? selectedSubject
      session.chapter = task?.chapter ?? selectedChapter
      session.taskId = task?.id ?? selectedTaskId
      setTimerSessionActive(true)
    }
    if (secondsLeft <= 0 || switchingTask) setSecondsLeft(duration * 60)
    session.startedAt = now
    setRunning(true)
    setTimerSessionActive(true)
    setNotice('')
  }
  const pauseTimer = () => {
    const session = timerSessionRef.current
    if (session.startedAt !== null) {
      session.elapsedMs += Date.now() - session.startedAt
      session.startedAt = null
    }
    setElapsedSeconds(Math.floor(session.elapsedMs / 1000))
    setRunning(false)
  }
  const saveTimer = () => {
    const session = timerSessionRef.current
    if (session.startedAt !== null) {
      session.elapsedMs += Date.now() - session.startedAt
      session.startedAt = null
    }
    const seconds = Math.floor(session.elapsedMs / 1000)
    flushTimerSession()
    session.sessionId = null
    session.elapsedMs = 0
    session.recordedSeconds = 0
    setRunning(false)
    setTimerSessionActive(false)
    setElapsedSeconds(0)
    setSecondsLeft((timerMode === 'Focus' ? focusDuration : breakDuration) * 60)
    if (timerMode === 'Focus' && seconds > 0) {
      setNotice(`${formatMinutes(seconds / 60)} added to study time.`)
    } else if (seconds > 0) {
      setNotice('Break session saved.')
    } else {
      setNotice('No time to save yet.')
    }
  }
  const resetTimer = () => {
    const session = timerSessionRef.current
    if (session.startedAt !== null) {
      session.elapsedMs += Date.now() - session.startedAt
      session.startedAt = null
    }
    flushTimerSession()
    session.sessionId = null
    session.elapsedMs = 0
    session.recordedSeconds = 0
    setRunning(false)
    setTimerSessionActive(false)
    setElapsedSeconds(0)
    setSecondsLeft((timerMode === 'Focus' ? focusDuration : breakDuration) * 60)
  }
  const switchTimerMode = (mode: 'Focus' | 'Break') => {
    resetTimer()
    setRunning(false)
    setTimerMode(mode)
    setSecondsLeft((mode === 'Focus' ? focusDuration : breakDuration) * 60)
  }
  const changeDuration = (mins: number) => {
    if (timerMode === 'Focus') setFocusDuration(mins)
    else setBreakDuration(mins)
    if (!running) setSecondsLeft(mins * 60)
  }

  const addPlannedTask = () => {
    if (!planTaskId || !planDate) return
    if (planned.some(item => item.taskId === planTaskId && item.date === planDate)) {
      setNotice('That task is already planned for this day.')
      return
    }
    setPlanned(previous => [...previous, { id: uid(), userId: null, taskId: planTaskId, date: planDate }])
    setNotice('Task added to your weekly plan.')
  }

  const addRevisionSchedule = () => {
    const task = tasks.find(t => t.id === revisionTaskId)
    if (!task) return
    if (revisions.some(record => record.taskId === task.id && !record.completed)) {
      setNotice('This task already has an active revision schedule.')
      return
    }
    const revisionTask = { ...task, taskType: 'Revision' as TaskType, revision: true }
    setRevisions(previous => addRevisionCycles(previous, revisionTask, revisionStart))
    setTasks(previous => previous.map(t => t.id === task.id ? revisionTask : t))
    setNotice('Revision schedule added to this task.')
  }

  const openRevisionReview = (record: RevisionRecord) => {
    setReviewingRevisionId(record.id)
    setRevisionRecallRating('partial')
    setRevisionAttempted('0')
    setRevisionCorrect('0')
  }

  const saveRevisionReview = (record: RevisionRecord) => {
    const attempted = safeNumber(revisionAttempted, -1)
    const correct = safeNumber(revisionCorrect, -1)
    if (!Number.isInteger(attempted) || attempted < 0 || !Number.isInteger(correct) || correct < 0 || correct > attempted) {
      setNotice('Enter valid question counts; correct answers cannot exceed attempted questions.')
      return
    }
    const accuracy = attempted > 0 ? correct / attempted : null
    const interval = revisionRecallRating === 'forgotten' || (accuracy !== null && accuracy < 0.6)
      ? 1
      : revisionRecallRating === 'partial' && (accuracy === null || accuracy < 0.8)
        ? 3
        : revisionRecallRating === 'recalled' && (accuracy === null || accuracy >= 0.85)
          ? 30
          : 7
    const task = tasks.find(item => item.id === record.taskId)
    const revisionNumber = (record.revisionNumber ?? (record.cycle === 3 ? 1 : record.cycle === 7 ? 2 : 3)) + 1
    const nextRevision: RevisionRecord = {
      id: uid(),
      userId: record.userId,
      taskId: record.taskId,
      title: task?.title || record.title,
      subject: task?.subject || record.subject,
      chapter: task?.chapter || record.chapter,
      dueDate: shiftDate(todayISO(), interval),
      cycle: interval,
      revisionNumber,
      reason: `Previous review: ${revisionRecallRating}${accuracy === null ? '' : `; question accuracy ${Math.round(accuracy * 100)}%`}.`,
      lastRevisedAt: todayISO(),
      recallRating: revisionRecallRating,
      attemptedQuestions: attempted,
      correctQuestions: correct,
      completed: false,
    }
    setRevisions(previous => [
      ...previous.map(item => item.taskId === record.taskId
        ? item.completed ? item : { ...item, completed: true, completedAt: todayISO() }
        : item),
      nextRevision,
    ])
    if (task) {
      setTasks(previous => previous.map(item => item.id === task.id ? {
        ...item,
        taskType: 'Revision',
        revision: true,
        status: item.status === 'Completed' ? item.status : 'Ongoing',
        done: item.status === 'Completed',
        progress: item.status === 'Completed' ? 100 : Math.max(item.progress, 70),
        questionsCompleted: Math.min(item.questionTarget, item.questionsCompleted + attempted),
      } : item))
    }
    setReviewingRevisionId(null)
    setNotice(`Review saved. Next revision is scheduled in ${interval} day${interval === 1 ? '' : 's'} (R${revisionNumber}).`)
  }

  const rescheduleRevision = (record: RevisionRecord) => {
    if (!revisionRescheduleDate || revisionRescheduleDate < todayISO()) {
      setNotice('Choose today or a future date for this revision.')
      return
    }
    setRevisions(previous => previous.map(item => item.id === record.id ? { ...item, dueDate: revisionRescheduleDate } : item))
    setReschedulingRevisionId(null)
    setNotice(`Revision moved to ${formatDate(revisionRescheduleDate)}.`)
  }

  const startRevision = (record: RevisionRecord) => {
    const task = tasks.find(item => item.id === record.taskId)
    if (!task) {
      setNotice('The linked task could not be found. Recreate it in Today’s Tasks before starting this revision.')
      return
    }
    const revisionTask = { ...task, taskType: 'Revision' as TaskType, revision: true, status: task.status === 'Not Started' ? 'In Progress' as TaskStatus : task.status }
    setTasks(previous => previous.map(item => item.id === task.id ? revisionTask : item))
    setPage('Dashboard')
    startTimer(revisionTask)
  }

  const saveChapterEvidence = (task: Task, key: string) => {
    const draft = evidenceDrafts[key]
    if (!draft) return
    const historicalCounts = parseHistoricalCounts(draft.historicalCounts)
    if (historicalCounts === null) {
      setNotice('Historical counts must use unique year:count entries, such as 2024:2, 2025:1.')
      return
    }
    const evidence: ChapterEvidence = {
      syllabusStatus: draft.syllabusStatus,
      syllabusSource: draft.syllabusSource.trim(),
      historicalCounts,
      historicalSource: draft.historicalSource.trim(),
      prerequisites: draft.prerequisites.split(',').map(item => item.trim()).filter(Boolean),
      prerequisiteSource: draft.prerequisiteSource.trim(),
    }
    setExamDatabase(previous => ({
      ...previous,
      chapterEvidence: { ...previous.chapterEvidence, [key]: evidence },
    }))
    setNotice(`Evidence record updated for ${task.chapter || task.title}.`)
  }

  const movePlanToTomorrow = (planId: string) => {
    setPlanned(previous => previous.map(item => item.id === planId ? { ...item, date: shiftDate(todayISO(), 1) } : item))
    setNotice('The selected lower-priority plan was moved to tomorrow.')
  }

  const today = todayISO()
  const dailyLogNote = dailyLogNotes[today] || { tagline: '', reflection: '' }
  const studyMinutesByDate = new Map<string, number>()
  logs.forEach(log => studyMinutesByDate.set(log.date, (studyMinutesByDate.get(log.date) || 0) + studyMinutes(log)))
  const todayMinutes = studyMinutesByDate.get(today) || 0
  const totalMinutes = logs.reduce((sum, log) => sum + studyMinutes(log), 0)
  const todayLogs = logs.filter(log => log.date === today)
  const dailySubjectMinutes = subjects.map(subject => ({
    subject,
    minutes: todayLogs.filter(log => log.subject === subject).reduce((sum, log) => sum + studyMinutes(log), 0),
  })).filter(item => item.minutes > 0)
  const todayCompletedTasks = tasks.filter(task => task.status === 'Completed' && task.completedAt?.slice(0, 10) === today)
  const dailyTaskMap = new Map<string, Task>()
  tasks.filter(task => task.status !== 'Cancelled' && task.createdAt.slice(0, 10) === today)
    .forEach(task => dailyTaskMap.set(task.id, task))
  planned.filter(item => item.date === today).forEach(item => {
    const task = tasks.find(candidate => candidate.id === item.taskId)
    if (task && task.status !== 'Cancelled') dailyTaskMap.set(task.id, task)
  })
  todayCompletedTasks.forEach(task => dailyTaskMap.set(task.id, task))
  const dailyTasks = [...dailyTaskMap.values()]
  const dailyCompletedCount = dailyTasks.filter(task =>
    task.status === 'Completed' && task.completedAt?.slice(0, 10) === today,
  ).length
  const dailyCompletionPercent = dailyTasks.length ? Math.round(dailyCompletedCount / dailyTasks.length * 100) : 0
  const dailyChapters = [...new Set([
    ...todayLogs.map(log => log.chapter.trim()).filter(Boolean),
    ...todayCompletedTasks.map(task => task.chapter.trim()).filter(Boolean),
  ])]
  const todayAssessments = examDatabase.assessments.filter(item => item.date === today)
  const assessmentTaskIds = new Set(todayAssessments.map(item => item.taskId).filter(Boolean))
  const todayRevisionQuestionRecords = revisions.filter(record =>
    record.completed && record.completedAt?.slice(0, 10) === today &&
    record.attemptedQuestions !== undefined &&
    !assessmentTaskIds.has(record.taskId),
  )
  const hasDailyQuestionData = todayAssessments.length > 0 || todayRevisionQuestionRecords.length > 0
  const dailyQuestionsAttempted = hasDailyQuestionData
    ? todayAssessments.reduce((sum, item) => sum + item.attempted, 0) +
      todayRevisionQuestionRecords.reduce((sum, item) => sum + (item.attemptedQuestions || 0), 0)
    : null
  const dailyQuestionsCorrect = hasDailyQuestionData
    ? todayAssessments.reduce((sum, item) => sum + item.correct, 0) +
      todayRevisionQuestionRecords.reduce((sum, item) => sum + (item.correctQuestions || 0), 0)
    : null
  const planningStartTime = new Date(`${profile.planningStart}T12:00:00`).getTime()
  const todayTime = new Date(`${today}T12:00:00`).getTime()
  const dailyNumber = Number.isFinite(planningStartTime) && planningStartTime <= todayTime
    ? Math.floor((todayTime - planningStartTime) / 86400000) + 1
    : null
  const dailyAchievements = [
    ...(todayMinutes >= DAILY_STREAK_GOAL ? [`Reached the ${DAILY_STREAK_GOAL}-minute study goal`] : []),
    ...(dailyCompletedCount > 0 ? [`Completed ${dailyCompletedCount} ${dailyCompletedCount === 1 ? 'task' : 'tasks'}`] : []),
    ...(dailyQuestionsAttempted !== null && dailyQuestionsAttempted > 0 ? [`Attempted ${dailyQuestionsAttempted} practice questions`] : []),
    ...(dailyTasks.length > 0 && dailyCompletedCount === dailyTasks.length ? ['Completed every planned task'] : []),
  ]
  const completedTasks = tasks.filter(task => task.status === 'Completed').length
  const activeTasks = tasks.filter(task => task.status !== 'Completed' && task.status !== 'Cancelled')
  const actualMinutesByTask = new Map<string, number>()
  logs.forEach(log => {
    if (log.taskId) actualMinutesByTask.set(log.taskId, (actualMinutesByTask.get(log.taskId) || 0) + studyMinutes(log))
  })
  const getTaskActualMinutes = (task: Task) => Math.max(task.actualMinutes, actualMinutesByTask.get(task.id) || 0)
  const plannedTaskMinutes = tasks.filter(task => task.status !== 'Cancelled').reduce((sum, task) => sum + task.estimateMinutes, 0)
  const actualTaskMinutes = tasks.filter(task => task.status !== 'Cancelled').reduce((sum, task) => sum + getTaskActualMinutes(task), 0)
  const activeRevisionsByTask = new Map<string, RevisionRecord>()
  revisions.filter(record => !record.completed)
    .sort((a, b) => revisionStageNumber(a) - revisionStageNumber(b) || a.dueDate.localeCompare(b.dueDate))
    .forEach(record => {
      if (!activeRevisionsByTask.has(record.taskId)) activeRevisionsByTask.set(record.taskId, record)
    })
  const currentRevisions = [...activeRevisionsByTask.values()]
  const revisionAccuracy = (record: RevisionRecord) => record.attemptedQuestions && record.attemptedQuestions > 0
    ? (record.correctQuestions || 0) / record.attemptedQuestions
    : null
  const isWeakRevision = (record: RevisionRecord) => {
    const accuracy = revisionAccuracy(record)
    return record.recallRating === 'forgotten' || record.recallRating === 'partial' || (accuracy !== null && accuracy < 0.7)
  }
  const isMasteredRevision = (record: RevisionRecord) => {
    const accuracy = revisionAccuracy(record)
    return record.recallRating === 'recalled' && (accuracy === null || accuracy >= 0.85)
  }
  const overdueRevisions = currentRevisions.filter(record => record.dueDate < today)
  const dueRevisions = currentRevisions.filter(record => record.dueDate === today)
  const weakRevisions = currentRevisions.filter(record => record.dueDate > today && isWeakRevision(record))
  const upcomingRevisions = currentRevisions.filter(record => record.dueDate > today && !isWeakRevision(record) && !isMasteredRevision(record))
  const masteredRevisions = currentRevisions.filter(record => record.dueDate > today && isMasteredRevision(record))
  const taskForTimer = tasks.find(t => t.id === selectedTaskId)
  const quoteIndex = Math.floor(Math.max(0, now) / (12 * 60 * 60 * 1000)) % quotes.length
  const currentQuote = quotes[quoteIndex]
  const examRemainingSeconds = Math.max(0, Math.floor((new Date(profile.examDate).getTime() - now) / 1000))
  const examDays = Math.floor(examRemainingSeconds / 86400)
  const examHours = Math.floor((examRemainingSeconds % 86400) / 3600)
  const examMinutes = Math.floor((examRemainingSeconds % 3600) / 60)
  const examSeconds = examRemainingSeconds % 60
  const streakSet = new Set([...studyMinutesByDate].filter(([, minutes]) => minutes >= DAILY_STREAK_GOAL).map(([date]) => date))
  let currentStreak = 0
  let cursor = streakSet.has(today) ? today : shiftDate(today, -1)
  while (streakSet.has(cursor)) {
    currentStreak += 1
    cursor = shiftDate(cursor, -1)
  }
  const sortedStreakDays = [...streakSet].sort()
  let longestStreak = 0
  let run = 0
  let previousDate = ''
  sortedStreakDays.forEach(date => {
    run = previousDate && shiftDate(previousDate, 1) === date ? run + 1 : 1
    longestStreak = Math.max(longestStreak, run)
    previousDate = date
  })

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => shiftDate(weekStart, i)), [weekStart])
  const subjectMinutes = subjects.map(subject => ({
    subject, minutes: logs.filter(log => log.subject === subject).reduce((sum, log) => sum + studyMinutes(log), 0),
  }))
  const maxSubjectMinutes = Math.max(1, ...subjectMinutes.map(item => item.minutes))
  const dailyMinutes = weekDays.map(date => ({
    date, minutes: studyMinutesByDate.get(date) || 0,
  }))
  const weekMinutes = dailyMinutes.reduce((sum, item) => sum + item.minutes, 0)
  const maxDailyMinutes = Math.max(1, ...dailyMinutes.map(item => item.minutes))
  const weekTaskCount = planned.filter(item => item.date >= weekStart && item.date <= shiftDate(weekStart, 6)).length
  const weekDoneCount = planned.filter(item => item.date >= weekStart && item.date <= shiftDate(weekStart, 6) && tasks.find(t => t.id === item.taskId)?.status === 'Completed').length
  const weekProgress = weekTaskCount ? Math.round(weekDoneCount / weekTaskCount * 100) : 0
  const completionRate = tasks.length ? Math.round(completedTasks / tasks.length * 100) : 0
  const [monthYear, monthNumber] = activityMonth.split('-').map(Number)
  const monthStartDate = `${activityMonth}-01`
  const monthDayCount = new Date(monthYear, monthNumber, 0).getDate()
  const monthLeadingDays = new Date(monthYear, monthNumber - 1, 1).getDay()
  const activityDays = Array.from(
    { length: Math.ceil((monthLeadingDays + monthDayCount) / 7) * 7 },
    (_, index) => {
      const dayOffset = index - monthLeadingDays
      if (dayOffset < 0 || dayOffset >= monthDayCount) return null
      const date = shiftDate(monthStartDate, dayOffset)
      const minutes = studyMinutesByDate.get(date) || 0
      const level = minutes === 0 ? 0
        : minutes < DAILY_STREAK_GOAL * 0.25 ? 1
          : minutes < DAILY_STREAK_GOAL * 0.5 ? 2
            : minutes < DAILY_STREAK_GOAL ? 3 : 4
      return { date, minutes, level }
    },
  )
  const monthActivityDays = activityDays.filter((day): day is NonNullable<typeof day> => day !== null)
  const monthActiveDays = monthActivityDays.filter(day => day.minutes > 0).length
  const monthTotalMinutes = monthActivityDays.reduce((sum, day) => sum + day.minutes, 0)
  const selectedDayTasks = planned.filter(item => item.date === selectedWeekDay)
  const selectedDayMinutes = studyMinutesByDate.get(selectedWeekDay) || 0
  const activityMonthLabel = new Date(`${monthStartDate}T12:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const statusCounts = taskStatuses.map(status => ({
    status,
    count: tasks.filter(task => task.status === status).length,
  }))
  const intelligenceChapters = Array.from(
    tasks.reduce((chapters, task) => {
      const name = task.chapter || task.title
      const key = chapterKey(task.subject, name)
      const existing = chapters.get(key)
      if (existing) existing.tasks.push(task)
      else chapters.set(key, { key, subject: task.subject, chapter: name, tasks: [task] })
      return chapters
    }, new Map<string, { key: string; subject: Subject; chapter: string; tasks: Task[] }>()).values(),
  ).sort((a, b) => subjects.indexOf(a.subject) - subjects.indexOf(b.subject) || a.chapter.localeCompare(b.chapter))
  const chapterIntelligence = intelligenceChapters.map(chapter => {
    const matchingAssessments = examDatabase.assessments.filter(item =>
      item.subject === chapter.subject && item.chapter.toLocaleLowerCase() === chapter.chapter.toLocaleLowerCase(),
    )
    const attempted = matchingAssessments.reduce((sum, item) => sum + item.attempted, 0)
    const correct = matchingAssessments.reduce((sum, item) => sum + item.correct, 0)
    const evidence = examDatabase.chapterEvidence[chapter.key] || emptyChapterEvidence()
    const historicalConfidence = !evidence.historicalCounts.length
      ? 'Unavailable'
      : 'Low · manual counts; source not checked'
    return { ...chapter, assessments: matchingAssessments, attempted, correct, accuracy: attempted ? correct / attempted : null, evidence, historicalConfidence }
  })
  const nextBestTask = activeTasks
    .map(task => {
      const chapter = task.chapter || task.title
      const accuracyRecords = examDatabase.assessments.filter(item =>
        item.subject === task.subject && item.chapter.toLocaleLowerCase() === chapter.toLocaleLowerCase(),
      )
      const attempted = accuracyRecords.reduce((sum, item) => sum + item.attempted, 0)
      const correct = accuracyRecords.reduce((sum, item) => sum + item.correct, 0)
      const accuracy = attempted ? correct / attempted : null
      const dueRevision = revisions.some(item => item.taskId === task.id && !item.completed && item.dueDate <= today)
      const overdue = Boolean(task.deadline && task.deadline < today)
      const dueToday = task.deadline === today
      const score = (task.priority === 'High' ? 30 : task.priority === 'Medium' ? 15 : 0)
        + (task.revision || dueRevision ? 25 : 0)
        + (accuracy !== null && accuracy < 0.6 ? 25 : 0)
        + (overdue ? 20 : dueToday ? 12 : 0)
        + (task.status === 'Not Started' ? 8 : 0)
      const reasons = [
        accuracy !== null && accuracy < 0.6 ? `Your recorded practice accuracy is ${Math.round(accuracy * 100)}% (${correct}/${attempted}); focused practice may help.` : '',
        dueRevision ? 'A spaced-revision reminder is due.' : task.revision ? 'You marked this task for revision.' : '',
        overdue ? `Its tracker deadline was ${formatDate(task.deadline)}.` : dueToday ? 'Its tracker deadline is today.' : '',
        task.priority === 'High' ? 'It is marked high priority in your task tracker.' : '',
      ].filter(Boolean)
      const why = reasons[0] || `This unfinished ${task.status.toLowerCase()} task is part of your current study plan; no stronger personal signal is recorded.`
      const remaining = Math.max(0, Math.round(task.estimateMinutes * (1 - Math.min(100, Math.max(0, task.progress)) / 100)))
      return { task, chapter, score, reasons, why, accuracy, attempted, correct, estimatedMinutes: remaining || task.estimateMinutes }
    })
    .sort((a, b) => b.score - a.score || a.task.deadline.localeCompare(b.task.deadline) || a.task.createdAt.localeCompare(b.task.createdAt))[0]
  const todayPlanRows = planned.filter(item => item.date === today)
    .map(plan => ({ plan, task: tasks.find(task => task.id === plan.taskId) }))
    .filter((item): item is { plan: PlannedTask; task: Task } => Boolean(item.task && item.task.status !== 'Completed' && item.task.status !== 'Cancelled'))
  const recommendationAlreadyPlanned = Boolean(nextBestTask && todayPlanRows.some(item => item.task.id === nextBestTask.task.id))
  const recommendedWorkload = todayPlanRows.reduce((sum, item) => sum + Math.max(0, Math.round(item.task.estimateMinutes * (1 - Math.min(100, Math.max(0, item.task.progress)) / 100))), 0)
    + (nextBestTask && !recommendationAlreadyPlanned ? nextBestTask.estimatedMinutes : 0)
  const availableMinutesRemaining = Math.max(0, examDatabase.availableMinutesPerDay - todayMinutes)
  const workloadOverBy = Math.max(0, recommendedWorkload - availableMinutesRemaining)
  const rescheduleSuggestions = todayPlanRows
    .filter(item => item.task.priority !== 'High' && item.task.id !== nextBestTask?.task.id)
    .sort((a, b) => priorities.indexOf(b.task.priority) - priorities.indexOf(a.task.priority))[0]

  const changeExam = (name: string) => {
    const exam = examOptions.find(item => item.name === name)
    if (exam) setProfile(previous => ({ ...previous, exam: exam.name, examDate: exam.date }))
  }

  const taskList = (list: Task[], showFocusAction = false, smartCards = false) => list.length ? (
    <div className={`task-list${smartCards ? ' task-card-list' : ''}`}>
      {list.map(task => smartCards ? (
        <article className={`smart-task-card ${task.status === 'Completed' ? 'task-done' : ''}`} key={task.id}>
          <div className="smart-task-heading">
            <button className={`task-check ${task.status === 'Completed' ? 'checked' : ''}`} onClick={() => toggleTask(task.id)} aria-label={task.status === 'Completed' ? 'Mark incomplete' : 'Mark complete'}>
              {task.status === 'Completed' ? '✓' : ''}
            </button>
            <div className="smart-task-title">
              <strong>{task.topic || task.chapter || task.title}</strong>
              {task.topic && task.chapter && task.topic !== task.chapter && <span>{task.chapter}</span>}
              <span className={`task-status status-${task.status.toLowerCase().replaceAll(' ', '-')}`}>{task.status}</span>
            </div>
            <span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
          </div>
          <div className="smart-task-metadata">
            <span>{task.subject}</span><span>{task.taskType}</span>
            {task.deadline && <span>Due {formatDate(task.deadline)}</span>}
            {task.revision && <span className="tag tag-purple">Revision</span>}
          </div>
          <div className="smart-task-metrics">
            <span>Estimated <strong>{formatMinutes(task.estimateMinutes)}</strong></span>
            <span>Studied <strong>{formatMinutes(getTaskActualMinutes(task))}</strong></span>
            <span className="question-metric">Questions <strong>{task.questionsCompleted}/{task.questionTarget}</strong>
              {task.questionTarget > 0 && <span className="question-actions">
                <button type="button" onClick={() => updateQuestionCount(task, false)} disabled={task.questionsCompleted === 0} aria-label={`Remove one completed question from ${task.topic || task.chapter || task.title}`}>−</button>
                <button type="button" onClick={() => updateQuestionCount(task, true)} disabled={task.questionsCompleted >= task.questionTarget} aria-label={`Add one completed question to ${task.topic || task.chapter || task.title}`}>+</button>
              </span>}
            </span>
          </div>
          <div className="smart-task-progress">
            <div><span>Progress</span><strong>{getTaskProgress(task)}%</strong></div>
            <div className="progress-track"><span style={{ width: `${getTaskProgress(task)}%` }} /></div>
          </div>
          <div className="smart-task-checkpoints">
            {taskCheckpointLabels.map(checkpoint => (
              <label key={checkpoint.key}>
                <input type="checkbox" checked={task.checkpoints[checkpoint.key]} onChange={() => toggleTaskCheckpoint(task.id, checkpoint.key)} />
                <span>{checkpoint.label}</span>
              </label>
            ))}
          </div>
          <div className="smart-task-actions">
            <button type="button" className="button button-ghost" onClick={() => { setPage('Dashboard'); startTimer(task) }} disabled={timerSessionActive && selectedTaskId === task.id && running}>
              {timerSessionActive && selectedTaskId === task.id ? running ? 'Studying' : '▶ Resume study' : timerSessionActive ? '▶ Switch to task' : '▶ Start study'}
            </button>
            <button type="button" className="icon-button" onClick={() => editTask(task)} aria-label={`Edit ${task.topic || task.chapter || task.title}`} title="Edit task">✎</button>
            <div className="task-overflow">
              <button type="button" className="icon-button" onClick={() => { setOpenTaskMenuId(openTaskMenuId === task.id ? null : task.id); setRescheduleTaskId(null) }} aria-label={`More actions for ${task.topic || task.chapter || task.title}`} aria-expanded={openTaskMenuId === task.id}>⋯</button>
              {openTaskMenuId === task.id && <div className="task-overflow-menu">
                {rescheduleTaskId === task.id ? <div className="task-reschedule-form">
                  <label className="field">Reschedule to<input type="date" value={rescheduleDate} onChange={event => setRescheduleDate(event.target.value)} /></label>
                  <button type="button" className="button button-primary" onClick={() => rescheduleTask(task)}>Save date</button>
                </div> : <button type="button" onClick={() => { setRescheduleDate(task.deadline || today); setRescheduleTaskId(task.id) }}>Reschedule</button>}
                <button type="button" onClick={() => duplicateTask(task)}>Duplicate</button>
                <button type="button" className="danger-text" onClick={() => { deleteTask(task.id); setOpenTaskMenuId(null) }}>Delete</button>
              </div>}
            </div>
          </div>
        </article>
      ) : (
        <article className={`task-row ${task.status === 'Completed' ? 'task-done' : ''}`} key={task.id}>
          <button className={`task-check ${task.status === 'Completed' ? 'checked' : ''}`} onClick={() => toggleTask(task.id)} aria-label={task.status === 'Completed' ? 'Mark incomplete' : 'Mark complete'}>
            {task.status === 'Completed' ? '✓' : ''}
          </button>
          <div className="task-main">
            <div className="task-title-line">
              <strong>{task.title}</strong>
              <span className={`task-status status-${task.status.toLowerCase().replaceAll(' ', '-')}`}>{task.status}</span>
              {task.revision && <span className="tag tag-purple">Revision</span>}
            </div>
            <p>{task.subject} · {task.chapter || 'No chapter'} · {task.deadline ? `Due ${formatDate(task.deadline)}` : 'No deadline'}</p>
            <div className="progress-track"><span style={{ width: `${task.status === 'Completed' ? 100 : Math.min(100, getTaskActualMinutes(task) / Math.max(1, task.estimateMinutes) * 100)}%` }} /></div>
            <div className="task-meta"><span>Planned {formatMinutes(task.estimateMinutes)}</span><span>Actual {formatMinutes(getTaskActualMinutes(task))}</span></div>
          </div>
          <span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
          <div className="task-actions">
            <button className="icon-button" onClick={() => editTask(task)} title="Edit task">✎</button>
            <button className="icon-button" onClick={() => toggleRevisionFlag(task.id)} title="Toggle revision">↻</button>
            {showFocusAction && <button className="icon-button" onClick={() => { setPage('Dashboard'); startTimer(task) }} title={`Start focus on ${task.title}`} aria-label={`Start focus on ${task.title}`}>▶</button>}
            <button className="icon-button danger-text" onClick={() => deleteTask(task.id)} title="Delete task">×</button>
          </div>
        </article>
      ))}
    </div>
  ) : <div className="empty-state"><span>✧</span><strong>Nothing here yet</strong><p>Add a task to get started.</p></div>

  const taskFormContent = (
    <>
      <div className="panel-heading"><div><span className="eyebrow">{editingId ? 'UPDATE TASK' : 'NEW TASK'}</span><h3 id={editingId ? 'task-form-title' : undefined}>{editingId ? 'Edit task' : 'Create a task'}</h3></div><button className="icon-button" onClick={resetTaskForm} aria-label="Close task form">×</button></div>
      <div className="form-grid">
        <label className="field field-wide">Topic name (optional for chapter-level tasks)<input value={taskForm.title} onChange={e => updateTaskForm('title', e.target.value)} placeholder="e.g. Angular momentum" /></label>
        <label className="field">Subject<select value={taskForm.subject} onChange={e => updateTaskForm('subject', e.target.value as Subject)}>{subjects.map(s => <option key={s}>{s}</option>)}</select></label>
        <label className="field">Parent chapter<input value={taskForm.chapter} onChange={e => updateTaskForm('chapter', e.target.value)} placeholder="e.g. Rotational Motion" /></label>
        <label className="field">Task type<select value={taskForm.taskType} onChange={e => updateTaskForm('taskType', e.target.value as TaskType)}>{taskTypes.map(type => <option key={type}>{type}</option>)}</select></label>
        <label className="field">Priority<select value={taskForm.priority} onChange={e => updateTaskForm('priority', e.target.value as Priority)}>{priorities.map(p => <option key={p}>{p}</option>)}</select></label>
        <label className="field">Deadline<input type="date" value={taskForm.deadline} onChange={e => updateTaskForm('deadline', e.target.value)} /></label>
        <label className="field">Planned minutes<input type="number" min="1" step="5" value={taskForm.estimateMinutes} onChange={e => updateTaskForm('estimateMinutes', e.target.value)} /></label>
        <label className="field">Question target<input type="number" min="0" step="1" value={taskForm.questionTarget} onChange={e => updateTaskForm('questionTarget', e.target.value)} /></label>
        <label className="field">Status<select value={taskForm.status} onChange={e => updateTaskForm('status', e.target.value as TaskStatus)}>{taskStatuses.map(status => <option key={status}>{status}</option>)}</select></label>
        <label className="checkbox-field"><input type="checkbox" checked={taskForm.revision} onChange={e => updateTaskForm('revision', e.target.checked)} /> Schedule revision reviews (3, 7 and 30 days)</label>
      </div>
      <div className="form-actions"><button className="button button-ghost" onClick={resetTaskForm}>Cancel</button><button className="button button-primary" onClick={addOrUpdateTask}>{editingId ? 'Save changes' : 'Add task'}</button></div>
    </>
  )
  const taskFormView = showForm && (editingId
    ? <div className="task-edit-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) resetTaskForm() }}>
      <section className="panel task-form-panel task-edit-modal" role="dialog" aria-modal="true" aria-labelledby="task-form-title">
        {taskFormContent}
      </section>
    </div>
    : <section className="panel task-form-panel">{taskFormContent}</section>)

  const makeDailyLogImage = (download: boolean) => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 1200
      canvas.height = 1
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas is unavailable in this browser.')
      const wrap = (value: string, maxWidth: number) => {
        const words = value.split(/\s+/).filter(Boolean)
        const lines: string[] = []
        let currentLine = ''
        words.forEach(word => {
          if (context.measureText(word).width > maxWidth) {
            if (currentLine) lines.push(currentLine)
            currentLine = ''
            let chunk = ''
            for (const character of word) {
              if (chunk && context.measureText(chunk + character).width > maxWidth) {
                lines.push(chunk)
                chunk = character
              } else chunk += character
            }
            currentLine = chunk
            return
          }
          const candidate = currentLine ? `${currentLine} ${word}` : word
          if (currentLine && context.measureText(candidate).width > maxWidth) {
            lines.push(currentLine)
            currentLine = word
          } else currentLine = candidate
        })
        if (currentLine) lines.push(currentLine)
        return lines
      }
      const draw = (paint: boolean) => {
        let y = 74
        const left = 76
        const maxWidth = 1048
        const text = (value: string, x: number, size: number, color: string, weight = '400', lineHeight = size * 1.5, width = maxWidth) => {
          context.font = `${weight} ${size}px Manrope, Arial, sans-serif`
          context.fillStyle = color
          const lines = wrap(value, width)
          lines.forEach((item, index) => {
            if (paint) context.fillText(item, x, y + index * lineHeight)
          })
          y += Math.max(lineHeight, lines.length * lineHeight)
        }
        const divider = () => {
          if (paint) {
            context.strokeStyle = '#e9e4ef'
            context.lineWidth = 1
            context.beginPath()
            context.moveTo(left, y)
            context.lineTo(1124, y)
            context.stroke()
          }
          y += 26
        }
        if (paint) {
          const background = context.createLinearGradient(0, 0, 1200, 1500)
          background.addColorStop(0, '#ffffff')
          background.addColorStop(1, '#edf3ff')
          context.fillStyle = background
          context.fillRect(0, 0, 1200, canvas.height)
          context.fillStyle = '#dce7fb'
          context.beginPath()
          context.roundRect(36, 36, 1128, canvas.height - 72, 30)
          context.fill()
          context.fillStyle = '#ffffff'
          context.beginPath()
          context.roundRect(40, 40, 1120, canvas.height - 80, 27)
          context.fill()
          context.fillStyle = '#477fe8'
          context.fillRect(left, 48, 64, 5)
        }
        text('ZENORA  /  DAILY STUDY LOG', left, 16, '#477fe8', '700', 24)
        text(new Date(`${today}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), left, 22, '#253550', '700', 33)
        text(dailyNumber === null ? 'Day number unavailable' : `DAY ${dailyNumber}`, left, 12, '#8491a7', '700', 20)
        y += 14
        text(dailyLogNote.tagline.trim() || 'Today’s study log', left, 31, '#253550', '700', 42)
        divider()
        text('TODAY AT A GLANCE', left, 13, '#477fe8', '700', 22)
        ;[
          `${dailyCompletedCount} / ${dailyTasks.length} tasks completed`,
          `${dailyCompletionPercent}% completion`,
          `${formatMinutes(todayMinutes)} study time`,
        ].forEach((item, index) => text(item, left + index * 350, 19, '#253550', '700', 29, 330))
        y += 8
        divider()
        text('SUBJECT-WISE STUDY TIME', left, 13, '#477fe8', '700', 22)
        if (dailySubjectMinutes.length) dailySubjectMinutes.forEach(item =>
          text(`${item.subject}   ·   ${formatMinutes(item.minutes)}`, left, 17, '#253550', '500', 27),
        )
        else text('No study time recorded today', left, 16, '#8491a7', '400', 25)
        y += 8
        divider()
        text('CHAPTERS COVERED', left, 13, '#477fe8', '700', 22)
        if (dailyChapters.length) dailyChapters.forEach(chapter => text(`•  ${chapter}`, left, 16, '#253550', '500', 25))
        else text('No chapters recorded today', left, 16, '#8491a7', '400', 25)
        y += 8
        divider()
        text('PRACTICE QUESTIONS', left, 13, '#477fe8', '700', 22)
        text(dailyQuestionsAttempted === null
          ? 'Not recorded today'
          : `${dailyQuestionsAttempted} attempted   ·   ${dailyQuestionsCorrect} correct`, left, 17, '#253550', '500', 27)
        y += 8
        divider()
        text('TODAY’S ACHIEVEMENTS', left, 13, '#477fe8', '700', 22)
        if (dailyAchievements.length) dailyAchievements.forEach(item => text(`✦  ${item}`, left, 16, '#253550', '500', 25))
        else text('No achievements recorded yet', left, 16, '#8491a7', '400', 25)
        y += 8
        divider()
        text('DAILY REFLECTION', left, 13, '#477fe8', '700', 22)
        text(dailyLogNote.reflection.trim() || 'No reflection added', left, 16, dailyLogNote.reflection.trim() ? '#253550' : '#8491a7', '400', 26)
        y += 15
        text('Built from your recorded tasks and study sessions.', left, 11, '#8491a7', '400', 18)
        return y + 46
      }
      canvas.height = draw(false)
      draw(true)
      const image = canvas.toDataURL('image/png')
      if (download) {
        const anchor = document.createElement('a')
        anchor.href = image
        anchor.download = `zenora-study-log-${today}.png`
        anchor.click()
        setNotice('Study log PNG downloaded.')
      } else setDailyLogPreview(image)
    } catch (error) {
      setNotice(error instanceof Error ? `Could not create the study log image: ${error.message}` : 'Could not create the study log image.')
    }
  }

  const pageHeader = (eyebrow: string, title: string, subtitle: string, action?: React.ReactNode) => (
    <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>
  )

  const profileControls = (
    <div className="profile-controls">
      <div className="profile-label"><span className="avatar">Z</span><div><strong>Your research desk</strong><span>Personal workspace</span></div></div>
      <label>Stage<select value={profile.stage} onChange={e => updateProfile('stage', e.target.value)}><option>Class 11</option><option>Class 12</option><option>Dropper</option></select></label>
      <label>Stream<select value={profile.stream} onChange={e => updateProfile('stream', e.target.value)}><option>PCM</option><option>PCB</option><option>PCMB</option></select></label>
    </div>
  )

  const dashboard = (
    <div className="dashboard-page">
      {pageHeader('TODAY AT A GLANCE', 'Good things take focus.', 'A calm little space for steady progress towards your exam.', <span className="date-pill">{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>)}
      {profileControls}
      <section className="exam-hero">
        <div className="hero-orb orb-one" />
        <div className="hero-orb orb-two" />
        <div className="hero-content">
          <span className="hero-label">YOUR NEXT MILESTONE</span>
          <h2>{profile.exam}</h2>
          <p className="exam-quote">“{currentQuote.text}” <span>— {currentQuote.author}</span></p>
          <div className="hero-selects">
            <label>Exam<select value={profile.exam} onChange={e => changeExam(e.target.value)}>{examOptions.map(exam => <option key={exam.name}>{exam.name}</option>)}</select></label>
            <label>Exam date<input type="datetime-local" value={profile.examDate} onChange={e => updateProfile('examDate', e.target.value)} /></label>
          </div>
        </div>
        <div className="countdown">
          <span>COUNTING DOWN</span>
          <div className="countdown-units">
            <div><strong>{examDays}</strong><small>days</small></div>
            <div><strong>{String(examHours).padStart(2, '0')}</strong><small>hrs</small></div>
            <div><strong>{String(examMinutes).padStart(2, '0')}</strong><small>min</small></div>
            <div><strong>{String(examSeconds).padStart(2, '0')}</strong><small>sec</small></div>
          </div>
          <small>{formatDate(profile.examDate.slice(0, 10))}</small>
        </div>
      </section>
      <div className="dashboard-columns">
        <div className="dashboard-summary">
          <div className="stats-grid dashboard-stats">
            <div className="stat-card"><span className="stat-icon blue">◷</span><div><span>Study time today</span><strong>{formatMinutes(todayMinutes)}</strong><small>{Math.max(0, DAILY_STREAK_GOAL - todayMinutes)} min to streak goal</small></div></div>
            <div className="stat-card"><span className="stat-icon mint">✓</span><div><span>Tasks completed</span><strong>{completedTasks}/{tasks.length}</strong><small>{completionRate}% of all tasks</small></div></div>
            <div className="stat-card"><span className="stat-icon lilac">✦</span><div><span>Current streak</span><strong>{currentStreak} days</strong><small>Longest: {longestStreak} days</small></div></div>
            <button type="button" className="stat-card dashboard-stat-button" onClick={() => setPage('Revision')}>
              <span className="stat-icon peach">↻</span>
              <div><span>Revision due</span><strong>{overdueRevisions.length + dueRevisions.length}</strong><small>{overdueRevisions.length} overdue · {dueRevisions.length} due today</small></div>
            </button>
          </div>
          <section className="panel task-progress-panel">
            <div className="panel-heading"><div><span className="eyebrow">TASK PROGRESS</span><h3>Status overview</h3></div><span className="activity-summary">{tasks.length} total tasks</span></div>
            <div className="task-status-grid">{statusCounts.map(item => (
              <div className="task-status-summary" key={item.status}>
                <div><span>{item.status}</span><strong>{item.count}</strong></div>
                <div className="progress-track"><span className={`status-bar status-bar-${item.status.toLowerCase().replaceAll(' ', '-')}`} style={{ width: `${tasks.length ? item.count / tasks.length * 100 : 0}%` }} /></div>
              </div>
            ))}</div>
          </section>
        </div>
        <div className="dashboard-work-row">
          <section className="panel dashboard-task-panel">
            <div className="panel-heading"><div><span className="eyebrow">YOUR NEXT STEPS</span><h3>Tasks in progress</h3></div><button className="text-button" onClick={() => setPage('Today’s Tasks')}>View all →</button></div>
            {taskList(dashboardTasksExpanded ? activeTasks : activeTasks.slice(0, 2))}
            {activeTasks.length > 2 && <button className="text-button dashboard-task-expand" onClick={() => setDashboardTasksExpanded(expanded => !expanded)} aria-expanded={dashboardTasksExpanded}>{dashboardTasksExpanded ? 'Show fewer tasks ↑' : `Show all ${activeTasks.length} tasks ↓`}</button>}
          </section>
          <section className="panel timer-panel">
            <div className="panel-heading"><div><span className="eyebrow">STAY IN THE MOMENT</span><h3>Focus timer</h3></div><span className="live-dot">{running ? 'In session' : timerSessionActive ? 'Paused' : 'Ready'}</span></div>
            <div className="timer-face"><svg viewBox="0 0 220 220" className="timer-ring"><circle cx="110" cy="110" r="96" className="ring-bg" /><circle cx="110" cy="110" r="96" className="ring-progress" style={{ strokeDasharray: `${603 * (1 - secondsLeft / Math.max(1, (timerMode === 'Focus' ? focusDuration : breakDuration) * 60))} 603` }} /></svg><div className="timer-readout"><strong>{timeLabel(secondsLeft)}</strong><span>{timerMode === 'Focus' ? 'TIME TO FOCUS' : 'TAKE A BREATHER'}</span></div></div>
            <p className="timer-time-added">Session time: <strong>{timeLabel(elapsedSeconds)}</strong><span>Added today: {formatMinutes(todayMinutes)}</span></p>
            <div className="timer-actions">
              <button className="button button-primary" onClick={running ? pauseTimer : () => startTimer()}>{running ? 'Ⅱ  Pause' : timerSessionActive ? '▶  Resume' : '▶  Start'}</button>
              <button className="button button-ghost" onClick={saveTimer} disabled={!timerSessionActive}>Save</button>
            </div>
            <button
              type="button"
              className="text-button timer-settings-toggle"
              aria-expanded={timerSettingsExpanded}
              aria-controls="focus-timer-settings"
              onClick={() => setTimerSettingsExpanded(expanded => !expanded)}
            >
              {timerSettingsExpanded ? 'Hide timer settings ↑' : 'Subject, topic & duration ↓'}
            </button>
            <div className="timer-settings" id="focus-timer-settings" hidden={!timerSettingsExpanded}>
              <div className="mode-switch"><button className={timerMode === 'Focus' ? 'active' : ''} onClick={() => switchTimerMode('Focus')} disabled={timerSessionActive}>Focus</button><button className={timerMode === 'Break' ? 'active' : ''} onClick={() => switchTimerMode('Break')} disabled={timerSessionActive}>Break</button></div>
              <div className="duration-row">{(timerMode === 'Focus' ? [15, 25, 45, 60, 90] : [5, 10, 15, 20]).map(min => <button key={min} className={(timerMode === 'Focus' ? focusDuration : breakDuration) === min ? 'selected' : ''} onClick={() => changeDuration(min)} disabled={timerSessionActive}>{min}m</button>)}</div>
              <label className="field timer-custom-duration">Custom {timerMode.toLowerCase()} duration (minutes)<input type="number" min="1" max="180" value={timerMode === 'Focus' ? focusDuration : breakDuration} disabled={timerSessionActive} onChange={event => changeDuration(Math.min(180, Math.max(1, safeNumber(event.target.value, 25))))} /></label>
              <label className="field">Subject<select value={selectedSubject} disabled={timerSessionActive} onChange={e => setSelectedSubject(e.target.value as Subject)}>{subjects.map(s => <option key={s}>{s}</option>)}</select></label>
              <label className="field">Task / topic<select value={selectedTaskId} disabled={timerSessionActive} onChange={e => { setSelectedTaskId(e.target.value); const task = tasks.find(t => t.id === e.target.value); if (task) { setSelectedSubject(task.subject); setSelectedChapter(task.chapter) } }}><option value="">No task linked</option>{activeTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
              <label className="field chapter-field">Chapter / topic<input value={selectedChapter} disabled={timerSessionActive} onChange={e => setSelectedChapter(e.target.value)} placeholder={taskForTimer?.chapter || 'Optional topic'} /></label>
            </div>
          </section>
        </div>
        <section className="panel activity-panel dashboard-activity-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">DAILY CONSISTENCY</span><h3>Monthly activity</h3></div>
            <span className="activity-summary">{monthActiveDays} active days · {formatMinutes(monthTotalMinutes)}</span>
          </div>
          <div className="activity-month-navigation">
            <button className="icon-button" onClick={() => setActivityMonth(month => shiftMonth(month, -1))} aria-label="Previous month">‹</button>
            <strong>{activityMonthLabel}</strong>
            <button className="icon-button" onClick={() => setActivityMonth(month => shiftMonth(month, 1))} disabled={activityMonth >= today.slice(0, 7)} aria-label="Next month">›</button>
          </div>
          <div className="monthly-calendar" aria-label={`Study activity calendar for ${activityMonthLabel}`}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span className="calendar-weekday" key={day}>{day}</span>)}
            {activityDays.map((day, index) => day
              ? <span
                className={`calendar-day activity-level-${day.level}${day.date > today ? ' activity-future' : ''}`}
                key={day.date}
                title={`${new Date(`${day.date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}: ${formatMinutes(day.minutes)} studied`}
                aria-label={`${day.date}: ${formatMinutes(day.minutes)} studied`}
              >{Number(day.date.slice(-2))}</span>
              : <span className="calendar-day calendar-empty" key={`empty-${index}`} aria-hidden="true" />)}
          </div>
          <div className="activity-legend"><span>Less</span>{[0, 1, 2, 3, 4].map(level => <span className={`activity-day activity-level-${level}`} key={level} aria-hidden="true" />)}<span>More</span><small>Based on recorded minutes (45 min = goal).</small></div>
        </section>
      </div>
    </div>
  )

  const tasksPage = (
    <>
      {pageHeader('YOUR TASK BOARD', 'Today’s Tasks', 'Break your study plan into small, satisfying wins.', <button className="button button-primary" onClick={() => {
        setTaskForm({ title: '', subject: 'Physics', chapter: '', taskType: 'Concepts', priority: 'Medium', deadline: '', status: 'Not Started', revision: false, estimateMinutes: '60', questionTarget: '0' })
        setEditingId(null)
        setShowForm(visible => !visible)
      }}>＋ Add task</button>)}
      <nav className="tasks-view-bar" aria-label="Today’s Tasks views" role="group">
        <button type="button" aria-pressed={tasksView === 'tasks'} className={tasksView === 'tasks' ? 'tasks-view-active' : ''} onClick={() => setTasksView('tasks')}>
          <span aria-hidden="true">☑</span> My tasks
        </button>
        <button type="button" aria-pressed={tasksView === 'daily-log'} className={tasksView === 'daily-log' ? 'tasks-view-active' : ''} onClick={() => setTasksView('daily-log')}>
          <span aria-hidden="true">✧</span> Daily study log
          <span className="tasks-view-sparkle" aria-hidden="true">♡</span>
        </button>
      </nav>
      {tasksView === 'tasks' && <>
      <section className="task-time-summary" aria-label="Planned and actual task time">
        <article className="task-time-card planned-time-card"><span className="stat-icon blue">◷</span><div><span>Planned hours</span><strong>{formatMinutes(plannedTaskMinutes)}</strong><small>{tasks.filter(task => task.status !== 'Cancelled').length} non-cancelled tasks</small></div></article>
        <article className="task-time-card actual-time-card"><span className="stat-icon mint">✓</span><div><span>Actual hours</span><strong>{formatMinutes(actualTaskMinutes)}</strong><small>Calculated from task-linked study time</small></div></article>
      </section>
      <div className="filter-strip"><span>{activeTasks.length} active</span><span>{completedTasks} completed</span><span>{tasks.filter(t => t.priority === 'High' && t.status !== 'Completed' && t.status !== 'Cancelled').length} high priority</span><span>{tasks.filter(t => t.status === 'Cancelled').length} cancelled</span></div>
      {taskFormView}
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">ALL TASKS</span><h3>Your checklist</h3></div></div>{taskList(tasks, true, true)}</section>
      </>}
      {tasksView === 'daily-log' && <>
      <section className="panel daily-log-panel" aria-labelledby="daily-log-title">
        <div className="panel-heading">
          <div><span className="eyebrow">YOUR DAY, IN ONE FRAME</span><h3 id="daily-log-title">Daily Study Log Overview</h3></div>
          <span className="tag tag-purple">{dailyNumber === null ? 'Day —' : `Day ${dailyNumber}`}</span>
        </div>
        <article className="daily-log-card">
          <div className="daily-log-card-header">
            <div><span className="daily-log-kicker">ZENORA · DAILY STUDY LOG</span><h4>{new Date(`${today}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h4></div>
            <span className="daily-log-day-number">{dailyNumber === null ? 'DAY —' : `DAY ${dailyNumber}`}</span>
          </div>
          <label className="field daily-log-edit-field">Your tagline<input maxLength={120} value={dailyLogNote.tagline} onChange={event => setDailyLogNotes(previous => ({
            ...previous,
            [today]: { ...(previous[today] || { tagline: '', reflection: '' }), tagline: event.target.value },
          }))} placeholder="Add a line about today" /></label>
          <div className="daily-log-summary">
            <div><span>Tasks completed</span><strong>{dailyCompletedCount} <small>/ {dailyTasks.length}</small></strong></div>
            <div><span>Completion</span><strong>{dailyCompletionPercent}%</strong><div className="daily-log-progress"><span style={{ width: `${dailyCompletionPercent}%` }} /></div></div>
            <div><span>Study time</span><strong>{formatMinutes(todayMinutes)}</strong></div>
          </div>
          <div className="daily-log-details">
            <section><h5>Subject-wise study time</h5>{dailySubjectMinutes.length
              ? <ul>{dailySubjectMinutes.map(item => <li key={item.subject}><span>{item.subject}</span><strong>{formatMinutes(item.minutes)}</strong></li>)}</ul>
              : <p>No study time recorded today.</p>}</section>
            <section><h5>Chapters covered</h5>{dailyChapters.length
              ? <ul className="daily-log-chapters">{dailyChapters.map(chapter => <li key={chapter}>{chapter}</li>)}</ul>
              : <p>No chapters recorded today.</p>}</section>
            <section><h5>Practice questions</h5><p>{dailyQuestionsAttempted === null
              ? 'Not recorded today.'
              : `${dailyQuestionsAttempted} attempted · ${dailyQuestionsCorrect} correct`}</p></section>
            <section><h5>Achievements</h5>{dailyAchievements.length
              ? <ul className="daily-log-achievements">{dailyAchievements.map(item => <li key={item}>{item}</li>)}</ul>
              : <p>No achievements recorded yet.</p>}</section>
          </div>
          <label className="field daily-log-edit-field">Daily reflection<textarea maxLength={1200} rows={3} value={dailyLogNote.reflection} onChange={event => setDailyLogNotes(previous => ({
            ...previous,
            [today]: { ...(previous[today] || { tagline: '', reflection: '' }), reflection: event.target.value },
          }))} placeholder="What went well? What would you like to carry into tomorrow?" /></label>
          <p className="daily-log-footnote">Statistics come from today’s recorded tasks, study sessions and question records. Missing data is left unfilled.</p>
        </article>
        <div className="daily-log-actions">
          <button className="button button-ghost" onClick={() => makeDailyLogImage(false)}>Preview Image</button>
          <button className="button button-primary" onClick={() => makeDailyLogImage(true)}>Download as PNG</button>
        </div>
        {dailyLogPreview && <div className="daily-log-preview-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setDailyLogPreview('') }}>
          <section className="daily-log-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="daily-log-preview-title">
            <div className="panel-heading"><div><span className="eyebrow">IMAGE PREVIEW</span><h3 id="daily-log-preview-title">Your complete study log</h3></div><button className="icon-button" onClick={() => setDailyLogPreview('')} aria-label="Close image preview">×</button></div>
            <img src={dailyLogPreview} alt={`Daily study log for ${today}`} />
            <div className="daily-log-actions"><button className="button button-ghost" onClick={() => setDailyLogPreview('')}>Close preview</button><button className="button button-primary" onClick={() => makeDailyLogImage(true)}>Download as PNG</button></div>
          </section>
        </div>}
      </section>
      </>}
    </>
  )

  const weeklyPage = (
    <>
      {pageHeader('PLAN WITH INTENTION', 'Weekly Planner', 'Make a gentle plan, one study day at a time.', <button className="button button-primary" onClick={() => { const nextWeek = shiftDate(weekStart, 7); setWeekStart(nextWeek); setSelectedWeekDay(nextWeek) }}>Next week →</button>)}
      <div className="week-navigation"><button className="button button-ghost" onClick={() => { const previousWeek = shiftDate(weekStart, -7); setWeekStart(previousWeek); setSelectedWeekDay(previousWeek) }}>← Previous week</button><strong>{formatDate(weekStart)} — {formatDate(shiftDate(weekStart, 6))}</strong><button className="button button-ghost" onClick={() => { const monday = shiftDate(today, -((new Date(`${today}T12:00:00`).getDay() + 6) % 7)); setWeekStart(monday); setSelectedWeekDay(today) }}>This week</button></div>
      <section className="panel plan-add"><div className="panel-heading"><div><span className="eyebrow">MAKE A PLAN</span><h3>Schedule a task</h3></div></div><div className="inline-form"><label className="field">Task<select value={planTaskId} onChange={e => setPlanTaskId(e.target.value)}><option value="">Choose task</option>{activeTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label><label className="field">Day<input type="date" value={planDate} onChange={e => setPlanDate(e.target.value)} /></label><button className="button button-primary" onClick={addPlannedTask}>Add to week</button></div></section>
      <div className="week-day-row" role="group" aria-label="Days of the selected week">{weekDays.map(date => {
        const dayTaskCount = planned.filter(item => item.date === date).length
        return <button className={`week-day-button${date === today ? ' today-card' : ''}${date === selectedWeekDay ? ' selected-week-day' : ''}`} key={date} onClick={() => setSelectedWeekDay(date)} aria-pressed={date === selectedWeekDay}>
          <span>{new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short' })}</span>
          <strong>{new Date(`${date}T12:00:00`).getDate()}</strong>
          <small>{dayTaskCount} {dayTaskCount === 1 ? 'task' : 'tasks'}</small>
        </button>
      })}</div>
      <section className="panel selected-day-panel">
        <div className="panel-heading"><div><span className="eyebrow">SELECTED DAY</span><h3>{new Date(`${selectedWeekDay}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</h3></div><span className="activity-summary">{formatMinutes(selectedDayMinutes)} studied</span></div>
        <div className="day-task-list">{selectedDayTasks.map(item => {
          const task = tasks.find(record => record.id === item.taskId)
          if (!task) return null
          return <div className={`planned-task ${task.status === 'Completed' ? 'planned-done' : ''}`} key={item.id}>
            <button onClick={() => toggleTask(task.id)} aria-label={task.status === 'Completed' ? 'Mark incomplete' : 'Mark complete'}>{task.status === 'Completed' ? '✓' : '○'}</button>
            <span><strong>{task.title}</strong><small>{task.subject} · {task.status}{task.deadline ? ` · Due ${formatDate(task.deadline)}` : ''}</small></span>
            <button className="remove-plan" onClick={() => setPlanned(previous => previous.filter(plan => plan.id !== item.id))} aria-label={`Remove ${task.title} from this day`}>×</button>
          </div>
        })}{selectedDayTasks.length === 0 && <div className="empty-state"><span>▦</span><strong>No tasks scheduled</strong><p>Use the form above to add a task to this day.</p></div>}</div>
      </section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">WEEKLY OVERVIEW</span><h3>Plan completion</h3></div><strong>{weekProgress}%</strong></div><div className="progress-track tall"><span style={{ width: `${weekProgress}%` }} /></div><p className="panel-note">{weekDoneCount} of {weekTaskCount} scheduled task entries completed. Unfinished tasks remain available to plan for another day.</p></section>
    </>
  )

  const renderRevisionCard = (record: RevisionRecord) => {
    const task = tasks.find(item => item.id === record.taskId)
    const accuracy = revisionAccuracy(record)
    const revisionNumber = revisionStageNumber(record)
    const recallLabels = {
      forgotten: 'Forgotten',
      partial: 'Partially remembered',
      recalled: 'Fully recalled',
    }
    const questionPerformance = record.attemptedQuestions
      ? `${record.correctQuestions || 0}/${record.attemptedQuestions} correct · ${Math.round((accuracy || 0) * 100)}%`
      : task?.questionTarget
        ? `Tracker: ${task.questionsCompleted}/${task.questionTarget} completed · accuracy not recorded`
        : 'Not recorded'
    return <article className="revision-card" key={record.id}>
      <div className="revision-card-heading">
        <div><span className="eyebrow">{record.subject}</span><h4>{record.chapter || record.title}</h4><p>{task?.topic || task?.title || record.title}</p></div>
        <span className={`revision-stage-badge${isWeakRevision(record) ? ' revision-stage-weak' : isMasteredRevision(record) ? ' revision-stage-mastered' : ''}`}>R{revisionNumber}</span>
      </div>
      <div className="revision-card-meta">
        <div><span>Reason for revision</span><strong>{record.reason || 'Scheduled spaced repetition review.'}</strong></div>
        <div><span>Last revised</span><strong>{record.lastRevisedAt ? formatDate(record.lastRevisedAt) : 'Not recorded yet'}</strong></div>
        <div><span>Next revision</span><strong>{formatDate(record.dueDate)}</strong></div>
        <div><span>Recall rating</span><strong>{record.recallRating ? recallLabels[record.recallRating] : 'Not recorded yet'}</strong></div>
        <div><span>Question-solving performance</span><strong>{questionPerformance}</strong></div>
      </div>
      {!task && <p className="revision-orphan-note">The linked task could not be found. Recreate it in Today’s Tasks to start a timer-linked review.</p>}
      <div className="revision-card-actions">
        <button type="button" className="button button-primary" onClick={() => startRevision(record)} disabled={!task}>▶ Start Revision</button>
        <button type="button" className="button button-ghost" onClick={() => reviewingRevisionId === record.id ? setReviewingRevisionId(null) : openRevisionReview(record)}>✓ Mark Reviewed</button>
        <button type="button" className="button button-ghost" onClick={() => {
          setReviewingRevisionId(null)
          setReschedulingRevisionId(reschedulingRevisionId === record.id ? null : record.id)
          setRevisionRescheduleDate(record.dueDate > today ? record.dueDate : shiftDate(today, 1))
        }}>↗ Reschedule</button>
      </div>
      {reviewingRevisionId === record.id && <div className="revision-action-form">
        <strong>Record this review</strong>
        <div className="revision-input-grid">
          <label className="field">Recall<select value={revisionRecallRating} onChange={event => setRevisionRecallRating(event.target.value as 'forgotten' | 'partial' | 'recalled')}><option value="forgotten">Forgotten</option><option value="partial">Partially remembered</option><option value="recalled">Fully recalled</option></select></label>
          <label className="field">Questions attempted<input type="number" min="0" step="1" value={revisionAttempted} onChange={event => setRevisionAttempted(event.target.value)} /></label>
          <label className="field">Correct answers<input type="number" min="0" step="1" value={revisionCorrect} onChange={event => setRevisionCorrect(event.target.value)} /></label>
        </div>
        <p className="panel-note">Forgotten or low-accuracy topics return in 1 day; partial recall in about 3–7 days; strong recall with good accuracy in 30 days.</p>
        <button type="button" className="button button-primary" onClick={() => saveRevisionReview(record)}>Save review & schedule next</button>
      </div>}
      {reschedulingRevisionId === record.id && <div className="revision-action-form revision-reschedule-form">
        <label className="field">New revision date<input type="date" min={today} value={revisionRescheduleDate} onChange={event => setRevisionRescheduleDate(event.target.value)} /></label>
        <button type="button" className="button button-primary" onClick={() => rescheduleRevision(record)}>Save new date</button>
      </div>}
    </article>
  }

  const revisionSection = (title: string, description: string, records: RevisionRecord[], emptyMessage: string) => (
    <section className="panel revision-queue-section">
      <div className="panel-heading"><div><h3>{title}</h3><p>{description}</p></div><span className="activity-summary">{records.length} {records.length === 1 ? 'topic' : 'topics'}</span></div>
      {records.length ? <div className="revision-card-list">{records.map(renderRevisionCard)}</div> : <div className="revision-section-empty">{emptyMessage}</div>}
    </section>
  )

  const revisionPage = (
    <>
      {pageHeader('SPACED REPETITION', 'Revision queue', 'Bring topics back at the right moment: weak recall sooner, confident recall later.')}
      <section className="panel revision-scheduler"><div className="panel-heading"><div><span className="eyebrow">SCHEDULE A CHAPTER</span><h3>Add a task to revision</h3></div></div><div className="inline-form"><label className="field">Task / chapter<select value={revisionTaskId} onChange={e => setRevisionTaskId(e.target.value)}><option value="">Choose task</option>{tasks.map(t => <option key={t.id} value={t.id}>{t.subject} · {t.chapter || t.title}</option>)}</select></label><label className="field">Starting date<input type="date" min={today} value={revisionStart} onChange={e => setRevisionStart(e.target.value)} /></label><button className="button button-primary" onClick={addRevisionSchedule}>＋ Schedule revision</button></div><p className="panel-note">Initial reminders follow a 3-, 7- and 30-day spacing. After you record recall and question performance, the next interval adapts to that result.</p></section>
      {revisionSection('Due Today', 'Includes overdue reminders that still need attention.', [...overdueRevisions, ...dueRevisions], 'No revisions are due today.')}
      {revisionSection('Weak Concepts', 'Future reviews flagged by forgotten or partial recall, or low question accuracy.', weakRevisions, 'No future revision is currently flagged as weak.')}
      {revisionSection('Upcoming Revisions', 'Scheduled reviews that are not currently flagged as weak or mastered.', upcomingRevisions, 'No standard upcoming revisions.')}
      {revisionSection('Mastered / Review Later', 'Strong recall with good accuracy; these reviews are spaced further apart.', masteredRevisions, 'Topics move here after a strong recall review.')}
    </>
  )

  const performancePage = (
    <>
      {pageHeader('MEASURE YOUR PROCESS', 'Performance', 'See your study rhythm, subject balance and progress at a glance.')}
      <div className="stats-grid">
        <div className="stat-card"><span className="stat-icon blue">◷</span><div><span>Total study time</span><strong>{formatMinutes(totalMinutes)}</strong><small>{logs.length} study logs</small></div></div>
        <div className="stat-card"><span className="stat-icon mint">✓</span><div><span>Task completion</span><strong>{completionRate}%</strong><small>{completedTasks} of {tasks.length} tasks</small></div></div>
        <div className="stat-card"><span className="stat-icon lilac">✦</span><div><span>Current streak</span><strong>{currentStreak} days</strong><small>Longest: {longestStreak} days</small></div></div>
        <div className="stat-card"><span className="stat-icon peach">↻</span><div><span>Revision completion</span><strong>{revisions.length ? Math.round(revisions.filter(r => r.completed).length / revisions.length * 100) : 0}%</strong><small>{revisions.filter(r => r.completed).length} reviews completed</small></div></div>
      </div>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">LAST 7 DAYS</span><h3>Daily study time</h3></div><strong>{formatMinutes(weekMinutes)}</strong></div><div className="bar-chart">{dailyMinutes.map(item => <div className="bar-column" key={item.date}><strong>{item.minutes ? Math.round(item.minutes) : ''}</strong><div className="bar-track"><span style={{ height: `${Math.max(item.minutes ? 5 : 0, item.minutes / maxDailyMinutes * 100)}%` }} /></div><small>{new Date(`${item.date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short' })}</small></div>)}</div></section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">SUBJECT BALANCE</span><h3>Time by subject</h3></div></div><div className="subject-chart">{subjectMinutes.map(item => <div className="subject-bar-row" key={item.subject}><div><span>{item.subject}</span><strong>{formatMinutes(item.minutes)}</strong></div><div className="progress-track"><span style={{ width: `${item.minutes / maxSubjectMinutes * 100}%` }} /></div></div>)}</div></section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">MANUAL STUDY LOG</span><h3>Add time studied</h3></div></div><div className="form-grid">
        <label className="field">Minutes<input type="number" min="1" value={manualMinutes} onChange={e => setManualMinutes(e.target.value)} /></label>
        <label className="field">Subject<select value={manualSubject} onChange={e => setManualSubject(e.target.value as Subject)}>{subjects.map(s => <option key={s}>{s}</option>)}</select></label>
        <label className="field">Link to task (optional)<select value={manualTaskId} onChange={e => { setManualTaskId(e.target.value); const t = tasks.find(task => task.id === e.target.value); if (t) { setManualSubject(t.subject); setManualChapter(t.chapter) } }}><option value="">No task linked</option>{tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
        <label className="field">Chapter / topic<input value={manualChapter} onChange={e => setManualChapter(e.target.value)} placeholder="Optional" /></label>
      </div><div className="form-actions"><button className="button button-primary" onClick={recordManualTime}>＋ Log study time</button></div></section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h3>Study history</h3></div></div>{logs.length ? <div className="history-list">{[...logs].reverse().slice(0, 12).map(log => <div className="history-row" key={log.id}><span className="history-dot" /><div><strong>{log.subject}{log.chapter ? ` · ${log.chapter}` : ''}</strong><p>{formatDate(log.date)} · {log.source === 'timer' ? 'Focus timer' : 'Manual log'}</p></div><strong>{formatMinutes(log.minutes)}</strong></div>)}</div> : <p className="panel-note">Your study logs will appear here.</p>}</section>
    </>
  )

  const examIntelligenceTabs = (
    <nav className="intelligence-tabs" aria-label="Exam Intelligence sections">
      {examIntelligencePages.map(feature => <button
        key={feature.page}
        type="button"
        className={`intelligence-tab${(page === feature.page || (page === 'Exam Intelligence' && feature.page === 'AI Exam Analyst')) ? ' intelligence-tab-active' : ''}`}
        onClick={() => setPage(feature.page)}
        aria-current={page === feature.page || (page === 'Exam Intelligence' && feature.page === 'AI Exam Analyst') ? 'page' : undefined}
      >
        <span>{feature.icon} {feature.label}</span>
        {feature.status === 'In Progress' && <small>In Progress</small>}
      </button>)}
    </nav>
  )

  const examIntelligencePage = (
    <>
      {pageHeader('EXAM INTELLIGENCE ENGINE', page === 'AI Exam Analyst' ? 'AI Exam Analyst' : 'IAT 2027 intelligence', 'A transparent study recommender connected to your task tracker. Historical weightage is not a guarantee.')}
      {examIntelligenceTabs}
      <section className="integration-grid" aria-label="Exam integrations">
        {examIntegrations.map(exam => <article className={`integration-card${exam.active ? ' integration-active' : ''}`} key={exam.name}>
          <div><span className="eyebrow">{exam.active ? 'ENGINE AVAILABLE' : 'UPCOMING INTEGRATION'}</span><h3>{exam.name}</h3></div>
          <span className={`integration-status${exam.active ? ' status-ready' : ''}`}>{exam.status}</span>
        </article>)}
      </section>
      <section className="intelligence-source-note">
        <span className="source-mark">i</span>
        <div><strong>Official syllabus reference loaded: {officialIatSource.reviewedCycle}</strong>
          <p>{officialIatSource.note} The 2026 official pattern has 60 questions—15 each in Biology, Chemistry, Mathematics, and Physics—in 180 minutes, with +4 for a correct answer, −1 for an incorrect answer, and 0 for unanswered. This verifies subject-level coverage, not the inclusion of every tracker chapter.</p>
          <div className="intelligence-source-links">
            <a href={officialIatSource.url} target="_blank" rel="noreferrer">{officialIatSource.label} ↗</a>
            <a href={officialIatSource.syllabusPdfUrl} target="_blank" rel="noreferrer">Detailed IAT 2026 syllabus PDF ↗</a>
            <a href={officialIatSource.examPatternUrl} target="_blank" rel="noreferrer">Official IAT 2026 exam pattern ↗</a>
          </div>
          <p>Chapter-level status remains “Not mapped” until a chapter is matched to the detailed PDF. No historical PYQ analysis or 2027 weightage is fabricated.</p>
        </div>
      </section>
      <div className="intelligence-main-grid">
        <section className="panel next-task-panel">
          <div className="panel-heading"><div><span className="eyebrow">NEXT BEST TASK · PERSONAL TRACKER SIGNALS</span><h3>What to study next</h3></div><span className="tag tag-purple">Recommendation, not prediction</span></div>
          {nextBestTask ? <>
            <div className="recommendation-title"><span className="recommendation-subject">{nextBestTask.task.subject}</span><h4>{nextBestTask.chapter}</h4><p>{nextBestTask.task.topic || nextBestTask.task.title} · {nextBestTask.task.taskType}</p></div>
            <div className="recommendation-facts">
              <div><span>Why now</span><strong>{nextBestTask.why}</strong></div>
              <div><span>IAT relevance</span><strong>{nextBestTask.task.subject} is one of the four official IAT sections. Check the 2026 syllabus PDF for this chapter; 2027 syllabus continuity is not guaranteed.</strong></div>
              <div><span>Recommended activity</span><strong>{nextBestTask.task.taskType}{nextBestTask.task.questionTarget > 0 ? ` · work toward ${nextBestTask.task.questionTarget} questions` : ''}</strong></div>
              <div><span>Estimated time</span><strong>{nextBestTask.estimatedMinutes} min, based on your task estimate and tracked progress.</strong></div>
              <div><span>Practice signal</span><strong>{nextBestTask.accuracy === null ? 'No result recorded; no weakness signal was applied.' : `${Math.round(nextBestTask.accuracy * 100)}% (${nextBestTask.correct}/${nextBestTask.attempted} correct)`}</strong></div>
              {nextBestTask.reasons.filter(reason => reason !== nextBestTask.why).map(reason => <div key={reason}><span>Tracker signal</span><strong>{reason}</strong></div>)}
            </div>
            <button className="button button-primary recommendation-action" onClick={() => { setPage('Dashboard'); startTimer(nextBestTask.task) }}>▶ Start focus on this task</button>
          </> : <div className="empty-state"><span>✧</span><strong>No unfinished tasks to rank</strong><p>Add a chapter task in Today’s Tasks to receive a personal recommendation. Official syllabus mapping will remain unverified until a sourced record is added.</p><button className="button button-ghost" onClick={() => setPage('Today’s Tasks')}>Open Today’s Tasks</button></div>}
        </section>
        <section className={`panel workload-panel${workloadOverBy > 0 ? ' workload-warning' : ''}`}>
          <div className="panel-heading"><div><span className="eyebrow">WORKLOAD CHECK</span><h3>{workloadOverBy > 0 ? 'Today looks over capacity' : 'Today’s available time'}</h3></div><span className={`tag ${workloadOverBy > 0 ? 'tag-warning' : 'tag-green'}`}>{workloadOverBy > 0 ? 'Over capacity' : 'Within estimate'}</span></div>
          <label className="field">Available study time per day (minutes)<input type="number" min="0" max="1440" value={examDatabase.availableMinutesPerDay} onChange={event => setExamDatabase(previous => ({ ...previous, availableMinutesPerDay: Math.min(1440, Math.max(0, Math.round(safeNumber(event.target.value, 0)))) }))} /></label>
          <div className="workload-metrics"><div><span>Planned + recommended</span><strong>{formatMinutes(recommendedWorkload)}</strong></div><div><span>Available after study today</span><strong>{formatMinutes(availableMinutesRemaining)}</strong></div></div>
          <p className="panel-note">Uses unfinished tasks scheduled for today, their remaining estimates, the recommended task if not already scheduled, and study time already logged today.</p>
          {workloadOverBy > 0 && <div className="workload-suggestion"><strong>Short by {formatMinutes(workloadOverBy)}.</strong>
            {rescheduleSuggestions ? <><p>Consider moving this lower-priority scheduled task to tomorrow: <b>{rescheduleSuggestions.task.title}</b> ({rescheduleSuggestions.task.priority} priority).</p><button className="button button-ghost" onClick={() => movePlanToTomorrow(rescheduleSuggestions.plan.id)}>Move plan to tomorrow</button></> : <p>No lower-priority task is scheduled today to reschedule. Review Today’s Tasks and adjust the plan manually.</p>}
          </div>}
        </section>
      </div>
      <section className="panel chapter-intelligence-panel">
        <div className="panel-heading"><div><span className="eyebrow">CHAPTER DATABASE · TRACKER + SOURCED EVIDENCE</span><h3>Chapter intelligence</h3></div><span className="activity-summary">{intelligenceChapters.length} tracked chapters</span></div>
        <p className="panel-note">Only chapters already present in your tracker appear here. Syllabus labels, historical question counts, prerequisites and source citations are editable records; entries without an independently verified source are clearly marked. No frequency or predicted weightage is supplied by default.</p>
        <div className="chapter-intelligence-list">
          {chapterIntelligence.map(chapter => {
            const draft = evidenceDrafts[chapter.key] || {
              syllabusStatus: chapter.evidence.syllabusStatus,
              syllabusSource: chapter.evidence.syllabusSource,
              historicalCounts: chapter.evidence.historicalCounts.map(item => `${item.year}:${item.questions}`).join(', '),
              historicalSource: chapter.evidence.historicalSource,
              prerequisites: chapter.evidence.prerequisites.join(', '),
              prerequisiteSource: chapter.evidence.prerequisiteSource,
            }
            const syllabusOfficial = isOfficialIatSource(chapter.evidence.syllabusSource)
            const historyOfficial = isOfficialIatSource(chapter.evidence.historicalSource)
            const historicalTotal = chapter.evidence.historicalCounts.reduce((sum, item) => sum + item.questions, 0)
            return <article className="chapter-intelligence-row" key={chapter.key}>
              <div className="chapter-intelligence-heading"><div><span className="eyebrow">{chapter.subject}</span><h4>{chapter.chapter}</h4><p>{chapter.tasks.length} linked tracker task{chapter.tasks.length === 1 ? '' : 's'} · {chapter.tasks.filter(task => task.status === 'Completed').length} completed</p></div>
                <span className="confidence-badge">Historical confidence: {chapter.historicalConfidence}</span></div>
              <div className="chapter-evidence-grid">
                <div><span>IAT 2026 chapter mapping</span><strong>{chapter.evidence.syllabusStatus === 'unverified' ? 'Not mapped to official PDF' : `${chapter.evidence.syllabusStatus === 'included' ? 'Marked as listed' : 'Marked as not listed'}${syllabusOfficial ? ' · official domain entered; content not checked' : ' · source not verified as official'}`}</strong>{chapter.evidence.syllabusSource && <small>{chapter.evidence.syllabusSource}</small>}</div>
                <div><span>Historical paper analysis</span><strong>{chapter.evidence.historicalCounts.length ? `${historicalTotal} manually entered questions · years ${chapter.evidence.historicalCounts.map(item => item.year).join(', ')}` : 'Unavailable · no PYQ counts entered'}</strong>{chapter.evidence.historicalSource && <small>{historyOfficial ? 'Official IAT portal domain entered; source not independently checked' : 'Source not verified as official'} · {chapter.evidence.historicalSource}</small>}</div>
                <div><span>Prerequisites</span><strong>{chapter.evidence.prerequisites.length ? chapter.evidence.prerequisites.join(', ') : 'Not verified'}</strong>{chapter.evidence.prerequisiteSource && <small>{chapter.evidence.prerequisiteSource}</small>}</div>
                <div><span>Your practice performance</span><strong>{chapter.accuracy === null ? 'No practice result recorded' : `${Math.round(chapter.accuracy * 100)}% · ${chapter.correct}/${chapter.attempted} correct`}</strong><small>{chapter.assessments.length} recorded practice set{chapter.assessments.length === 1 ? '' : 's'}</small></div>
              </div>
              {chapter.assessments.length > 0 && <div className="chapter-assessment-history">{chapter.assessments.slice(-3).reverse().map(assessment => <span key={assessment.id}>{assessment.label} · {formatDate(assessment.date)} · {assessment.correct}/{assessment.attempted}</span>)}</div>}
              <details className="chapter-evidence-editor">
                <summary>Update this chapter’s evidence record</summary>
                <div className="intelligence-form-grid">
                  <label className="field">IAT 2026 syllabus mapping<select value={draft.syllabusStatus} onChange={event => setEvidenceDrafts(previous => ({ ...previous, [chapter.key]: { ...draft, syllabusStatus: event.target.value as ChapterEvidence['syllabusStatus'] } }))}><option value="unverified">Not mapped</option><option value="included">Listed in official PDF</option><option value="not-listed">Not listed in official PDF</option></select></label>
                  <label className="field">Syllabus source URL<input value={draft.syllabusSource} onChange={event => setEvidenceDrafts(previous => ({ ...previous, [chapter.key]: { ...draft, syllabusSource: event.target.value } }))} placeholder={officialIatSource.syllabusPdfUrl} /></label>
                  <label className="field">PYQ question counts by year<input value={draft.historicalCounts} onChange={event => setEvidenceDrafts(previous => ({ ...previous, [chapter.key]: { ...draft, historicalCounts: event.target.value } }))} placeholder="e.g. 2024:2, 2025:1" /></label>
                  <label className="field">PYQ source URL<input value={draft.historicalSource} onChange={event => setEvidenceDrafts(previous => ({ ...previous, [chapter.key]: { ...draft, historicalSource: event.target.value } }))} placeholder="Paper / answer key source URL" /></label>
                  <label className="field">Prerequisites (comma separated)<input value={draft.prerequisites} onChange={event => setEvidenceDrafts(previous => ({ ...previous, [chapter.key]: { ...draft, prerequisites: event.target.value } }))} placeholder="Only enter supported prerequisites" /></label>
                  <label className="field">Prerequisite source<input value={draft.prerequisiteSource} onChange={event => setEvidenceDrafts(previous => ({ ...previous, [chapter.key]: { ...draft, prerequisiteSource: event.target.value } }))} placeholder="Source or basis" /></label>
                </div>
                <p className="panel-note">A URL is stored as a citation only. Domain checks are shown, but source content and question counts are not independently validated.</p>
                <button className="button button-ghost" onClick={() => saveChapterEvidence(chapter.tasks[0], chapter.key)}>Save evidence record</button>
              </details>
            </article>
          })}
          {!chapterIntelligence.length && <div className="empty-state"><span>▧</span><strong>Your chapter database is empty</strong><p>Add tasks with subject and chapter details to populate the database from the tracker. New chapters are not inferred from unverified sources.</p><button className="button button-ghost" onClick={() => setPage('Today’s Tasks')}>Add a chapter task</button></div>}
        </div>
      </section>
    </>
  )

  const examFeaturePage = (() => {
    const feature = examIntelligencePages.find(item => item.page === page)
    if (!feature || feature.page === 'AI Exam Analyst') return examIntelligencePage
    return (
      <>
        {pageHeader('EXAM INTELLIGENCE · UPCOMING', feature.label, 'This exam intelligence module is planned and is not active yet.', <span className="integration-status">{feature.status}</span>)}
        {examIntelligenceTabs}
        <section className="panel exam-feature-placeholder">
          <span className="exam-feature-icon">{feature.icon}</span>
          <div>
            <span className="eyebrow">MODULE STATUS</span>
            <h2>{feature.label} is in progress</h2>
            <p>{feature.page === 'Exam Trend Explorer'
              ? 'This module will explore chapter-wise IAT paper trends only after verified previous-year papers and answer keys are added with their years and sources.'
              : feature.page === 'Prerequisites'
                ? 'This module will present prerequisite links between syllabus topics after those relationships are sourced and reviewed.'
                : 'This module will build a sequenced study path from verified syllabus coverage and your tracked progress.'}</p>
            <p className="panel-note">No syllabus importance, question trends, or topic relationships are being inferred in this placeholder.</p>
            <button className="button button-ghost" onClick={() => setPage('AI Exam Analyst')}>← Back to AI Exam Analyst</button>
          </div>
        </section>
      </>
    )
  })()

  const syllabusPage = (
    <>
      {pageHeader('YOUR LEARNING MAP', 'Syllabus', 'Map your exam prep, subject by subject.', <span className="coming-badge">Planned</span>)}
      {profileControls}
      <section className="syllabus-intro"><span className="syllabus-symbol">✧</span><div><h2>Chapter tracking is on the way.</h2><p>Planned tools include chapter notes, checkpoints, formulas, examples and practice tracking.</p></div></section>
      <div className="subject-cards">{(profile.stream === 'PCM' ? subjects.filter(s => s !== 'Biology') : profile.stream === 'PCB' ? subjects.filter(s => s !== 'Mathematics') : subjects).map((subject, i) => <div className="subject-card" key={subject}><span className={`subject-icon subject-${i}`}>{['∿', '⚗', '∑', '⌬'][subjects.indexOf(subject)]}</span><h3>{subject}</h3><p>Chapter blocks will live here.</p><span className="tag">Coming next</span></div>)}</div>
    </>
  )

  const settingsPage = (
    <>
      {pageHeader('MAKE IT YOURS', 'Settings', 'Set up a study space that feels right for you.')}
      <section className="panel appearance-panel">
        <div className="panel-heading"><div><span className="eyebrow">MAKE YOUR SPACE YOURS</span><h3>Appearance</h3></div><span className="appearance-preview" aria-hidden="true">{settings.theme === 'dark' ? '☾' : '☀'}</span></div>
        <div className="appearance-setting">
          <div><strong>Dark mode</strong><p>Give Zenora a softer, starry look while keeping its calm blue and lavender accents.</p></div>
          <button
            type="button"
            className={`theme-toggle${settings.theme === 'dark' ? ' theme-toggle-on' : ''}`}
            role="switch"
            aria-checked={settings.theme === 'dark'}
            aria-label="Dark mode"
            onClick={() => setSettings(previous => ({ ...previous, theme: previous.theme === 'dark' ? 'light' : 'dark' }))}
          ><span /></button>
        </div>
        <p className="appearance-status" aria-live="polite">{settings.theme === 'dark' ? 'Dark mode is on' : 'Light mode is on'}</p>
        <div className="reading-tone-setting">
          <div className="reading-tone-heading"><div><strong>Reading tone</strong><p>Adjust the screen from neutral to warm, like an e-reader’s night light.</p></div><span>{settings.readingTone}%</span></div>
          <div className="reading-tone-control">
            <span aria-hidden="true">◐</span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={settings.readingTone}
              aria-label="Reading tone"
              aria-valuetext={`${settings.readingTone}% warm`}
              onChange={event => setSettings(previous => ({ ...previous, readingTone: Number(event.target.value) }))}
            />
            <span aria-hidden="true">☼</span>
          </div>
          <div className="reading-tone-labels"><span>Neutral</span><span>Warm</span></div>
        </div>
      </section>
      <section className="panel settings-panel"><div className="panel-heading"><div><span className="eyebrow">YOUR PROFILE</span><h3>Study preferences</h3></div></div>{profileControls}
        <div className="settings-grid"><label className="field">Planning start date<input type="date" value={profile.planningStart} onChange={e => updateProfile('planningStart', e.target.value)} /></label><div className="fixed-goal-note"><strong>Daily streak goal</strong><span>45 minutes of recorded study time</span><small>This fixed goal is separate from your focus timer duration.</small></div></div>
      </section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">DATA & PRIVACY</span><h3>Your data stays in this browser</h3></div><span className="tag tag-green">Local storage</span></div><p className="panel-note">Your tasks, study logs, revisions, preferences and exam records are saved in this browser. Clearing browser data may remove them, so export a backup to keep a copy.</p><div className="settings-actions"><button className="button button-ghost" onClick={() => {
        const data = { exportedAt: new Date().toISOString(), tasks, logs, revisions, planned, streakDays, profile, settings, dailyStudyLogNotes: dailyLogNotes, examIntelligence: examDatabase }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `zenora-backup-${today}.json`
        anchor.click()
        URL.revokeObjectURL(url)
        setNotice('Backup export started.')
      }}>↓ Export backup</button><button className="button button-ghost" onClick={() => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json,application/json'
        input.onchange = async () => {
          const file = input.files?.[0]
          if (!file) return
          try {
            const data = JSON.parse(await file.text())
            if (!Array.isArray(data.tasks) || !Array.isArray(data.logs)) throw new Error('Invalid backup')
            if (!window.confirm('Import this backup and replace the current Zenora data?')) return
            setTasks(data.tasks.map(normalizeTask))
            setLogs(data.logs)
            setRevisions(Array.isArray(data.revisions) ? data.revisions : [])
            setPlanned(Array.isArray(data.planned) ? data.planned : [])
            setStreakDays(Array.isArray(data.streakDays) ? data.streakDays : [])
            if (data.profile) setProfile({ ...defaultProfile, ...data.profile })
            if (data.settings) setSettings({
              ...data.settings,
              dailyGoal: DAILY_STREAK_GOAL,
              theme: data.settings.theme === 'dark' ? 'dark' : 'light',
              readingTone: typeof data.settings.readingTone === 'number'
                ? Math.min(100, Math.max(0, data.settings.readingTone))
                : 0,
            })
            if (data.dailyStudyLogNotes) setDailyLogNotes(data.dailyStudyLogNotes)
            if (data.examIntelligence) setExamDatabase(normalizeExamIntelligenceDatabase(data.examIntelligence))
            setNotice('Backup imported.')
          } catch {
            setNotice('That file could not be imported as a Zenora backup.')
          }
        }
        input.click()
      }}>↑ Import backup</button></div></section>
    </>
  )

  const renderPage = () => {
    switch (page) {
      case 'Dashboard': return dashboard
      case 'Today’s Tasks': return tasksPage
      case 'Weekly Planner': return weeklyPage
      case 'Syllabus': return syllabusPage
      case 'Exam Intelligence':
      case 'AI Exam Analyst': return examIntelligencePage
      case 'Exam Trend Explorer':
      case 'Prerequisites':
      case 'Learning Paths': return examFeaturePage
      case 'Revision': return revisionPage
      case 'Performance': return performancePage
      case 'Settings': return settingsPage
      default: return dashboard
    }
  }

  return (
    <div className="app-shell" data-theme={settings.theme === 'dark' ? 'dark' : 'light'}>
      <span
        className="reading-tone-overlay"
        aria-hidden="true"
        style={{ opacity: settings.readingTone / 100 * 0.2 }}
      />
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">Z</span><div><strong>zenora</strong><small>YOUR RESEARCH DESK</small></div></div>
        <div className="sidebar-profile"><span className="avatar">Z</span><div><strong>{profile.stage}</strong><span>{profile.stream} · {profile.exam}</span></div><span className="profile-dot" /></div>
        <span className="nav-label">WORKSPACE</span>
        <nav className="side-nav">{initialPageList.map(item => <button key={item} className={`nav-item ${page === item || (item === 'Exam Intelligence' && examIntelligencePages.some(feature => feature.page === page)) ? 'nav-active' : ''}`} onClick={() => setPage(item)}><span className="nav-icon">{icons[item]}</span><span>{item}</span>{item === 'Syllabus' && <span className="nav-coming">Soon</span>}{item === 'Revision' && overdueRevisions.length + dueRevisions.length > 0 && <span className="nav-count">{overdueRevisions.length + dueRevisions.length}</span>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="sidebar-goal"><span>✦</span><div><strong>{Math.min(100, Math.round(todayMinutes / DAILY_STREAK_GOAL * 100))}% of daily goal</strong><div className="mini-track"><span style={{ width: `${Math.min(100, todayMinutes / DAILY_STREAK_GOAL * 100)}%` }} /></div><small>{formatMinutes(todayMinutes)} of {DAILY_STREAK_GOAL} min</small></div></div></div>
      </aside>
      <main className="main-content">
        <div className="mobile-topbar"><div className="brand"><span className="brand-mark">Z</span><strong>zenora</strong></div><span className="date-pill">{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span></div>
        <nav className="mobile-nav">{initialPageList.map(item => <button key={item} className={page === item || (item === 'Exam Intelligence' && examIntelligencePages.some(feature => feature.page === page)) ? 'mobile-nav-active' : ''} onClick={() => setPage(item)}>{icons[item]} <span>{item}</span></button>)}</nav>
        <div className="content-inner">{renderPage()}</div>
        <footer className="main-footer"><span>ZENORA · IAT 2027 RESEARCH DESK</span></footer>
      </main>
      {notice && <button className="notice-toast" onClick={() => setNotice('')}>{notice} <span>×</span></button>}
    </div>
  )
}

export default App