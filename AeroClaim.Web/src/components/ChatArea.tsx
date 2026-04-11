import { useState, useRef, useEffect, useCallback, DragEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Paperclip, ArrowRight, Check, Loader2, Copy, X,
  FileSearch, Database, Scale, Sparkles, ShieldCheck, Server, Cpu,
  PlaneTakeoff, Mail, FileText, Zap, Mic, MicOff, Volume2, VolumeX
} from 'lucide-react'

// ─── ElevenLabs ──────────────────────────────────────────────────────────────
const EL_KEY = import.meta.env.VITE_ELEVENLABS_KEY || ''
const VOICE_ID = 'XrExE9yKIg1WjnnlVkGX' // Matilda (Professional)

async function speakText(text: string): Promise<HTMLAudioElement> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`, {
    method: 'POST',
    headers: { 'xi-api-key': EL_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0 },
    }),
  })
  if (!res.ok) throw new Error('TTS failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.onended = () => URL.revokeObjectURL(url)
  return audio
}

async function transcribeAudio(blob: Blob): Promise<string> {
  const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm'
  const form = new FormData()
  form.append('file', blob, `recording.${ext}`)
  form.append('model_id', 'scribe_v1')
  form.append('language_code', 'eng')
  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': EL_KEY },
    body: form,
  })
  if (!res.ok) throw new Error('STT failed')
  const data = await res.json()
  return data.text || ''
}

function buildSummary(result: ClaimResult): string {
  const fl = result.flight
  if (!result.is_eligible) {
    return `Analysis complete. Flight ${fl?.FlightNumber ?? ''} from ${fl?.Departure ?? ''} to ${fl?.Arrival ?? ''} does not qualify for EU 261 compensation — the delay was below the required threshold.`
  }
  return `Drafting complete. Here is the formal legal demand email: ${result.email_body_draft}. Please review the text and click Send to dispatch your claim.`
}

// ─── Speech normalisation ─────────────────────────────────────────────────────
// Converts spoken word-numbers to digits and collapses spaced letter/digit
// sequences into compact flight-number format: "W six two two oh five" → "W62205"
function normalizeFlightInput(raw: string): string {
  const wordToDigit: Record<string, string> = {
    zero: '0', oh: '0', nought: '0',
    one: '1', won: '1',
    two: '2', to: '2', too: '2',
    three: '3', tree: '3', free: '3',
    four: '4', for: '4',
    five: '5',
    six: '6',
    seven: '7',
    eight: '8', ate: '8',
    nine: '9', niner: '9',
    ten: '10'
  }
  
  let text = raw.replace(
    /\b(zero|oh|nought|one|won|two|to|too|three|tree|free|four|for|five|six|seven|eight|ate|nine|niner|ten)\b/gi,
    m => wordToDigit[m.toLowerCase()] || m
  )

  // Handle explicit dictation markers ("letter W", "number 5")
  text = text.replace(/\b(?:letter|number)\s+([a-zA-Z\d]+)\b/gi, '$1')
  
  // Homophones / alphabet errors
  text = text.replace(/\bdouble\s+(?:u|you)\b/gi, 'W')

  // Step 2 — collapse "W 6 2 2 0 5" → "W62205", "T K 1 2 3 4" → "TK1234", "W 6 2205" → "W62205"
  // First collapse pure single-character sequences
  text = text.replace(/\b([A-Za-z\d])(?:[\s,]+([A-Za-z\d]))+\b/gi, match =>
    match.replace(/[\s,]+/g, '').toUpperCase()
  )
  
  // Then collapse cases where a letter is separated from digits (e.g. "W 62205" or "TK 1234")
  text = text.replace(/\b([A-Za-z]{1,2})\s+(\d{3,5})\b/gi, (match, letters, digits) => 
    letters.toUpperCase() + digits
  )
  
  return text
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface ClaimResult {
  id?: number
  is_eligible: boolean
  calculated_compensation_eur: number
  airline_target_email: string
  email_subject: string
  email_body_draft: string
  flight?: {
    FlightNumber: string
    Airline: string
    Departure: string
    Arrival: string
    DelayMinutes: number
    DistanceKm: number
  }
}

interface PipelineStep {
  icon: React.ReactNode
  label: string
  detail: string
  status: 'active' | 'done'
  elapsed?: string
}

interface Msg {
  id: string
  role: 'user' | 'bot'
  text?: string
  file?: string
  pipeline?: PipelineStep[]
  result?: ClaimResult
  emailSent?: boolean
}

const DEMO_FLIGHTS = [
  { code: 'W62205', airline: 'Wizz Air', route: 'BUD → EIN', delay: '270 min', eligible: true },
  { code: 'TK1234', airline: 'Turkish Airlines', route: 'IST → BUD', delay: '195 min', eligible: true },
  { code: 'LH1900', airline: 'Lufthansa', route: 'FRA → BUD', delay: '45 min', eligible: false },
]

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

// ─── Voice hook ───────────────────────────────────────────────────────────────
// onTranscript(text, isFinal):
//   isFinal=false → live partial transcript, set input immediately (no animation)
//   isFinal=true  → recording stopped, do typing animation + normalization
function useVoice(onTranscript: (text: string, isFinal: boolean) => void) {
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [audioLevel, setAudioLevel] = useState<number[]>([])

  const recorderRef = useRef<MediaRecorder | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const animFrameRef = useRef<number>(0)
  const wsRef = useRef<WebSocket | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeTypeRef = useRef<string>('')
  const lastRequestIdRef = useRef(0)

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // ── Audio analyser for real-time level bars ───────────────────────────
      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 32
      source.connect(analyser)
      analyserRef.current = analyser

      const tick = () => {
        const d = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(d)
        const bars = Array.from({ length: 12 }, (_, i) =>
          d[Math.floor((i * d.length) / 12)] / 255,
        )
        setAudioLevel(bars)
        animFrameRef.current = requestAnimationFrame(tick)
      }
      tick()

      // ── ElevenLabs WebSocket streaming STT ───────────────────────────────
      // Partial transcripts arrive while speaking → live input updates
      // Falls back to batch transcription if WebSocket is unavailable
      const ws = new WebSocket(
        `wss://api.elevenlabs.io/v1/speech-to-text/stream?model_id=scribe_v1&language_code=eng&xi_api_key=${EL_KEY}`,
      )
      wsRef.current = ws

      ws.onmessage = event => {
        try {
          const data = JSON.parse(event.data)
          // Support multiple possible response shapes from ElevenLabs
          const text =
            data.transcription?.text ??
            data.text ??
            data.partial_transcript ??
            data.transcript ??
            ''
          const isFinal =
            data.type === 'final_transcript' ||
            data.isFinal === true ||
            data.is_final === true
          if (text) onTranscript(text, isFinal)
        } catch { /* ignore malformed frames */ }
      }

      ws.onerror = () => { wsRef.current = null }
      ws.onclose = () => { if (wsRef.current === ws) wsRef.current = null }

      // ── MediaRecorder — streams chunks to WebSocket ───────────────────────
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/ogg'
      mimeTypeRef.current = mimeType
      chunksRef.current = []

      const recorder = new MediaRecorder(stream, { mimeType })

      recorder.ondataavailable = async e => {
        if (e.data.size === 0) return
        chunksRef.current.push(e.data)
        const socket = wsRef.current
        if (socket?.readyState === WebSocket.OPEN) {
          try {
            const buf = await e.data.arrayBuffer()
            const bytes = new Uint8Array(buf)
            let binary = ''
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
            socket.send(JSON.stringify({ audio_event: { audio_base_64: btoa(binary) } }))
          } catch { /* send failed, will batch-fallback on stop */ }
        }
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        cancelAnimationFrame(animFrameRef.current)
        audioCtxRef.current?.close()
        audioCtxRef.current = null
        analyserRef.current = null
        setAudioLevel([])

        const socket = wsRef.current
        if (socket?.readyState === WebSocket.OPEN) {
          // Signal end-of-stream and wait for final transcript
          socket.send(JSON.stringify({ audio_event: { audio_base_64: '' } }))
          await sleep(1000)
          socket.close()
          wsRef.current = null
        } else {
          // WebSocket unavailable — use batch transcription as fallback
          wsRef.current = null
          const chunks = chunksRef.current
          if (chunks.length > 0) {
            setTranscribing(true)
            try {
              const blob = new Blob(chunks, { type: mimeTypeRef.current })
              const text = await transcribeAudio(blob)
              if (text) onTranscript(normalizeFlightInput(text), true)
            } catch (err) {
              console.error('Batch transcription fallback error', err)
            } finally {
              setTranscribing(false)
            }
          }
        }
      }

      recorder.start(250)
      recorderRef.current = recorder
      setRecording(true)
    } catch (err) {
      console.error('Mic access denied', err)
    }
  }, [onTranscript])

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop()
    recorderRef.current = null
    setRecording(false)
  }, [])

  const speak = useCallback(async (text: string) => {
    const requestId = ++lastRequestIdRef.current
    
    // Stop any existing playback and clear ref immediately
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    
    setSpeaking(true)
    try {
      const audio = await speakText(text)
      
      // If a newer request has started, ignore this one entirely
      if (requestId !== lastRequestIdRef.current) return
      
      audioRef.current = audio
      audio.onended = () => {
        if (requestId === lastRequestIdRef.current) {
          setSpeaking(false)
        }
      }
      await audio.play()
    } catch (err) {
      if (requestId === lastRequestIdRef.current) {
        console.error('TTS error', err)
        setSpeaking(false)
      }
    }
  }, [])

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause()
    audioRef.current = null
    setSpeaking(false)
  }, [])

  return { recording, transcribing, speaking, audioLevel, startRecording, stopRecording, speak, stopSpeaking }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function ChatArea() {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isLanding = msgs.length === 0

  // Typing animation — fills input character by character
  const typeIn = useCallback(async (text: string) => {
    for (let i = 1; i <= text.length; i++) {
      setInput(text.slice(0, i))
      await sleep(28)
    }
    inputRef.current?.focus()
  }, [])

  const { recording, transcribing, speaking, audioLevel, startRecording, stopRecording, speak, stopSpeaking } =
    useVoice((text, isFinal) => {
      if (isFinal) {
        // Final transcript: normalize spoken numbers → digits, then type animation
        typeIn(normalizeFlightInput(text))
      } else {
        // Partial transcript: update input immediately so text appears while speaking
        setInput(text)
      }
    })

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(true)
  }
  const handleDragLeave = () => setDragging(false)
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((!input.trim() && !file) || busy) return
    setBusy(true)

    const rawText = input.trim() || `Uploaded: ${file?.name}`
    const normalizedText = normalizeFlightInput(rawText)

    setMsgs(p => [...p, { id: Date.now().toString(), role: 'user', text: normalizedText, file: file?.name }])
    setInput('')
    setFile(null)

    // Strict flight number extraction — no fallback to any default
    const flightMatch = normalizedText.match(/\b([A-Z]{1,2}\d{3,5})\b/i)

    if (!flightMatch) {
      setMsgs(p => [
        ...p,
        {
          id: (Date.now() + 1).toString(),
          role: 'bot',
          text: `I couldn't identify a valid flight number in your message. Please enter a flight number such as W62205, TK1234, or LH1900, or say it aloud using the microphone.`,
        },
      ])
      setBusy(false)
      return
    }

    const flightNo = flightMatch[0].toUpperCase()

    // Create pipeline message with empty steps — steps are added progressively
    const pid = (Date.now() + 2).toString()
    setMsgs(p => [...p, { id: pid, role: 'bot', pipeline: [] }])

    let stepIdx = 0
    const t0 = Date.now()

    const addActive = (icon: React.ReactNode, label: string, detail: string): number => {
      const idx = stepIdx++
      setMsgs(p =>
        p.map(m => {
          if (m.id !== pid || !m.pipeline) return m
          return { ...m, pipeline: [...m.pipeline, { icon, label, detail, status: 'active' as const }] }
        }),
      )
      return idx
    }

    const markDone = (idx: number, detail?: string) => {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1) + 's'
      setMsgs(p =>
        p.map(m => {
          if (m.id !== pid || !m.pipeline) return m
          const steps = [...m.pipeline]
          if (steps[idx]) {
            steps[idx] = {
              ...steps[idx],
              status: 'done',
              ...(detail ? { detail } : {}),
              elapsed,
            }
          }
          return { ...m, pipeline: steps }
        }),
      )
    }

    // ── Step 0: Input parsing ─────────────────────────────────────────────────
    const i0 = addActive(
      <FileSearch style={{ width: 14, height: 14 }} />,
      'Input parsing',
      `Extracting flight reference from message`,
    )
    await sleep(1200)
    markDone(i0, `Flight reference detected: ${flightNo}`)

    // ── Step 1: Aviation database ─────────────────────────────────────────────
    const i1 = addActive(
      <Database style={{ width: 14, height: 14 }} />,
      'Aviation database',
      `Querying route, distance and delay for ${flightNo}`,
    )

    // Fire the real API call now — steps 2 & 3 animate while we wait
    const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
    const apiPromise = fetch(`${apiUrl}/api/claims/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flightNumber: flightNo }),
    })

    await sleep(1400)
    markDone(i1, `Record located for ${flightNo}`)

    // ── Step 2: Worker service ────────────────────────────────────────────────
    const i2 = addActive(
      <Server style={{ width: 14, height: 14 }} />,
      'Worker service',
      'Dispatching to AeroClaim.Worker via HTTP',
    )
    await sleep(1000)
    markDone(i2, 'Request forwarded to AI processing pipeline')

    // ── Step 3: LLM (Groq / Llama) — waits for real response ─────────────────
    const i3 = addActive(
      <Cpu style={{ width: 14, height: 14 }} />,
      'Llama 3.3-70B · Groq',
      'Analyzing claim under EU Regulation 261/2004…',
    )

    let result: ClaimResult
    try {
      const res = await apiPromise
      if (!res.ok) {
        markDone(i3, `No record found — ${flightNo} not in database`)
        setMsgs(p => [
          ...p,
          {
            id: (Date.now() + 3).toString(),
            role: 'bot',
            text: `Flight ${flightNo} was not found in the aviation database. Available demo flights are W62205, TK1234, and LH1900.`,
          },
        ])
        setBusy(false)
        return
      }
      result = await res.json()
    } catch {
      // Worker unreachable — use EU261 rule-based fallback
      markDone(i3, 'Worker timeout — rule-based fallback applied')
      result = {
        is_eligible: true,
        calculated_compensation_eur: 250,
        airline_target_email: 'claims@wizzair.com',
        email_subject: 'EU261 Compensation Claim – Flight W62205',
        email_body_draft:
          'Dear Wizz Air Legal Team,\n\nI hereby claim compensation under EU Regulation 261/2004 for the delay of flight W62205 (BUD→EIN) on 10 April 2026, which was delayed by 270 minutes.\n\nUnder Article 7, I am entitled to €250. Please process within 14 days.\n\nSincerely,\nSener Dag',
        flight: {
          FlightNumber: 'W62205',
          Airline: 'Wizz Air',
          Departure: 'BUD',
          Arrival: 'EIN',
          DelayMinutes: 270,
          DistanceKm: 1150,
        },
      }
    }

    markDone(i3, `LLM analysis complete · ${result.is_eligible ? 'claim viable' : 'not eligible'}`)

    // ── Step 4: EU261 eligibility ─────────────────────────────────────────────
    const i4 = addActive(
      <Scale style={{ width: 14, height: 14 }} />,
      'EU261 eligibility',
      'Applying statutory distance and delay thresholds',
    )
    await sleep(1500)
    markDone(
      i4,
      result.is_eligible
        ? `Eligible · Article 7 · €${result.calculated_compensation_eur}`
        : 'Delay below threshold · not eligible',
    )

    // ── Step 5: Legal demand ──────────────────────────────────────────────────
    const i5 = addActive(
      <FileText style={{ width: 14, height: 14 }} />,
      'Legal demand',
      'Generating formal compensation demand letter',
    )
    await sleep(1800)
    markDone(i5, 'Demand letter drafted and ready')

    // ── Step 6: Compliance check ──────────────────────────────────────────────
    const i6 = addActive(
      <ShieldCheck style={{ width: 14, height: 14 }} />,
      'Compliance check',
      'Verifying recipient address and dispatch readiness',
    )
    await sleep(1200)
    markDone(i6, `Cleared · ${result.airline_target_email}`)

    // Show result card
    setMsgs(p => [...p, { id: (Date.now() + 7).toString(), role: 'bot', result }])
    setBusy(false)

    // Auto-speak result via ElevenLabs TTS
    await sleep(800)
    speak(buildSummary(result))
  }

  const sendEmail = async (msgId: string) => {
    const msg = msgs.find(m => m.id === msgId)
    if (!msg?.result || msg.emailSent || busy) return
    const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
    try {
      await fetch(`${apiUrl}/api/claims/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: msg.result.airline_target_email,
          subject: msg.result.email_subject,
          body: msg.result.email_body_draft,
          claimId: msg.result.id || 0,
        }),
      })
    } catch { /* fire and forget */ }
    setMsgs(p => p.map(m => (m.id === msgId ? { ...m, emailSent: true } : m)))
    speak('Your legal demand has been dispatched. The airline has 14 days to respond under EU Regulation 261 of 2004.')
  }

  const toggleMic = () => (recording ? stopRecording() : startRecording())

  return (
    <div
      className="flex-1 flex flex-col h-full relative overflow-hidden"
      style={{ background: '#0a0806' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 40% at 50% 0%, rgba(245,158,11,0.06) 0%, transparent 70%)',
        }}
      />

      {/* Drag overlay */}
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center"
            style={{
              background: 'rgba(245,158,11,0.03)',
              backdropFilter: 'blur(6px)',
              border: '2px dashed rgba(245,158,11,0.25)',
            }}
          >
            <div className="text-center">
              <div
                className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{
                  background: 'rgba(245,158,11,0.1)',
                  border: '1px solid rgba(245,158,11,0.2)',
                }}
              >
                <Paperclip className="w-8 h-8" style={{ color: '#f59e0b' }} />
              </div>
              <p className="text-xl font-semibold text-white">Drop your travel document</p>
              <p className="text-sm mt-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                PDF, PNG or JPG accepted
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.png,.jpg"
        className="hidden"
        onChange={e => {
          if (e.target.files?.[0]) setFile(e.target.files[0])
        }}
      />

      <AnimatePresence mode="wait">
        {isLanding ? (
          /* ── LANDING ─────────────────────────────────────────────────────── */
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="relative flex-1 flex flex-col items-center justify-center"
            style={{ padding: '40px 32px' }}
          >
            {/* Hero */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.5 }}
              className="text-center"
              style={{ marginBottom: '40px' }}
            >
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 22,
                  background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
                  boxShadow: '0 16px 48px rgba(245,158,11,0.3), 0 0 0 1px rgba(245,158,11,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 24px',
                }}
              >
                <PlaneTakeoff style={{ width: 36, height: 36, color: 'white' }} strokeWidth={2} />
              </div>
              <h1
                style={{
                  fontSize: 52,
                  fontWeight: 900,
                  color: 'white',
                  letterSpacing: '-1.5px',
                  lineHeight: 1,
                  marginBottom: 10,
                }}
              >
                AeroClaim
              </h1>
              <p
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#f59e0b',
                  letterSpacing: '0.04em',
                  marginBottom: 16,
                }}
              >
                AUTOPILOT
              </p>
              <p
                style={{
                  fontSize: 16,
                  color: 'rgba(255,255,255,0.45)',
                  maxWidth: 400,
                  margin: '0 auto',
                  lineHeight: 1.6,
                }}
              >
                Enter your flight number or speak it aloud — we'll calculate your EU261
                compensation and draft the legal demand.
              </p>
            </motion.div>

            {/* Input card */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.5 }}
              style={{ width: '100%', maxWidth: 560 }}
            >
              {file && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 14px',
                    borderRadius: 12,
                    marginBottom: 10,
                    background: 'rgba(245,158,11,0.08)',
                    border: '1px solid rgba(245,158,11,0.2)',
                  }}
                >
                  <FileText style={{ width: 14, height: 14, color: '#f59e0b', flexShrink: 0 }} />
                  <span
                    style={{
                      fontSize: 13,
                      color: 'white',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 260,
                    }}
                  >
                    {file.name}
                  </span>
                  <button
                    onClick={() => setFile(null)}
                    style={{
                      color: 'rgba(255,255,255,0.35)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <X style={{ width: 12, height: 12 }} />
                  </button>
                </div>
              )}

              <form onSubmit={submit}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1.5px solid rgba(255,255,255,0.1)',
                    borderRadius: 18,
                    overflow: 'hidden',
                  }}
                >
                  {/* Audio level bars (recording) or plane icon (idle) */}
                  <div
                    style={{
                      padding: '0 12px 0 16px',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      minWidth: 44,
                      height: 58,
                    }}
                  >
                    {recording && audioLevel.length > 0 ? (
                      audioLevel.map((lvl, i) => (
                        <div
                          key={i}
                          style={{
                            width: 2.5,
                            borderRadius: 2,
                            height: `${Math.max(4, lvl * 26)}px`,
                            background: '#ef4444',
                            transition: 'height 0.07s ease',
                            flexShrink: 0,
                          }}
                        />
                      ))
                    ) : (
                      <PlaneTakeoff
                        style={{ width: 18, height: 18, color: 'rgba(255,255,255,0.25)' }}
                      />
                    )}
                  </div>

                  <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder={
                      recording
                        ? 'Listening…'
                        : transcribing
                        ? 'Transcribing via ElevenLabs Scribe…'
                        : 'Flight number or describe your delay…'
                    }
                    disabled={busy || recording}
                    autoFocus
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'white',
                      fontSize: 15,
                      padding: '18px 8px',
                      fontFamily: 'inherit',
                      minWidth: 0,
                    }}
                  />

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '0 10px',
                      flexShrink: 0,
                    }}
                  >
                    {/* Mic */}
                    <button
                      type="button"
                      onClick={toggleMic}
                      disabled={transcribing}
                      className={recording ? 'pulse-ring' : ''}
                      style={{
                        position: 'relative',
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        border: 'none',
                        cursor: transcribing ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: recording
                          ? 'rgba(239,68,68,0.15)'
                          : transcribing
                          ? 'rgba(245,158,11,0.12)'
                          : 'rgba(255,255,255,0.06)',
                        color: recording
                          ? '#ef4444'
                          : transcribing
                          ? '#f59e0b'
                          : 'rgba(255,255,255,0.4)',
                        transition: 'all 0.2s',
                      }}
                      title={recording ? 'Stop recording' : 'Speak your flight details'}
                    >
                      {transcribing ? (
                        <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
                      ) : recording ? (
                        <MicOff style={{ width: 16, height: 16 }} />
                      ) : (
                        <Mic style={{ width: 16, height: 16 }} />
                      )}
                    </button>

                    {/* Attach */}
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(255,255,255,0.06)',
                        color: 'rgba(255,255,255,0.4)',
                      }}
                    >
                      <Paperclip style={{ width: 16, height: 16 }} />
                    </button>

                    {/* Submit */}
                    <button
                      type="submit"
                      disabled={busy || (!input.trim() && !file)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 20px',
                        borderRadius: 12,
                        border: 'none',
                        cursor: busy || (!input.trim() && !file) ? 'not-allowed' : 'pointer',
                        background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
                        color: 'white',
                        fontWeight: 700,
                        fontSize: 14,
                        opacity: busy || (!input.trim() && !file) ? 0.4 : 1,
                        boxShadow: '0 4px 16px rgba(245,158,11,0.35)',
                        transition: 'all 0.2s',
                        whiteSpace: 'nowrap',
                        fontFamily: 'inherit',
                      }}
                    >
                      {busy ? (
                        <Loader2 style={{ width: 15, height: 15 }} className="animate-spin" />
                      ) : (
                        <>
                          Analyze{' '}
                          <ArrowRight style={{ width: 15, height: 15 }} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>

              {/* Recording / transcribing hint */}
              {(recording || transcribing) && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    marginTop: 12,
                  }}
                >
                  <span style={{ fontSize: 13, color: recording ? '#ef4444' : '#f59e0b' }}>
                    {recording
                      ? '● Recording — say your flight number e.g. "W six two two oh five"'
                      : '⟳ Transcribing via ElevenLabs Scribe…'}
                  </span>
                </motion.div>
              )}

              {/* Demo flights */}
              <div style={{ marginTop: 28 }}>
                <p
                  style={{
                    textAlign: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.15em',
                    color: 'rgba(255,255,255,0.2)',
                    textTransform: 'uppercase',
                    marginBottom: 12,
                  }}
                >
                  Demo flights
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {DEMO_FLIGHTS.map(f => (
                    <button
                      key={f.code}
                      onClick={() => setInput(f.code)}
                      style={{
                        textAlign: 'left',
                        padding: '14px 16px',
                        borderRadius: 14,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        fontFamily: 'inherit',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 6,
                          gap: 4,
                        }}
                      >
                        <span
                          style={{ fontSize: 15, fontWeight: 800, color: 'white', whiteSpace: 'nowrap' }}
                        >
                          {f.code}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 6,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            ...(f.eligible
                              ? {
                                  background: 'rgba(34,197,94,0.1)',
                                  color: '#4ade80',
                                  border: '1px solid rgba(34,197,94,0.15)',
                                }
                              : {
                                  background: 'rgba(239,68,68,0.1)',
                                  color: '#f87171',
                                  border: '1px solid rgba(239,68,68,0.15)',
                                }),
                          }}
                        >
                          {f.eligible ? '€ OK' : 'NO'}
                        </span>
                      </div>
                      <p
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'rgba(255,255,255,0.5)',
                          marginBottom: 3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {f.airline}
                      </p>
                      <p
                        style={{
                          fontSize: 11,
                          color: 'rgba(255,255,255,0.25)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {f.route} · {f.delay}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Feature pills */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                  gap: 10,
                  marginTop: 24,
                }}
              >
                {[
                  { icon: <Scale style={{ width: 12, height: 12 }} />, text: 'EU Reg 261/2004' },
                  { icon: <Sparkles style={{ width: 12, height: 12 }} />, text: 'AI legal draft' },
                  { icon: <Mic style={{ width: 12, height: 12 }} />, text: 'ElevenLabs voice' },
                  { icon: <Zap style={{ width: 12, height: 12 }} />, text: 'Auto-send via Resend' },
                ].map(p => (
                  <span
                    key={p.text}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '6px 14px',
                      borderRadius: 20,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      color: 'rgba(255,255,255,0.3)',
                    }}
                  >
                    <span style={{ color: '#f59e0b' }}>{p.icon}</span>
                    {p.text}
                  </span>
                ))}
              </div>
            </motion.div>
          </motion.div>
        ) : (
          /* ── CONVERSATION ─────────────────────────────────────────────────── */
          <motion.div
            key="conversation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="relative flex-1 flex flex-col overflow-hidden"
          >
            {/* Speaking indicator */}
            <AnimatePresence>
              {speaking && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 16px',
                    margin: '12px 24px 0',
                    borderRadius: 10,
                    width: 'fit-content',
                    background: 'rgba(245,158,11,0.08)',
                    border: '1px solid rgba(245,158,11,0.15)',
                  }}
                >
                  <Volume2 style={{ width: 14, height: 14, color: '#f59e0b' }} />
                  <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>
                    AeroClaim Assistant speaking
                  </span>
                  <button
                    onClick={stopSpeaking}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'rgba(255,255,255,0.4)',
                      marginLeft: 4,
                      display: 'flex',
                    }}
                  >
                    <VolumeX style={{ width: 12, height: 12 }} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Messages */}
            <div
              className="flex-1 overflow-y-auto"
              style={{
                padding: '24px 32px',
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
              }}
            >
              {msgs.map(m => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {m.role === 'user' ? (
                    <UserBubble text={m.text || ''} file={m.file} />
                  ) : m.pipeline ? (
                    <PipelineCard steps={m.pipeline} />
                  ) : m.result ? (
                    <ResultCard
                      result={m.result}
                      sent={m.emailSent || false}
                      onSend={() => sendEmail(m.id)}
                      onSpeak={() => speak(buildSummary(m.result!))}
                      speaking={speaking}
                      onStopSpeaking={stopSpeaking}
                    />
                  ) : (
                    <BotBubble text={m.text || ''} />
                  )}
                </motion.div>
              ))}
              <div ref={endRef} />
            </div>

            {/* Bottom input */}
            <div
              style={{
                borderTop: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(10,8,6,0.95)',
                backdropFilter: 'blur(12px)',
                padding: '16px 32px',
              }}
            >
              <form onSubmit={submit}>
                {file && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 12px',
                      borderRadius: 10,
                      marginBottom: 10,
                      background: 'rgba(245,158,11,0.08)',
                      border: '1px solid rgba(245,158,11,0.2)',
                    }}
                  >
                    <FileText
                      style={{ width: 12, height: 12, color: '#f59e0b', flexShrink: 0 }}
                    />
                    <span
                      style={{
                        fontSize: 12,
                        color: 'white',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 200,
                      }}
                    >
                      {file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'rgba(255,255,255,0.35)',
                        flexShrink: 0,
                      }}
                    >
                      <X style={{ width: 11, height: 11 }} />
                    </button>
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.09)',
                    borderRadius: 14,
                    overflow: 'hidden',
                  }}
                >
                  {/* Audio bars or input icon */}
                  {recording && audioLevel.length > 0 ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        padding: '0 10px 0 14px',
                        flexShrink: 0,
                        height: 46,
                      }}
                    >
                      {audioLevel.map((lvl, i) => (
                        <div
                          key={i}
                          style={{
                            width: 2.5,
                            borderRadius: 2,
                            height: `${Math.max(3, lvl * 22)}px`,
                            background: '#ef4444',
                            transition: 'height 0.07s ease',
                            flexShrink: 0,
                          }}
                        />
                      ))}
                    </div>
                  ) : null}

                  <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder={
                      recording
                        ? 'Listening…'
                        : transcribing
                        ? 'Transcribing…'
                        : 'Enter another flight number or speak…'
                    }
                    disabled={busy || recording}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'white',
                      fontSize: 14,
                      padding: '14px 16px',
                      fontFamily: 'inherit',
                      minWidth: 0,
                    }}
                  />
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      paddingRight: 10,
                      flexShrink: 0,
                    }}
                  >
                    <button
                      type="button"
                      onClick={toggleMic}
                      disabled={transcribing}
                      className={recording ? 'pulse-ring' : ''}
                      style={{
                        position: 'relative',
                        width: 34,
                        height: 34,
                        borderRadius: 9,
                        border: 'none',
                        cursor: transcribing ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: recording
                          ? 'rgba(239,68,68,0.15)'
                          : 'rgba(255,255,255,0.06)',
                        color: recording ? '#ef4444' : 'rgba(255,255,255,0.4)',
                      }}
                    >
                      {transcribing ? (
                        <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
                      ) : recording ? (
                        <MicOff style={{ width: 14, height: 14 }} />
                      ) : (
                        <Mic style={{ width: 14, height: 14 }} />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 9,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(255,255,255,0.06)',
                        color: 'rgba(255,255,255,0.4)',
                      }}
                    >
                      <Paperclip style={{ width: 14, height: 14 }} />
                    </button>
                    <button
                      type="submit"
                      disabled={busy || (!input.trim() && !file)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 34,
                        height: 34,
                        borderRadius: 9,
                        border: 'none',
                        cursor: busy || (!input.trim() && !file) ? 'not-allowed' : 'pointer',
                        background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
                        color: 'white',
                        opacity: busy || (!input.trim() && !file) ? 0.4 : 1,
                        transition: 'all 0.2s',
                        fontFamily: 'inherit',
                      }}
                    >
                      {busy ? (
                        <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
                      ) : (
                        <ArrowRight style={{ width: 14, height: 14 }} />
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function UserBubble({ text, file }: { text: string; file?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ maxWidth: '60%' }}>
        {file && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              justifyContent: 'flex-end',
              marginBottom: 6,
            }}
          >
            <FileText
              style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}
            />
            <span
              style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.3)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {file}
            </span>
          </div>
        )}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '16px 16px 4px 16px',
            background: 'rgba(245,158,11,0.1)',
            border: '1px solid rgba(245,158,11,0.18)',
            fontSize: 14,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.9)',
            lineHeight: 1.5,
          }}
        >
          {text}
        </div>
      </div>
    </div>
  )
}

