import type { LabValue, PatientProfile } from '../api'
import { ageLabel, formatDate, labDisplay, medicationDose } from '../format'
import { CodeChip, Empty, Panel, Stat } from './Primitives'

const FLAG_TONE: Record<string, string> = {
  high: 'text-red-300',
  low: 'text-sky-300',
  normal: 'text-slate-300',
}

function LabRow({ lab }: { lab: LabValue }) {
  return (
    <tr className="border-t border-slate-800/70">
      <td className="py-2 pr-3">
        <div className="text-sm text-slate-200">{lab.test_name}</div>
        <div className="mt-0.5">
          <CodeChip code={lab.loinc_code} />
        </div>
      </td>
      <td className={`py-2 pr-3 text-right font-medium tabular-nums ${FLAG_TONE[(lab.flag ?? 'normal').toLowerCase()] ?? 'text-slate-300'}`}>
        {labDisplay(lab.value_text, lab.value, lab.unit)}
      </td>
      <td className="py-2 pr-3 text-right text-xs text-slate-500">{formatDate(lab.collected_date)}</td>
      <td className="py-2 text-right">
        {lab.flag && lab.flag.toLowerCase() !== 'normal' ? (
          <span className="chip border-slate-700 bg-slate-800 text-[11px] text-slate-300">
            {lab.flag}
          </span>
        ) : (
          <span className="text-xs text-slate-600">—</span>
        )}
      </td>
    </tr>
  )
}

/** Consolidated longitudinal record: demographics, entities, and provenance. */
export function ProfileView({ profile }: { profile: PatientProfile }) {
  const { patient } = profile

  return (
    <div className="space-y-4">
      <Panel title="Patient summary">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Patient" value={patient.full_name} />
          <Stat label="Code" value={<span className="font-mono text-sm">{patient.patient_code}</span>} />
          <Stat label="Age" value={ageLabel(patient.age)} />
          <Stat label="Sex" value={patient.sex ?? '—'} />
          <Stat label="Blood group" value={patient.blood_group ?? '—'} />
          <Stat label="Records" value={profile.record_count} />
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={`Conditions (${profile.conditions.length})`}>
          {profile.conditions.length === 0 ? (
            <Empty>No conditions extracted.</Empty>
          ) : (
            <ul className="space-y-2">
              {profile.conditions.map((condition, index) => (
                <li
                  key={`${condition.name}-${index}`}
                  className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-100">{condition.name}</span>
                    <div className="flex items-center gap-1.5">
                      <CodeChip code={condition.icd10_code} />
                      <span
                        className={`chip ${
                          condition.status === 'resolved'
                            ? 'border-slate-700 bg-slate-800 text-slate-400'
                            : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                        }`}
                      >
                        {condition.status ?? 'active'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                    <span>Onset {formatDate(condition.onset_date)}</span>
                    {condition.resolved_date ? (
                      <span>Resolved {formatDate(condition.resolved_date)}</span>
                    ) : null}
                    {condition.is_chronic ? <span className="text-slate-400">Chronic</span> : null}
                    {condition.source_document_id ? (
                      <span className="font-mono">src #{condition.source_document_id}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`Medications (${profile.medications.length})`}>
          {profile.medications.length === 0 ? (
            <Empty>No medications extracted.</Empty>
          ) : (
            <ul className="space-y-2">
              {profile.medications.map((medication, index) => (
                <li
                  key={`${medication.name}-${index}`}
                  className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-100">{medication.name}</span>
                    <div className="flex items-center gap-1.5">
                      <CodeChip code={medication.rxnorm_code} />
                      <span
                        className={`chip ${
                          medication.status === 'stopped' || medication.status === 'completed'
                            ? 'border-slate-700 bg-slate-800 text-slate-400'
                            : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                        }`}
                      >
                        {medication.status ?? 'active'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                    <span>{medicationDose(medication.dose, medication.dose_unit, medication.frequency)}</span>
                    {medication.route ? <span>{medication.route}</span> : null}
                    <span>Since {formatDate(medication.start_date)}</span>
                    {medication.source_document_id ? (
                      <span className="font-mono">src #{medication.source_document_id}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`Allergies (${profile.allergies.length})`}>
          {profile.allergies.length === 0 ? (
            <Empty>No known allergies.</Empty>
          ) : (
            <ul className="space-y-2">
              {profile.allergies.map((allergy, index) => (
                <li
                  key={`${allergy.substance}-${index}`}
                  className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-amber-100">{allergy.substance}</span>
                    <CodeChip code={allergy.snomed_code} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                    {allergy.reaction ? <span>Reaction: {allergy.reaction}</span> : null}
                    {allergy.severity ? <span>Severity: {allergy.severity}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Procedures, implants & documents">
          <div className="space-y-4">
            <div>
              <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                Procedures
              </h3>
              {profile.procedures.length === 0 ? (
                <Empty>None recorded.</Empty>
              ) : (
                <ul className="space-y-1.5">
                  {profile.procedures.map((procedure, index) => (
                    <li
                      key={`${procedure.name}-${index}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                    >
                      <span className="text-slate-200">
                        {procedure.name}
                        {procedure.outcome ? (
                          <span className="text-slate-500"> — {procedure.outcome}</span>
                        ) : null}
                      </span>
                      <span className="text-xs text-slate-500">
                        {formatDate(procedure.performed_date)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                Implants & devices
              </h3>
              {profile.implants.length === 0 ? (
                <Empty>None recorded.</Empty>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {profile.implants.map((implant, index) => (
                    <li
                      key={`${implant.name}-${index}`}
                      className="chip border-purple-500/40 bg-purple-500/10 text-purple-200"
                    >
                      {implant.name}
                      <span className="text-purple-300/60">
                        {formatDate(implant.implanted_date)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                Source records ({profile.documents.length})
              </h3>
              <ul className="space-y-1.5">
                {profile.documents.map((document) => (
                  <li key={document.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="truncate text-slate-300">{document.filename}</span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {document.doc_type ?? 'unknown type'} · {document.page_count ?? '?'} pp ·{' '}
                      {document.extraction_method ?? 'n/a'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title={`Laboratory values (${profile.lab_values.length})`}>
        {profile.lab_values.length === 0 ? (
          <Empty>No laboratory values extracted.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] tracking-wide text-slate-500 uppercase">
                  <th className="pb-2">Test</th>
                  <th className="pb-2 pr-3 text-right">Result</th>
                  <th className="pb-2 pr-3 text-right">Collected</th>
                  <th className="pb-2 text-right">Flag</th>
                </tr>
              </thead>
              <tbody>
                {profile.lab_values.map((lab, index) => (
                  <LabRow key={`${lab.test_name}-${index}`} lab={lab} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
