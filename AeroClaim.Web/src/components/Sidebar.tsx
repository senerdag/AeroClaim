import { PlaneTakeoff, MessageSquare, History, Scale } from 'lucide-react'
import type { View } from '../App'

interface Props {
  currentView: View
  onNavigate: (v: View) => void
}

export function Sidebar({ currentView, onNavigate }: Props) {
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <aside
      className="w-72 flex flex-col h-screen shrink-0 relative overflow-hidden"
      style={{ background: '#0f0d0b', borderRight: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Ambient top glow */}
      <div
        className="absolute top-0 left-0 right-0 pointer-events-none"
        style={{
          height: 220,
          background: 'radial-gradient(ellipse 130% 80% at 50% -10%, rgba(245,158,11,0.09) 0%, transparent 70%)',
        }}
      />

      {/* Brand */}
      <div className="relative" style={{ padding: '40px 32px 32px 32px' }}>
        <div className="flex items-center" style={{ gap: '16px' }}>
          {/* Icon with blur glow layer */}
          <div className="relative shrink-0">
            <div
              className="absolute inset-0 rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
                filter: 'blur(14px)',
                opacity: 0.45,
              }}
            />
            <div
              className="relative w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
                boxShadow: '0 8px 24px rgba(245,158,11,0.35)',
              }}
            >
              <PlaneTakeoff className="w-6 h-6 text-white" strokeWidth={2.5} />
            </div>
          </div>

          <div>
            <p className="text-xl font-bold text-white leading-tight tracking-tight">AeroClaim</p>
            <p className="text-xs font-semibold tracking-[0.2em] uppercase" style={{ color: '#f59e0b' }}>
              Autopilot
            </p>
          </div>
        </div>

        {/* Status + date row */}
        <div className="flex items-center justify-between" style={{ marginTop: '20px', gap: '12px' }}>
          <div
            className="flex items-center rounded-xl flex-1"
            style={{ padding: '8px 12px', gap: '8px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}
          >
            <span
              className="w-2 h-2 rounded-full bg-green-400 shrink-0 animate-pulse"
              style={{ boxShadow: '0 0 6px rgba(34,197,94,0.8)' }}
            />
            <span className="text-xs font-semibold text-green-400">Agent online</span>
          </div>
          <span className="text-[10px] font-medium shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }}>
            {today}
          </span>
        </div>
      </div>

      {/* Gradient divider */}
      <div
        className="mx-6 mb-4"
        style={{
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.09), transparent)',
        }}
      />

      {/* Nav */}
      <nav className="flex-1" style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p
          className="text-[10px] font-bold uppercase tracking-[0.18em]"
          style={{ color: 'rgba(255,255,255,0.2)', padding: '0 12px 4px 12px' }}
        >
          Navigation
        </p>

        <NavItem
          icon={<MessageSquare className="w-5 h-5" />}
          label="Claims Agent"
          sublabel="Analyze a new flight"
          active={currentView === 'chat'}
          onClick={() => onNavigate('chat')}
        />
        <NavItem
          icon={<History className="w-5 h-5" />}
          label="History"
          sublabel="Past submissions"
          active={currentView === 'history'}
          onClick={() => onNavigate('history')}
        />
      </nav>

      {/* Stats mini-grid */}
      <div style={{ padding: '0 24px', marginBottom: '24px' }}>
        <div className="grid grid-cols-3" style={{ gap: '12px' }}>
          {[
            { label: 'Flights', value: '3' },
            { label: 'Eligible', value: '2' },
            { label: 'Max', value: '€600' },
          ].map(s => (
            <div
              key={s.label}
              className="rounded-[14px] p-3.5 text-center"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <p className="text-xs font-bold text-white">{s.value}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer info */}
      <div style={{ padding: '0 24px 32px 24px' }}>
        <div
          className="rounded-2xl"
          style={{ padding: '16px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)' }}
        >
          <div className="flex items-center" style={{ gap: '8px', marginBottom: '8px' }}>
            <Scale className="w-3 h-3 shrink-0" style={{ color: '#f59e0b' }} />
            <p className="text-xs font-bold" style={{ color: '#f59e0b' }}>
              EU Regulation 261/2004
            </p>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Automated compensation engine. Up to €600 per eligible flight.
          </p>
        </div>
      </div>
    </aside>
  )
}

function NavItem({
  icon,
  label,
  sublabel,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  sublabel: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center rounded-[20px] transition-all duration-200 cursor-pointer text-left"
      style={
        active
          ? {
              padding: '16px 20px',
              gap: '16px',
              background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(234,88,12,0.10))',
              border: '1px solid rgba(245,158,11,0.2)',
              boxShadow: '0 0 20px rgba(245,158,11,0.06) inset',
            }
          : {
              padding: '16px 20px',
              gap: '16px',
              background: 'transparent',
              border: '1px solid transparent',
            }
      }
    >
      <div
        className="w-10 h-10 rounded-[14px] flex items-center justify-center shrink-0 transition-all duration-200"
        style={
          active
            ? {
                background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
                boxShadow: '0 4px 14px rgba(245,158,11,0.35)',
                color: 'white',
              }
            : {
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.35)',
              }
        }
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-semibold leading-tight"
          style={{ color: active ? 'white' : 'rgba(255,255,255,0.5)' }}
        >
          {label}
        </p>
        <p
          className="text-xs"
          style={{ marginTop: '4px', color: active ? 'rgba(245,158,11,0.7)' : 'rgba(255,255,255,0.25)' }}
        >
          {sublabel}
        </p>
      </div>
      {active && (
        <div
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: '#f59e0b', boxShadow: '0 0 6px rgba(245,158,11,0.8)' }}
        />
      )}
    </button>
  )
}