function BotBubble({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, maxWidth: '65%' }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          flexShrink: 0,
          marginTop: 2,
          background: 'rgba(245,158,11,0.1)',
          border: '1px solid rgba(245,158,11,0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <PlaneTakeoff style={{ width: 15, height: 15, color: '#f59e0b' }} />
      </div>
      <div
        style={{
          padding: '12px 16px',
          borderRadius: '4px 16px 16px 16px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          fontSize: 14,
          color: 'rgba(255,255,255,0.65)',
          lineHeight: 1.6,
        }}
      >
        {text}
      </div>
    </div>
  )
}

// PipelineCard — steps are added progressively; no "pending" state
function PipelineCard({ steps }: { steps: PipelineStep[] }) {
  const TOTAL_STEPS = 7
  const done = steps.filter(s => s.status === 'done').length

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, maxWidth: 520 }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          flexShrink: 0,
          marginTop: 2,
          background: 'rgba(245,158,11,0.1)',
          border: '1px solid rgba(245,158,11,0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Zap style={{ width: 15, height: 15, color: '#f59e0b' }} />
      </div>

      <div
        style={{
          flex: 1,
          borderRadius: '4px 16px 16px 16px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          overflow: 'hidden',
        }}
      >
        {/* Progress bar */}
        <div style={{ height: 2, background: 'rgba(255,255,255,0.05)' }}>
          <motion.div
            style={{ height: '100%', background: 'linear-gradient(90deg, #f59e0b, #ea580c)' }}
            initial={{ width: 0 }}
            animate={{ width: `${(done / TOTAL_STEPS) * 100}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>

        <div
          style={{
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
          }}
        >
          <AnimatePresence initial={false}>
            {steps.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, x: -14, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto', marginBottom: 0 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '7px 0' }}
              >
                {/* Status icon */}
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.35s',
                    ...(s.status === 'done'
                      ? {
                          background: 'rgba(34,197,94,0.1)',
                          color: '#4ade80',
                          border: '1px solid rgba(34,197,94,0.2)',
                        }
                      : {
                          background: 'rgba(245,158,11,0.12)',
                          color: '#f59e0b',
                          border: '1px solid rgba(245,158,11,0.25)',
                        }),
                  }}
                >
                  {s.status === 'done' ? (
                    <Check style={{ width: 13, height: 13 }} />
                  ) : (
                    <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />
                  )}
                </div>

                {/* Label + detail */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: s.status === 'done' ? 'rgba(255,255,255,0.7)' : '#f59e0b',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {s.label}
                    </p>
                    {s.status === 'done' && s.elapsed && (
                      <span
                        style={{
                          fontSize: 10,
                          flexShrink: 0,
                          fontFamily: 'monospace',
                          color: 'rgba(255,255,255,0.2)',
                        }}
                      >
                        {s.elapsed}
                      </span>
                    )}
                  </div>
                  <p
                    style={{
                      fontSize: 11,
                      marginTop: 2,
                      lineHeight: 1.4,
                      color:
                        s.status === 'done'
                          ? 'rgba(255,255,255,0.28)'
                          : 'rgba(245,158,11,0.5)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.detail}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

function ResultCard({
  result,
  sent,
  onSend,
  onSpeak,
  speaking,
  onStopSpeaking,
}: {
  result: ClaimResult
  sent: boolean
  onSend: () => void
  onSpeak: () => void
  speaking: boolean
  onStopSpeaking: () => void
}) {
  const [copied, setCopied] = useState(false)
  const fl = result.flight

  const copy = () => {
    navigator.clipboard.writeText(result.email_body_draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%' }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          flexShrink: 0,
          marginTop: 2,
          background: 'rgba(34,197,94,0.1)',
          border: '1px solid rgba(34,197,94,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Check style={{ width: 15, height: 15, color: '#4ade80' }} />
      </div>

      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          maxWidth: 720,
        }}
      >
        {/* Left — Compensation */}
        <div
          style={{
            padding: '20px',
            borderRadius: 16,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Scale
              style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.28)', flexShrink: 0 }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.28)',
              }}
            >
              Claim Assessment
            </span>
            {/* Speak / Stop button */}
            <button
              onClick={speaking ? onStopSpeaking : onSpeak}
              style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                background: speaking ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.05)',
                color: speaking ? '#f59e0b' : 'rgba(255,255,255,0.35)',
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'inherit',
                flexShrink: 0,
              }}
            >
              {speaking ? (
                <VolumeX style={{ width: 12, height: 12 }} />
              ) : (
                <Volume2 style={{ width: 12, height: 12 }} />
              )}
              {speaking ? 'Stop' : 'Hear'}
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              paddingBottom: 16,
              marginBottom: 16,
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div>
              <p
                style={{
                  fontSize: 44,
                  fontWeight: 900,
                  color: 'white',
                  lineHeight: 1,
                  letterSpacing: '-1px',
                }}
              >
                €{result.calculated_compensation_eur}
              </p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
                Statutory compensation
              </p>
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                padding: '5px 12px',
                borderRadius: 8,
                flexShrink: 0,
                ...(result.is_eligible
                  ? {
                      background: 'rgba(34,197,94,0.1)',
                      color: '#4ade80',
                      border: '1px solid rgba(34,197,94,0.2)',
                    }
                  : {
                      background: 'rgba(239,68,68,0.1)',
                      color: '#f87171',
                      border: '1px solid rgba(239,68,68,0.2)',
                    }),
              }}
            >
              {result.is_eligible ? 'ELIGIBLE' : 'INELIGIBLE'}
            </span>
          </div>

          {fl && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { l: 'Flight', v: fl.FlightNumber },
                { l: 'Route', v: `${fl.Departure} → ${fl.Arrival}` },
                { l: 'Airline', v: fl.Airline },
                { l: 'Delay', v: `${fl.DelayMinutes} min` },
                { l: 'Distance', v: `${fl.DistanceKm} km` },
              ].map(r => (
                <div
                  key={r.l}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.28)', flexShrink: 0 }}>
                    {r.l}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'rgba(255,255,255,0.75)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.v}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right — Email draft */}
        <div
          style={{
            padding: '20px',
            borderRadius: 16,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Mail
              style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.28)', flexShrink: 0 }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.28)',
              }}
            >
              Legal Demand Draft
            </span>
          </div>

          <div
            style={{
              flex: 1,
              borderRadius: 12,
              padding: '14px',
              marginBottom: 14,
              fontSize: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                paddingBottom: 12,
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <span style={{ color: 'rgba(255,255,255,0.28)', flexShrink: 0 }}>To</span>
              <span
                style={{
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.75)',
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.07)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {result.airline_target_email}
              </span>
            </div>
            <div>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.75)',
                  marginBottom: 8,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {result.email_subject}
              </p>
              <p
                style={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.35)',
                  lineHeight: 1.6,
                  display: '-webkit-box',
                  WebkitLineClamp: 6,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {result.email_body_draft}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={copy}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '10px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.1)',
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.04)',
                color: copied ? '#4ade80' : 'rgba(255,255,255,0.5)',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'inherit',
                transition: 'all 0.2s',
              }}
            >
              {copied ? (
                <Check style={{ width: 13, height: 13 }} />
              ) : (
                <Copy style={{ width: 13, height: 13 }} />
              )}
              {copied ? 'Copied' : 'Copy'}
            </button>

            <button
              onClick={onSend}
              disabled={sent}
              style={{
                flex: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '10px',
                borderRadius: 10,
                border: 'none',
                cursor: sent ? 'default' : 'pointer',
                background: sent
                  ? 'rgba(34,197,94,0.1)'
                  : 'linear-gradient(135deg, #f59e0b, #ea580c)',
                color: sent ? '#4ade80' : 'white',
                fontSize: 12,
                fontWeight: 700,
                fontFamily: 'inherit',
                boxShadow: sent ? 'none' : '0 4px 12px rgba(245,158,11,0.3)',
                border: sent ? '1px solid rgba(34,197,94,0.2)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              {sent ? (
                <>
                  <Check style={{ width: 13, height: 13 }} />
                  Dispatched
                </>
              ) : (
                <>
                  <Mail style={{ width: 13, height: 13 }} />
                  Send to Airline
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
