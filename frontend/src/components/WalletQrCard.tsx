import { useState } from 'react'
import { generateQrMatrix, QrMatrixSvg } from './QrMatrixSvg'

interface WalletQrCardProps {
  patient: {
    patient_code: string
    full_name: string
    age?: number | null
    sex?: string | null
    blood_group?: string | null
    contact?: string | null
    emergency_contact?: string | null
  }
}

export function WalletQrCard({ patient }: WalletQrCardProps) {
  const [downloading, setDownloading] = useState(false)

  async function handleDownloadCard() {
    setDownloading(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 1012
      canvas.height = 638
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // 1. Card Background
      ctx.fillStyle = '#0F172A' // Slate 900
      ctx.fillRect(0, 0, 1012, 638)

      // Gradient Header
      const grad = ctx.createLinearGradient(0, 0, 1012, 0)
      grad.addColorStop(0, '#047857') // Emerald 700
      grad.addColorStop(1, '#0284C7') // Sky 600
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, 1012, 130)

      // Header Text
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 36px Inter, sans-serif'
      ctx.fillText('SYNAPSEHEALTH EMERGENCY MEDICAL ID', 50, 75)

      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
      ctx.font = 'bold 20px Inter, sans-serif'
      ctx.fillText('PULSEVAULT AI • ZERO-LATENCY TRIAGE PASS', 50, 108)

      // White Card Body Container
      ctx.fillStyle = '#FFFFFF'
      ctx.roundRect(50, 160, 912, 420, 24)
      ctx.fill()

      // Patient Details
      ctx.fillStyle = '#0F172A'
      ctx.font = 'bold 38px Inter, sans-serif'
      ctx.fillText(patient.full_name || 'Emergency Patient', 80, 225)

      // Code Badge
      ctx.fillStyle = '#047857'
      ctx.roundRect(80, 245, 260, 42, 12)
      ctx.fill()
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 22px monospace'
      ctx.fillText(`ID: ${patient.patient_code}`, 98, 274)

      // Blood Group Pill
      if (patient.blood_group) {
        ctx.fillStyle = '#DC2626' // Rose 600
        ctx.roundRect(360, 245, 180, 42, 12)
        ctx.fill()
        ctx.fillStyle = '#FFFFFF'
        ctx.font = 'bold 22px Inter, sans-serif'
        ctx.fillText(`🩸 ${patient.blood_group}`, 378, 274)
      }

      // Demographic Info
      ctx.fillStyle = '#475569'
      ctx.font = '22px Inter, sans-serif'
      const ageSex = `${patient.age ? `${patient.age} yrs` : ''} ${patient.sex ? `• ${patient.sex}` : ''}`
      ctx.fillText(ageSex, 80, 330)

      ctx.font = '20px Inter, sans-serif'
      ctx.fillText(`Primary Contact: ${patient.contact || 'N/A'}`, 80, 370)

      // Emergency Contact Box
      ctx.fillStyle = '#FFFBEB' // Amber 50
      ctx.roundRect(80, 410, 520, 90, 14)
      ctx.fill()
      ctx.strokeStyle = '#FDE68A'
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.fillStyle = '#92400E' // Amber 800
      ctx.font = 'bold 18px Inter, sans-serif'
      ctx.fillText('🚨 EMERGENCY CONTACT:', 100, 442)
      ctx.fillStyle = '#1E293B'
      ctx.font = '20px Inter, sans-serif'
      ctx.fillText(patient.emergency_contact || 'None registered', 100, 478)

      // Footer disclaimer
      ctx.fillStyle = '#94A3B8'
      ctx.font = 'bold 15px Inter, sans-serif'
      ctx.fillText('IN AN EMERGENCY: SCAN QR CODE AT TRIAGE FOR INSTANT SUB-4MS FLASHCARD ACCESS', 80, 545)

      // 100% Offline Vector QR Rendering onto Canvas
      const modules = generateQrMatrix(patient.patient_code)
      const qrBoxSize = 220
      const qrStartX = 685
      const qrStartY = 210
      const pad = 2
      const totalGrid = modules.length + pad * 2
      const cellSize = qrBoxSize / totalGrid

      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(qrStartX - 8, qrStartY - 8, qrBoxSize + 16, qrBoxSize + 16)
      ctx.strokeStyle = '#E2E8F0'
      ctx.lineWidth = 3
      ctx.strokeRect(qrStartX - 8, qrStartY - 8, qrBoxSize + 16, qrBoxSize + 16)

      ctx.fillStyle = '#0F172A'
      modules.forEach((row, r) => {
        row.forEach((cell, c) => {
          if (cell) {
            ctx.fillRect(
              qrStartX + (c + pad) * cellSize,
              qrStartY + (r + pad) * cellSize,
              cellSize + 0.5,
              cellSize + 0.5,
            )
          }
        })
      })

      // Download PNG
      const dataUrl = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${patient.patient_code}_Emergency_Wallet_Card.png`
      a.click()
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="rounded-2xl border-2 border-emerald-200/90 bg-gradient-to-br from-emerald-50/60 via-white to-teal-50/30 p-5 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white font-bold text-base shadow-xs">
            🪪
          </span>
          <div>
            <h3 className="text-sm font-black text-slate-900 tracking-tight">
              Patient Emergency Smart Wallet Card
            </h3>
            <p className="text-xs text-slate-500">
              Instant offline-generated medical ID pass for rapid hardware QR camera check-in at hospital triage.
            </p>
          </div>
        </div>

        <button
          onClick={handleDownloadCard}
          disabled={downloading}
          className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-4 py-2 text-xs font-bold text-white transition shadow-xs cursor-pointer"
        >
          <span>{downloading ? '⏳' : '📥'}</span>
          <span>{downloading ? 'Generating Card…' : 'Download Wallet Card (PNG)'}</span>
        </button>
      </div>

      {/* Visual Card Preview */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900 text-white p-5 rounded-2xl shadow-md border border-slate-800">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-lg font-black">{patient.full_name}</span>
            <span className="font-mono text-xs font-bold bg-emerald-600 px-2 py-0.5 rounded text-white">
              {patient.patient_code}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
            {patient.blood_group && (
              <span className="font-bold text-rose-400 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-800">
                🩸 {patient.blood_group}
              </span>
            )}
            <span>{patient.age} yrs</span>
            <span>•</span>
            <span>{patient.sex}</span>
            <span>•</span>
            <span>📞 {patient.contact || 'N/A'}</span>
          </div>

          <div className="text-[11px] text-amber-300 bg-amber-950/40 border border-amber-800/60 p-2 rounded-xl">
            🚨 Emergency Contact: <strong>{patient.emergency_contact || 'None registered'}</strong>
          </div>
        </div>

        {/* 100% Offline Vector QR Code Graphic */}
        <div className="shrink-0 bg-white p-2 rounded-xl shadow-lg border-2 border-emerald-400 text-center flex flex-col items-center">
          <QrMatrixSvg value={patient.patient_code} size={112} />
          <div className="text-[9px] font-mono font-bold text-slate-800 mt-1 uppercase tracking-wider">
            Offline Pass
          </div>
        </div>
      </div>
    </div>
  )
}
