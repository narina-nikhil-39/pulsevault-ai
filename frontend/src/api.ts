/**
 * Typed client for the SynapseHealth FastAPI gateway.
 *
 * Every request goes to a same-origin `/api` path, which Vite proxies to the local FastAPI
 * server. No model provider credential exists on this side of the wire: vision-model calls
 * are made by the gateway, never from the browser.
 */

const BASE = '/api'

const TOKEN_KEY = 'synapsehealth.token'
const DOCTOR_KEY = 'synapsehealth.doctor'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** FastAPI returns problem details as `{ detail: string | Record<string, unknown> }`. */
async function toApiError(response: Response): Promise<ApiError> {
  let message = `${response.status} ${response.statusText}`
  try {
    const body = (await response.json()) as { detail?: unknown }
    if (typeof body.detail === 'string') {
      message = body.detail
    } else if (body.detail) {
      message = JSON.stringify(body.detail)
    }
  } catch {
    // A non-JSON error body is not worth surfacing verbatim; keep the status line.
  }
  return new ApiError(response.status, message)
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: BodyInit
  json?: unknown
  auth?: boolean
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, json, auth = true } = options

  const headers: Record<string, string> = {}
  if (auth) {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  }
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : body,
  })

  if (!response.ok) {
    throw await toApiError(response)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

export interface Session {
  access_token: string
  token_type: string
  doctor_id: string
  display_name: string
  role: string
  expires_in: number
}

export function saveSession(session: Session): void {
  localStorage.setItem(TOKEN_KEY, session.access_token)
  localStorage.setItem(
    DOCTOR_KEY,
    JSON.stringify({
      doctor_id: session.doctor_id,
      display_name: session.display_name,
      role: session.role,
    }),
  )
}

export function loadSession(): Omit<Session, 'access_token' | 'token_type' | 'expires_in'> | null {
  const raw = localStorage.getItem(DOCTOR_KEY)
  const token = localStorage.getItem(TOKEN_KEY)
  if (!raw || !token) {
    return null
  }
  try {
    return JSON.parse(raw) as Omit<Session, 'access_token' | 'token_type' | 'expires_in'>
  } catch {
    clearSession()
    return null
  }
}

export function hasToken(): boolean {
  return localStorage.getItem(TOKEN_KEY) !== null
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(DOCTOR_KEY)
}

/* ------------------------------------------------------------------ contracts */

export interface LoginResponse {
  access_token: string
  token_type: string
  doctor_id: string
  display_name: string
  role: string
  expires_in: number
}

export interface PatientSummary {
  patient_code: string
  full_name: string
  age: number | null
  sex: string | null
  blood_group: string | null
  record_count: number
  critical_alert_count: number
}

export interface PipelineStep {
  key: string
  label: string
  status: string
  detail: string | null
}

export interface PipelineResult {
  document_id: number
  patient_code: string
  document_type: string
  steps: PipelineStep[]
  entities_extracted: number
  normalized_count: number
  safety_alerts: number
  critical_alerts: number
  warnings: string[]
  flashcard: Record<string, unknown> | null
}

export interface UploadResponse {
  document_id: number
  patient_code: string
  filename: string
  status: string
  message: string
}

export interface AuditEvent {
  id: number
  actor: string
  action: string
  resource_type: string | null
  resource_id: string | null
  detail: Record<string, unknown>
  created_at: string | null
}

/** Every persisted entity carries its provenance back to the source document and span. */
export interface Sourced {
  source_document_id: number | null
  source_span: string | null
  source_confidence: number | null
}

export interface PatientRef {
  id: number
  patient_code: string
  full_name: string
  age: number | null
  sex: string | null
  blood_group: string | null
  contact: string | null
}

export interface Condition extends Sourced {
  name: string
  icd10_code: string | null
  status: string | null
  is_chronic: boolean | null
  onset_date: string | null
  resolved_date: string | null
}

export interface Medication extends Sourced {
  name: string
  rxnorm_code: string | null
  dose: number | null
  dose_unit: string | null
  frequency: string | null
  route: string | null
  start_date: string | null
  status: string | null
}

export interface Allergy extends Sourced {
  substance: string
  snomed_code: string | null
  reaction: string | null
  severity: string | null
}

export interface Procedure extends Sourced {
  name: string
  snomed_code: string | null
  performed_date: string | null
  outcome: string | null
}

export interface Implant extends Sourced {
  name: string
  implanted_date: string | null
}

export interface LabValue extends Sourced {
  test_name: string
  loinc_code: string | null
  value: number | null
  value_text: string | null
  unit: string | null
  collected_date: string | null
  flag: string | null
}

export interface SafetyAlert {
  id: number
  severity: string
  category: string
  title: string
  detail: string
  involved: string[]
  recommendation: string
}

export interface SourceDocument extends Sourced {
  id: number
  filename: string
  doc_type: string | null
  page_count: number | null
  extraction_method: string | null
  processed_at: string | null
}

export interface TimelineEntry {
  date: string | null
  year: number | null
  kind: string
  label: string
  detail: string | null
  code: string | null
  chronic: boolean | null
  source_document_id: number | null
  source_span: string | null
}

export interface PatientProfile {
  patient: PatientRef
  record_count: number
  conditions: Condition[]
  active_conditions: Condition[]
  medications: Medication[]
  allergies: Allergy[]
  procedures: Procedure[]
  implants: Implant[]
  lab_values: LabValue[]
  safety_alerts: SafetyAlert[]
  documents: SourceDocument[]
  timeline: TimelineEntry[]
}

export interface FlashcardBadge {
  label: string
  value: string
  severity: string
  detail: string
}

export interface FlashcardRetrieval {
  cache_hit: boolean
  elapsed_ms: number
  target_ms: number
}

export interface Flashcard {
  patient_code: string
  full_name: string
  age: number | null
  sex: string | null
  badges: FlashcardBadge[]
  critical_conditions: string[]
  active_medications: Record<string, unknown>[]
  severe_allergies: Record<string, unknown>[]
  implants: string[]
  top_alerts: Record<string, unknown>[]
  record_count: number
  version: number
  computed_at: string | null
  retrieval: FlashcardRetrieval
}

/* ------------------------------------------------------------------ endpoints */

export function login(doctorId: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    json: { doctor_id: doctorId, password },
    auth: false,
  })
}

export function searchPatients(query: string): Promise<PatientSummary[]> {
  const params = new URLSearchParams({ search: query })
  return request<PatientSummary[]>(`/patients?${params.toString()}`)
}

export function fetchProfile(patientCode: string): Promise<PatientProfile> {
  return request<PatientProfile>(`/patients/${encodeURIComponent(patientCode)}/profile`)
}

export function fetchFlashcard(patientCode: string): Promise<Flashcard> {
  return request<Flashcard>(`/patients/${encodeURIComponent(patientCode)}/flashcard`)
}

export function fetchAudit(patientCode: string): Promise<AuditEvent[]> {
  return request<AuditEvent[]>(`/patients/${encodeURIComponent(patientCode)}/audit`)
}

export function fetchPipeline(documentId: number): Promise<PipelineResult> {
  return request<PipelineResult>(`/pipeline/${documentId}`)
}

export function uploadRecord(
  file: File,
  patientCode: string,
  patientName: string,
): Promise<UploadResponse> {
  const form = new FormData()
  form.append('file', file)
  form.append('patient_code', patientCode)
  form.append('patient_name', patientName)
  return request<UploadResponse>('/records', { method: 'POST', body: form })
}
