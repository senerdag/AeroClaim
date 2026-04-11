import { LayoutDashboard, CheckCircle2, TrendingUp, AlertCircle } from 'lucide-react'

export function DashboardView() {
  return (
    <div className="flex-1 p-12 overflow-y-auto relative" style={{ background: '#0a0806' }}>
      {/* Ambient top glow */}
      <div
        className="absolute top-0 right-0 left-0 h-96 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(245,158,11,0.05) 0%, transparent 70%)' }}
      />
      
      <div className="mb-12 border-b pb-8 relative z-10" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <h1 className="text-4xl font-black text-white tracking-tight mb-4 flex items-center gap-4">
          <LayoutDashboard className="w-10 h-10" style={{ color: '#f59e0b' }} />
          Command Center
        </h1>
        <p className="text-xl font-medium max-w-3xl" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Aggregate overview of your automated EU261 litigation yields and agent processing metrics.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
        <div className="rounded-3xl p-8 shadow-xl relative overflow-hidden group transition-all" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-lg font-bold uppercase tracking-widest mb-4 flex items-center gap-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <ActivityIcon /> Processing
          </p>
          <p className="text-6xl font-black text-white">0</p>
          <p className="text-base mt-4 font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>Claims currently in LLM pipeline</p>
        </div>
        
        <div className="rounded-3xl p-8 shadow-xl relative overflow-hidden group transition-all" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
           <p className="text-lg font-bold uppercase tracking-widest mb-4 flex items-center gap-3" style={{ color: '#f59e0b' }}>
            <TrendingUp className="w-5 h-5"/> Total Recovered
          </p>
          <p className="text-6xl font-black text-white">€0</p>
          <p className="text-base mt-4 font-medium" style={{ color: 'rgba(245,158,11,0.7)' }}>Statutory yield locked</p>
        </div>
        
        <div className="rounded-3xl p-8 shadow-xl relative overflow-hidden group transition-all" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
           <p className="text-lg font-bold uppercase tracking-widest mb-4 flex items-center gap-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <CheckCircle2 className="w-5 h-5"/> Success Rate
          </p>
          <p className="text-6xl font-black text-white">0%</p>
          <p className="text-base mt-4 font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>Of processed flight records</p>
        </div>
      </div>

      <div className="mt-12 rounded-3xl p-10 h-72 flex items-center justify-center relative overflow-hidden z-10" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="text-center relative z-10">
          <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.2)' }} />
          <h3 className="text-2xl font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>Yield Analytics Offline</h3>
          <p className="text-lg mt-2 font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>Process your first claim to generate visualization data.</p>
        </div>
      </div>
    </div>
  )
}

function ActivityIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
}
