export type IntelligenceSubject = 'Physics' | 'Chemistry' | 'Mathematics' | 'Biology'

export type ChapterEvidence = {
  syllabusStatus: 'unverified' | 'included' | 'not-listed'
  syllabusSource: string
  historicalCounts: { year: number; questions: number }[]
  historicalSource: string
  prerequisites: string[]
  prerequisiteSource: string
}

export type PracticeAssessment = {
  id: string
  taskId: string
  subject: IntelligenceSubject
  chapter: string
  date: string
  label: string
  attempted: number
  correct: number
}

export type ExamIntelligenceDatabase = {
  version: 1
  availableMinutesPerDay: number
  chapterEvidence: Record<string, ChapterEvidence>
  assessments: PracticeAssessment[]
}

export const EXAM_INTELLIGENCE_KEY = 'orbit-exam-intelligence-db-v1'

export const examIntegrations = [
  { name: 'IAT 2027', status: 'Active', active: true },
  { name: 'JEE Main + Advanced', status: 'In Progress', active: false },
  { name: 'NEET UG', status: 'In Progress', active: false },
  { name: 'NEST 2027', status: 'In Progress', active: false },
] as const

export const officialIatSource = {
  label: 'IAT 2026 official syllabus page',
  url: 'https://www.iiseradmission.in/pages/admission/syllabus.html',
  syllabusPdfUrl: 'https://www.iiseradmission.in/assets/pdfs/IISER_Aptitude_Test_Syllabus_2026.pdf',
  examPatternUrl: 'https://www.iiseradmission.in/pages/admission/iat.html',
  reviewedCycle: 'IAT 2026',
  note: 'The official page states IAT 2026 broadly follows the rationalized NCERT syllabus for 2025–2026 and links the detailed syllabus PDF. The 2026 document is a reference, not a guarantee of the IAT 2027 syllabus.',
}

export const emptyChapterEvidence = (): ChapterEvidence => ({
  syllabusStatus: 'unverified',
  syllabusSource: '',
  historicalCounts: [],
  historicalSource: '',
  prerequisites: [],
  prerequisiteSource: '',
})

export const emptyExamIntelligenceDatabase = (): ExamIntelligenceDatabase => ({
  version: 1,
  availableMinutesPerDay: 180,
  chapterEvidence: {},
  assessments: [],
})

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const isSyllabusStatus = (value: unknown): value is ChapterEvidence['syllabusStatus'] =>
  value === 'unverified' || value === 'included' || value === 'not-listed'

const isIntelligenceSubject = (value: unknown): value is IntelligenceSubject =>
  value === 'Physics' || value === 'Chemistry' || value === 'Mathematics' || value === 'Biology'

export const normalizeExamIntelligenceDatabase = (value: unknown): ExamIntelligenceDatabase => {
  const fallback = emptyExamIntelligenceDatabase()
  if (!isObject(value)) return fallback
  const record = value as Partial<ExamIntelligenceDatabase>
  const chapterEvidence = isObject(record.chapterEvidence)
    ? Object.fromEntries(Object.entries(record.chapterEvidence).flatMap(([key, evidence]) => {
      if (!isObject(evidence)) return []
      const item = evidence as Partial<ChapterEvidence>
      const historicalCounts = Array.isArray(item.historicalCounts) ? item.historicalCounts.flatMap(count => {
        if (!isObject(count)) return []
        const year = count.year
        const questions = count.questions
        return Number.isInteger(year) && Number(year) > 1900 && Number.isInteger(questions) && Number(questions) >= 0
          ? [{ year: Number(year), questions: Number(questions) }]
          : []
      }) : []
      return [[key, {
        syllabusStatus: isSyllabusStatus(item.syllabusStatus) ? item.syllabusStatus : 'unverified',
        syllabusSource: typeof item.syllabusSource === 'string' ? item.syllabusSource : '',
        historicalCounts,
        historicalSource: typeof item.historicalSource === 'string' ? item.historicalSource : '',
        prerequisites: Array.isArray(item.prerequisites) ? item.prerequisites.filter(topic => typeof topic === 'string') : [],
        prerequisiteSource: typeof item.prerequisiteSource === 'string' ? item.prerequisiteSource : '',
      }]]
    }))
    : {}
  const assessments = Array.isArray(record.assessments) ? record.assessments.flatMap(value => {
    if (!isObject(value)) return []
    const item = value as Partial<PracticeAssessment>
    if (
      typeof item.id !== 'string' || typeof item.taskId !== 'string' || !isIntelligenceSubject(item.subject) ||
      typeof item.chapter !== 'string' || typeof item.date !== 'string' ||
      !Number.isInteger(item.attempted) || Number(item.attempted) < 1 ||
      !Number.isInteger(item.correct) || Number(item.correct) < 0 || Number(item.correct) > Number(item.attempted)
    ) return []
    return [{
      id: item.id,
      taskId: item.taskId,
      subject: item.subject,
      chapter: item.chapter,
      date: item.date,
      label: typeof item.label === 'string' ? item.label : 'Practice set',
      attempted: Number(item.attempted),
      correct: Number(item.correct),
    }]
  }) : []
  return {
    version: 1,
    availableMinutesPerDay: typeof record.availableMinutesPerDay === 'number' && Number.isFinite(record.availableMinutesPerDay)
      ? Math.max(0, Math.round(record.availableMinutesPerDay))
      : fallback.availableMinutesPerDay,
    chapterEvidence,
    assessments,
  }
}

export const chapterKey = (subject: IntelligenceSubject, chapter: string) =>
  `${subject}::${chapter.trim().toLocaleLowerCase()}`

export const isOfficialIatSource = (source: string) => {
  try {
    return new URL(source).hostname === 'www.iiseradmission.in' || new URL(source).hostname === 'iiseradmission.in'
  } catch {
    return false
  }
}
