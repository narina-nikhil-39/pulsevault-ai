/**
 * Typed client for the SynapseHealth FastAPI gateway.
 *
 * Every request goes to a same-origin `/api` path, which Vite proxies to the local FastAPI
 * server. No model provider credential exists on this side of the wire: vision-model calls
 * are made by the gateway, never from the browser.
 */

import { toastNotify } from './context/ToastContext'

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
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: BodyInit
  json?: unknown
  auth?: boolean
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, json, auth = true } = options

  // Pre-flight check for browser offline status
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    toastNotify({
      type: 'warning',
      title: 'Network Offline',
      message: 'Terminal is currently disconnected. Cannot execute network request.',
      duration: 5000,
    })
    throw new ApiError(0, 'Terminal is currently offline.')
  }

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

  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: json !== undefined ? JSON.stringify(json) : body,
    })
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err)
    toastNotify({
      type: 'error',
      title: 'Gateway Connection Failed',
      message: `Unable to reach hospital server: ${errMessage}`,
      duration: 6000,
    })
    throw new ApiError(0, `Network error: ${errMessage}`)
  }

  if (!response.ok) {
    const apiErr = await toApiError(response)

    // Contextual toasts for authentication, permissions, and server faults
    if (response.status === 401) {
      toastNotify({
        type: 'warning',
        title: 'Authentication Required (401)',
        message: 'Your clinical session has expired or requires re-authentication.',
        duration: 5000,
      })
    } else if (response.status === 403) {
      toastNotify({
        type: 'error',
        title: 'Access Denied (403)',
        message: apiErr.message || 'Permission boundary violation. Check clinical role scope.',
        duration: 6000,
      })
    } else if (response.status >= 500) {
      toastNotify({
        type: 'error',
        title: `Server Error (${response.status})`,
        message: apiErr.message || 'The clinical gateway encountered an internal exception.',
        duration: 7000,
      })
    }

    throw apiErr
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
  emergency_contact?: string | null
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
  uploaded_at?: string | null
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

export interface BreakGlassRequest {
  patient_code: string
  doctor_id: string
  doctor_password?: string
  nurse_cosigner_id: string
  nurse_password?: string
  clinical_reason_code: string
  justification_notes?: string
}

export interface BreakGlassResponse {
  access_token: string
  token_type: string
  scope: string
  expires_in: number
  patient_code: string
  doctor_id: string
  nurse_cosigner_id: string
  clinical_reason_code: string
  audit_block_hash: string
  message: string
}

export function breakGlassOverride(payload: BreakGlassRequest): Promise<BreakGlassResponse> {
  return request<BreakGlassResponse>('/emergency/break-glass', {
    method: 'POST',
    json: payload,
    auth: false,
  })
}

export function fetchFhirBundle(patientCode: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/patients/${encodeURIComponent(patientCode)}/fhir`)
}

export async function downloadFhirBundle(patientCode: string): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    toastNotify({
      type: 'warning',
      title: 'Network Offline',
      message: 'Terminal is currently disconnected. Cannot export FHIR bundle.',
      duration: 5000,
    })
    throw new ApiError(0, 'Terminal is currently offline.')
  }

  const token = localStorage.getItem(TOKEN_KEY)
  const headers: Record<string, string> = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(`${BASE}/patients/${encodeURIComponent(patientCode)}/fhir`, { headers })
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err)
    toastNotify({
      type: 'error',
      title: 'Gateway Connection Failed',
      message: `Unable to export FHIR bundle: ${errMessage}`,
      duration: 6000,
    })
    throw new ApiError(0, `Network error: ${errMessage}`)
  }

  if (!response.ok) {
    const err = await toApiError(response)
    toastNotify({
      type: 'error',
      title: `Export Error (${response.status})`,
      message: err.message || 'Failed to download FHIR bundle from gateway.',
      duration: 6000,
    })
    throw err
  }

  const blob = await response.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `fhir_${patientCode}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)

  toastNotify({
    type: 'success',
    title: 'FHIR Export Downloaded',
    message: `HL7 FHIR R4 Bundle downloaded for patient ${patientCode}.`,
    duration: 4000,
  })
}

export interface PortalPatientSummary {
  patient_code: string
  full_name: string
  age: number | null
  sex: string | null
  blood_group: string | null
  contact: string | null
  emergency_contact: string | null
}

export function fetchPortalPatients(): Promise<PortalPatientSummary[]> {
  return request<PortalPatientSummary[]>('/portal/patients', { auth: false })
}

export function fetchPortalProfile(patientCode: string): Promise<PatientProfile> {
  return request<PatientProfile>(`/portal/patients/${encodeURIComponent(patientCode)}`, { auth: false })
}

export function uploadPortalRecord(file: File, patientCode: string): Promise<UploadResponse> {
  const form = new FormData()
  form.append('file', file)
  form.append('patient_code', patientCode)
  return request<UploadResponse>('/portal/upload', {
    method: 'POST',
    body: form,
    auth: false,
  })
}

export interface AppointmentItem {
  id: number
  patient_code: string
  token_number: string
  patient_name: string
  department: string
  doctor_name: string
  scheduled_time: string
  status: string
  chief_complaint?: string | null
  created_at?: string | null
}

