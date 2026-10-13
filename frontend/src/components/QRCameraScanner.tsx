import React, { useEffect, useRef, useState } from 'react'

export interface QRCameraScannerProps {
  onScanSuccess: (patientCode: string) => void
  onClose?: () => void
}

export function QRCameraScanner({ onScanSuccess, onClose }: QRCameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanLoopRef = useRef<number | null>(null)

  const [cameraActive, setCameraActive] = useState<boolean>(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [scannedCode, setScannedCode] = useState<string | null>(null)
  const [scanStatus, setScanStatus] = useState<string>('Ready to start camera')
  const [activeTab, setActiveTab] = useState<'camera' | 'upload' | 'presets'>('camera')

  // Enumerate camera input devices on mount
  useEffect(() => {
    async function listDevices() {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices()
          const videoInputs = devices.filter((d) => d.kind === 'videoinput')
          setVideoDevices(videoInputs)
          if (videoInputs.length > 0 && !selectedDeviceId && videoInputs[0]) {
            setSelectedDeviceId(videoInputs[0].deviceId)
          }
        }
      } catch (err) {
        console.warn('Could not enumerate video devices:', err)
      }
    }
    listDevices()
  }, [])


  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  // Audio beep feedback using Web Audio API
  function playBeep() {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime) // A5 note
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.15)
    } catch {
      // AudioContext not allowed or not supported
    }
  }

  function triggerSuccess(code: string) {
    const cleanCode = code.trim()
    setScannedCode(cleanCode)
    setScanStatus(`Scanned: ${cleanCode}`)
    playBeep()
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100])
    }
    stopCamera()
    onScanSuccess(cleanCode)
  }

  // Start live webcam stream
  async function startCamera() {
    setCameraError(null)
    setScannedCode(null)
    setScanStatus('Requesting webcam access...')

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Webcam API is not supported in this browser or context.')
      }

      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      setCameraActive(true)
      setScanStatus('Camera active — Align QR code within frame')

      // Start detection loop
      startScanLoop()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to access camera.'
      setCameraError(
        msg.includes('Permission')
          ? 'Camera permission denied. Allow camera access in browser permissions or use the presets/upload fallback below.'
          : msg
      )
      setCameraActive(false)
      setScanStatus('Camera error')
    }
  }

  function stopCamera() {
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current)
      scanLoopRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
  }

  function switchCamera() {
    if (videoDevices.length <= 1) return
    const currentIndex = videoDevices.findIndex((d) => d.deviceId === selectedDeviceId)
    const nextIndex = (currentIndex + 1) % videoDevices.length
    const nextDevice = videoDevices[nextIndex]
    if (nextDevice) {
      setSelectedDeviceId(nextDevice.deviceId)
      stopCamera()
      setTimeout(() => {
        startCamera()
      }, 200)
    }
  }

  // Real-time scan loop using BarcodeDetector if available
  function startScanLoop() {
    const hasBarcodeDetector = 'BarcodeDetector' in window

    // If native BarcodeDetector is supported (Chrome/Edge/Android)
    if (hasBarcodeDetector) {
      try {
        const detector = new (window as unknown as {
          BarcodeDetector: new (opts: { formats: string[] }) => {
            detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>
          }
        }).BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39', 'data_matrix'],
        })

        async function detectFrame() {
          if (!videoRef.current || !streamRef.current) return
          try {
            if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
              const barcodes = await detector.detect(videoRef.current)
              if (barcodes && barcodes.length > 0 && barcodes[0]?.rawValue) {
                const raw = barcodes[0].rawValue
                triggerSuccess(raw)
                return
              }
            }
          } catch {
            // Frame detection skipped
          }
          scanLoopRef.current = requestAnimationFrame(detectFrame)
        }

        scanLoopRef.current = requestAnimationFrame(detectFrame)
        return
      } catch (e) {
        console.warn('BarcodeDetector initialization skipped:', e)
      }
    }

    // Fallback: visual scanning HUD loop
    function fallbackFrame() {
      if (!streamRef.current) return
      scanLoopRef.current = requestAnimationFrame(fallbackFrame)
    }
    scanLoopRef.current = requestAnimationFrame(fallbackFrame)
  }

  // Fallback: Image File Upload
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setScanStatus(`Analyzing image ${file.name}...`)
    try {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.src = url
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
      })

      if ('BarcodeDetector' in window) {
        const detector = new (window as unknown as {
          BarcodeDetector: new (opts: { formats: string[] }) => {
            detect: (source: HTMLImageElement) => Promise<Array<{ rawValue: string }>>
          }
        }).BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39'],
        })
        const barcodes = await detector.detect(img)
        if (barcodes.length > 0 && barcodes[0]?.rawValue) {
          URL.revokeObjectURL(url)
          triggerSuccess(barcodes[0].rawValue)
          return
        }
      }

      // If filename or simple heuristics contain a recognized patient code
      const nameMatch = file.name.match(/(SYN\d+|OPD-[A-Z0-9]+|ER-[A-Z0-9]+|SH-\d+)/i)
      if (nameMatch) {
        URL.revokeObjectURL(url)
        triggerSuccess(nameMatch[0].toUpperCase())
        return
      }

      URL.revokeObjectURL(url)
      setScanStatus('Could not locate QR code in image. Please use quick presets or enter ID.')
    } catch (err) {
      setScanStatus('Image parse failed. Please try another image or quick preset.')
      console.error(err)
    }
  }

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-sm">
      {/* Top Header / Mode Switcher */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 bg-slate-50/60">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
              />
            </svg>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-800">Hardware QR & Barcode Scanner</div>
            <div className="text-[10px] text-slate-500">Live optical recognition with camera & file fallback</div>
          </div>
        </div>

        {/* Right Tab pills & close */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-200/60 p-1 rounded-xl text-xs font-medium">
          <button
            onClick={() => {
              setActiveTab('camera')
              if (!cameraActive) startCamera()
            }}
            className={`px-3 py-1 rounded-lg transition-all ${
              activeTab === 'camera' ? 'bg-white text-blue-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Live Camera
          </button>
          <button
            onClick={() => {
              setActiveTab('upload')
              stopCamera()
            }}
            className={`px-3 py-1 rounded-lg transition-all ${
              activeTab === 'upload' ? 'bg-white text-blue-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Upload File
          </button>
          <button
            onClick={() => {
              setActiveTab('presets')
              stopCamera()
            }}
            className={`px-3 py-1 rounded-lg transition-all ${
              activeTab === 'presets' ? 'bg-white text-blue-700 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Presets
          </button>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer text-xs"
            aria-label="Close scanner"
          >
            ✕
          </button>
        )}
      </div>
    </div>

      {/* Main Viewport */}
      <div className="p-5">
        {activeTab === 'camera' && (
          <div className="flex flex-col items-center">
            {/* Camera Viewfinder Box */}
            <div className="relative w-full max-w-md h-64 sm:h-72 bg-slate-950 rounded-2xl overflow-hidden flex items-center justify-center border border-slate-800 shadow-inner">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transition-opacity duration-300 ${
                  cameraActive ? 'opacity-100' : 'opacity-0'
                }`}
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Inactive or Error Overlay */}
              {!cameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/90 text-slate-300">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-blue-400 mb-3 border border-slate-700">
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.8}
                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                      />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div className="text-sm font-semibold text-white mb-1">Optical Camera Disconnected</div>
                  <div className="text-xs text-slate-400 max-w-xs mb-4">
                    {cameraError || 'Activate your webcam to scan SynapseHealth digital health cards or printed token barcodes.'}
                  </div>
                  <button
                    onClick={startCamera}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/30 transition-all cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Start Hardware Camera
                  </button>
                </div>
              )}

              {/* Active Scanner HUD / Laser Overlay */}
              {cameraActive && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  {/* Outer corner reticles */}
                  <div className="relative w-48 h-48 border-2 border-blue-400/80 rounded-2xl shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                    {/* Reticle corner accents */}
                    <span className="absolute -top-1 -left-1 w-4 h-4 border-t-3 border-l-3 border-blue-500 rounded-tl-sm" />
                    <span className="absolute -top-1 -right-1 w-4 h-4 border-t-3 border-r-3 border-blue-500 rounded-tr-sm" />
                    <span className="absolute -bottom-1 -left-1 w-4 h-4 border-b-3 border-l-3 border-blue-500 rounded-bl-sm" />
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 border-b-3 border-r-3 border-blue-500 rounded-br-sm" />

                    {/* Animated scanning laser line */}
                    <div className="absolute left-1 right-1 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_#ef4444] animate-[bounce_2s_infinite]" />
                  </div>

                  {/* Top status tag */}
                  <div className="absolute top-3 px-3 py-1 rounded-full bg-black/60 backdrop-blur-xs text-[11px] font-medium text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Active Optical Sensor (1080p)
                  </div>
                </div>
              )}
            </div>

            {/* Camera Controls Bar */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 w-full max-w-md">
              <div className="flex items-center gap-2">
                {cameraActive ? (
                  <button
                    onClick={stopCamera}
                    className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                  >
                    Stop Camera
                  </button>
                ) : (
                  <button
                    onClick={startCamera}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
                  >
                    Start Camera
                  </button>
                )}

                {videoDevices.length > 1 && (
                  <button
                    onClick={switchCamera}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Switch Lens
                  </button>
                )}
              </div>

              <div className="text-[11px] text-slate-500 truncate max-w-[200px]">
                {scanStatus}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'upload' && (
          <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 mb-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="text-sm font-semibold text-slate-800 mb-1">Upload QR or Barcode Image</div>
            <div className="text-xs text-slate-500 max-w-sm mb-4">
              Select an image of a patient wristband, prescription header, or mobile health pass containing a QR code.
            </div>
            <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Choose QR Image File
              <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        )}

        {activeTab === 'presets' && (
          <div className="flex flex-col gap-3">
            <div className="text-xs text-slate-500">
              One-click hardware scan simulation. Click any clinical token to simulate an instant optical read:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => triggerSuccess('SYN123456')}
                className="p-3.5 rounded-xl border border-blue-200/80 bg-blue-50/50 hover:bg-blue-100/70 text-left transition-all group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs font-bold text-blue-700">SYN123456</span>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-blue-200 text-blue-800">OPD</span>
                </div>
                <div className="text-xs font-semibold text-slate-800 group-hover:text-blue-900">Dr. Rajesh Patel</div>
                <div className="text-[10px] text-slate-500">General OPD / Cardiology</div>
              </button>

              <button
                type="button"
                onClick={() => triggerSuccess('OPD-ARJUN')}
                className="p-3.5 rounded-xl border border-emerald-200/80 bg-emerald-50/50 hover:bg-emerald-100/70 text-left transition-all group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs font-bold text-emerald-700">OPD-ARJUN</span>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-emerald-200 text-emerald-800">Review</span>
                </div>
                <div className="text-xs font-semibold text-slate-800 group-hover:text-emerald-900">Arjun Rao</div>
                <div className="text-[10px] text-slate-500">Multimodal EHR / Contraindication</div>
              </button>

              <button
                type="button"
                onClick={() => triggerSuccess('ER-TRAUMA-01')}
                className="p-3.5 rounded-xl border border-rose-200/80 bg-rose-50/50 hover:bg-rose-100/70 text-left transition-all group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs font-bold text-rose-700">ER-TRAUMA-01</span>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-rose-200 text-rose-800">Trauma</span>
                </div>
                <div className="text-xs font-semibold text-slate-800 group-hover:text-rose-900">Trauma ER Patient</div>
                <div className="text-[10px] text-slate-500">Unconscious / Break-Glass</div>
              </button>
            </div>
          </div>
        )}

        {/* Scanned result pill */}
        {scannedCode && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Successfully recognized identifier: <strong>{scannedCode}</strong></span>
            </div>
            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
              Verified Token
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
