# AeroClaimAutoPilot

An agentic flight delay compensation automation tool. Users enter a flight number, the system fetches flight data, calls an AI (Groq / Llama 3.3 70B) to determine EU261/2004 eligibility and draft a legal demand email, then sends it via Resend.

## Architecture

Three services, all containerized with Docker Compose:

| Service | Stack | Port |
|---|---|---|
| `AeroClaim.Api` | ASP.NET Core / .NET 10 | 5000 (host) → 8080 (container) |
| `AeroClaim.Worker` | ASP.NET Core / .NET 10 | 5001 (host) → 8080 (container) |
| `AeroClaim.Web` | React 18 + TypeScript + Vite | 3000 (host) → 5173 (container) |

### AeroClaim.Api (`AeroClaim.Api/Program.cs`)
- MediatR CQRS pattern
- SQLite via EF Core (auto-migrated on startup, `aeroclaim.db`)
- Endpoints:
  - `POST /api/claims/execute` — look up flight, call Worker AI, save to DB
  - `POST /api/claims/send` — forward email through Worker, mark claim sent
  - `GET /api/claims/history` — last 50 claims
- Falls back to rule-based calculation if Worker is unreachable

### AeroClaim.Worker (`AeroClaim.Worker/Program.cs`)
- Calls Groq API (`llama-3.3-70b-versatile`) with EU261 rules as system prompt
- Returns structured JSON (eligible, compensation amount, airline email, email draft)
- Sends emails via Resend SDK (`onboarding@resend.dev` → `senershopify@gmail.com` for demo)
- Has mock fallback if Groq API key fails
- Endpoints:
  - `POST /api/worker/process` — AI claim analysis
  - `POST /api/worker/send-email` — dispatch via Resend

### AeroClaim.Web (`AeroClaim.Web/`)
- React 18, TypeScript, Vite
- Tailwind CSS v4, Framer Motion, Lucide React, Radix UI
- React Router v6
- Three views: **Chat** (claim entry + stepper), **History**, **Dashboard**
- Components: `Sidebar`, `ChatArea`, `DashboardView`, `History`
- API base URL configured via `VITE_API_BASE_URL` env var

## EU261 Compensation Rules
- Distance < 1500 km AND delay ≥ 3h → **€250**
- Distance 1500–3500 km AND delay ≥ 3h → **€400**
- Distance > 3500 km AND delay ≥ 4h → **€600**

## Running Locally

```bash
# All services via Docker
docker-compose up --build

# Individual dev servers
# API  (from repo root)
dotnet run --project AeroClaim.Api

# Worker (from repo root)
dotnet run --project AeroClaim.Worker

# Web (from AeroClaim.Web/)
npm install && npm run dev
```

## Environment Variables

| Variable | Service | Description |
|---|---|---|
| `WorkerBaseUrl` | Api | Worker base URL (default: http://localhost:5001) |
| `GROQ_API_KEY` | Worker | Groq API key for LLM calls |
| `RESEND_API_KEY` | Worker | Resend API key for email (currently hardcoded in code too) |
| `VITE_API_BASE_URL` | Web | API base URL (default: http://localhost:5000) |

## Key Files

- `AeroClaimAutoPilot.sln` — solution file
- `docker-compose.yml` — full stack orchestration
- `AeroClaim.Api/Program.cs` — entire API (single-file minimal API + MediatR handlers + EF models)
- `AeroClaim.Worker/Program.cs` — entire Worker (Groq + Resend integration)
- `AeroClaim.Web/src/App.tsx` — root layout, view routing
- `AeroClaim.Web/src/components/` — Sidebar, ChatArea, DashboardView, History

## Notes

- Flight data is currently hardcoded in `GetFlightDetailsQueryHandler` (W62205, TK1234, LH1900)
- Both API and Worker are single-file programs (`Program.cs` only, no separate controllers/handlers directory)
- The Worker hardcodes a Resend API key and always routes to `senershopify@gmail.com` (demo behavior)