export function fetchReceptionQueue(): Promise<AppointmentItem[]> {
  return request<AppointmentItem[]>('/reception/queue', { auth: false })
}

export interface AppointmentCheckinPayload {
  patient_code: string
  patient_name: string
  department?: string
  doctor_name?: string
  scheduled_time?: string
  chief_complaint?: string
}

export interface AppointmentCheckinResult {
  id: number
  token_number: string
  patient_code: string
  patient_name: string
  visit_id: string
  scheduled_time: string
  status: string
  message: string
}

export function checkinReceptionQueue(payload: AppointmentCheckinPayload): Promise<AppointmentCheckinResult> {
  return request<AppointmentCheckinResult>('/reception/queue/checkin', {
    method: 'POST',
    json: payload,
    auth: false,
  })
}

export function updateQueueStatus(id: number, status: string): Promise<AppointmentItem> {
  return request<AppointmentItem>(`/reception/queue/${id}/status`, {
    method: 'PATCH',
    json: { status },
    auth: false,
  })
}

export interface PatientSearchResultItem {
  patient_code: string
  full_name: string
  age: number | null
  sex: string | null
  blood_group: string | null
  contact: string | null
  emergency_contact: string | null
  allergies: string[]
  chronic_conditions: string[]
  active_medications_count: number
  record_count: number
}

export function searchPatientDatabase(query: string): Promise<PatientSearchResultItem[]> {
  return request<PatientSearchResultItem[]>(`/patients/search?q=${encodeURIComponent(query)}`, { auth: false })
}

// =============================================================================
// Background Worker Jobs & Async Ingestion Client
// =============================================================================

export interface AsyncJobResponse {
  job_id: string
  document_id: number
  patient_code: string
  filename: string
  status: string
  status_url: string
  message: string
}

export interface JobStatusItem {
  job_id: string
  patient_code: string
  patient_name: string
  filename: string
  document_id: number | null
  status: string
  progress: number
  current_step: string
  steps: Array<{ key: string; label: string; status: string; detail?: string }>
  result: Record<string, unknown> | null
  error: string | null
  created_at: string
  completed_at: string | null
}

export async function uploadRecordAsync(
  file: File,
  patientCode: string,
  patientName: string,
): Promise<AsyncJobResponse> {
  const form = new FormData()
  form.append('file', file)
  form.append('patient_code', patientCode)
  form.append('patient_name', patientName)
  return request<AsyncJobResponse>('/records/async', { method: 'POST', body: form })
}

export async function uploadPortalRecordAsync(
  file: File,
  patientCode: string,
): Promise<AsyncJobResponse> {
  const form = new FormData()
  form.append('file', file)
  form.append('patient_code', patientCode)
  return request<AsyncJobResponse>('/portal/upload/async', { method: 'POST', body: form, auth: false })
}

export function getJobStatus(jobId: string): Promise<JobStatusItem> {
  return request<JobStatusItem>(`/jobs/${jobId}`, { auth: false })
}

export function listJobs(limit = 50): Promise<JobStatusItem[]> {
  return request<JobStatusItem[]>(`/jobs?limit=${limit}`, { auth: false })
}

// =============================================================================
// Production Neo4j Graph Database Adapter Client
// =============================================================================

export interface GraphCypherData {
  patient_code: string
  constraints: string[]
  statements: string[]
  cypher_script: string
  nodes_count: number
  edges_count: number
  metadata: Record<string, unknown>
}

export interface GraphSyncResult {
  patient_code: string
  status: string
  backend: string
  nodes_created: number
  relationships_created: number
  message: string
}

export interface GraphSubgraphData {
  patient_code: string
  nodes: Array<{ id: string; label: string; type: string; details: Record<string, unknown> }>
  links: Array<{ source: string; target: string; type: string; label: string; severity?: string; rule?: string }>
  total_nodes: number
  total_links: number
}

export function getPatientCypher(patientCode: string): Promise<GraphCypherData> {
  return request<GraphCypherData>(`/patients/${encodeURIComponent(patientCode)}/graph/cypher`)
}

export function syncPatientGraph(patientCode: string): Promise<GraphSyncResult> {
  return request<GraphSyncResult>(`/patients/${encodeURIComponent(patientCode)}/graph/sync`, { method: 'POST' })
}

export function getPatientSubgraph(patientCode: string): Promise<GraphSubgraphData> {
  return request<GraphSubgraphData>(`/patients/${encodeURIComponent(patientCode)}/graph/subgraph`)
}

// =============================================================================
// Native Qdrant Vector Search & Grounded Retrieval Client
// =============================================================================

export interface RagChunk {
  chunk_id: string
  document_id: number | null
  document_title: string | null
  patient_code: string
  page: number
  bbox: [number, number, number, number] | number[]
  text: string
  score: number
}

export interface RagQueryResponse {
  patient_code: string
  query: string
  answer: string
  results_count: number
  chunks: RagChunk[]
  backend: string
}

export function queryPatientRag(
  patientCode: string,
  query: string,
  topK = 5,
): Promise<RagQueryResponse> {
  return request<RagQueryResponse>(`/patients/${encodeURIComponent(patientCode)}/rag/query`, {
    method: 'POST',
    json: { query, top_k: topK },
  })
}
