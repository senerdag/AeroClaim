import { useState, useEffect } from 'react'
import { History as HistoryIcon, Clock, Check, X, Mail, ChevronRight } from 'lucide-react'

interface Claim {
  id: number
  flightNumber: string
  airline: string
  departure: string
  arrival: string
  delayMinutes: number
  compensationEur: number
  isEligible: boolean
  emailSent: boolean
  createdAt: string
}

export function History() {
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
    fetch(`${apiUrl}/api/claims/history`)
      .then(r => r.json())
      .then(setClaims)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div
      className="flex-1 overflow-y-auto relative"
      style={{ background: '#0a0806', padding: '48px' }}
    >
      {/* Ambient top glow matching chat area */}
      <div
        className="absolute top-0 right-0 left-0 h-96 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(245,158,11,0.05) 0%, transparent 70%)',
        }}
      />
      
      <div className="relative z-10 max-w-5xl mx-auto" style={{ marginBottom: '40px' }}>
        <h1 className="text-4xl font-black text-white tracking-tight flex items-center" style={{ gap: '16px', marginBottom: '16px' }}>
          <HistoryIcon className="w-10 h-10" style={{ color: '#f59e0b' }} />
          Claim History
        </h1>
        <p className="text-xl font-medium max-w-3xl" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Persistent log of all executed AI workflows and legal dispatch statuses.
        </p>
      </div>

      <div className="relative z-10 max-w-5xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center" style={{ padding: '96px' }}>
            <span
              className="w-8 h-8 rounded-full border-[3px] border-transparent animate-spin"
              style={{ borderTopColor: '#f59e0b', borderRightColor: 'rgba(245,158,11,0.3)' }}
            />
          </div>
        ) : claims.length === 0 ? (
          <div
            className="rounded-3xl text-center max-w-3xl mx-auto shadow-xl"
            style={{
              padding: '64px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <Clock className="w-16 h-16 mx-auto" style={{ marginBottom: '24px', color: 'rgba(255,255,255,0.2)' }} />
            <p className="text-2xl font-bold text-white" style={{ marginBottom: '8px' }}>Ledger is Empty</p>
            <p className="text-lg font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>
              No compensation claims have been processed by the system.
            </p>
          </div>
        ) : (
          <div
            className="rounded-[32px] shadow-2xl overflow-hidden"
            style={{
              marginTop: '32px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <th className="text-left text-[13px] font-bold uppercase tracking-widest" style={{ padding: '28px 40px', color: 'rgba(255,255,255,0.35)' }}>Reference</th>
                  <th className="text-left text-[13px] font-bold uppercase tracking-widest" style={{ padding: '28px 40px', color: 'rgba(255,255,255,0.35)' }}>Carrier & Route</th>
                  <th className="text-left text-[13px] font-bold uppercase tracking-widest" style={{ padding: '28px 40px', color: 'rgba(255,255,255,0.35)' }}>Delay</th>
                  <th className="text-left text-[13px] font-bold uppercase tracking-widest" style={{ padding: '28px 40px', color: 'rgba(255,255,255,0.35)' }}>Verdict</th>
                  <th className="text-left text-[13px] font-bold uppercase tracking-widest" style={{ padding: '28px 40px', color: 'rgba(255,255,255,0.35)' }}>Dispatch</th>
                  <th className="text-right text-[13px] font-bold uppercase tracking-widest" style={{ padding: '28px 48px', color: 'rgba(255,255,255,0.35)' }}>Yield</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/50">
                {claims.map((c, i) => (
                  <tr
                    key={c.id}
                    className="transition-colors group hover:bg-[rgba(255,255,255,0.02)]"
                    style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <td style={{ padding: '32px 48px' }}>
                      <p className="text-xl font-bold text-white group-hover:text-amber-500 transition-colors">{c.flightNumber}</p>
                      <p className="text-sm font-mono truncate" style={{ marginTop: '6px', width: '112px', color: 'rgba(255,255,255,0.3)' }}>{new Date(c.createdAt).toLocaleDateString()}</p>
                    </td>
                    <td style={{ padding: '32px 40px' }}>
                      <p className="text-lg font-semibold text-white">{c.airline}</p>
                      <p className="text-sm font-medium flex items-center" style={{ marginTop: '6px', gap: '6px', color: 'rgba(255,255,255,0.45)' }}>
                        {c.departure} <ChevronRight className="w-3.5 h-3.5"/> {c.arrival}
                      </p>
                    </td>
                    <td style={{ padding: '32px 40px' }}>
                      <span
                        className="text-[15px] font-semibold whitespace-nowrap rounded-xl"
                        style={{
                          padding: '8px 16px',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.8)'
                        }}
                      >
                        {c.delayMinutes} min
                      </span>
                    </td>
                    <td style={{ padding: '32px 40px' }}>
                      <span
                        className="inline-flex items-center text-[15px] font-bold border whitespace-nowrap rounded-xl"
                        style={
                          c.isEligible
                            ? { padding: '8px 20px', gap: '10px', background: 'rgba(34,197,94,0.08)', color: '#4ade80', borderColor: 'rgba(34,197,94,0.2)' }
                            : { padding: '8px 20px', gap: '10px', background: 'rgba(239,68,68,0.08)', color: '#f87171', borderColor: 'rgba(239,68,68,0.2)' }
                        }
                      >
                        {c.isEligible ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                        {c.isEligible ? 'ELIGIBLE' : 'REJECTED'}
                      </span>
                    </td>
                    <td style={{ padding: '32px 40px' }}>
                      {c.emailSent ? (
                        <span
                          className="text-[15px] font-bold flex items-center border whitespace-nowrap rounded-xl"
                          style={{ padding: '8px 20px', gap: '10px', background: 'rgba(245,158,11,0.08)', color: '#f59e0b', borderColor: 'rgba(245,158,11,0.2)' }}
                        >
                          <Mail className="w-5 h-5" /> Dispatched
                        </span>
                      ) : (
                        <span
                          className="text-[15px] font-bold flex items-center border whitespace-nowrap rounded-xl"
                          style={{ padding: '8px 20px', gap: '10px', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.08)' }}
                        >
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="text-right" style={{ padding: '32px 48px' }}>
                      <span className={`text-4xl font-black tracking-tight ${c.isEligible ? 'text-white' : ''}`} style={{ color: c.isEligible ? 'white' : 'rgba(255,255,255,0.15)' }}>
                        €{c.compensationEur}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
