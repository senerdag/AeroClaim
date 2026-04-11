<div align="center">
  <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/plane-takeoff.svg" width="80" height="80" alt="AeroClaim Logo">
  <h1 align="center">AeroClaim Autopilot</h1>
  <h3 align="center">Fully Autonomous, Voice-Native EU261 Aviation Compensation AI</h3>
</div>

<p align="center">
  Built for <b>FinTech Hackathon 2026</b>
</p>

---

## ⚡ What is AeroClaim Autopilot?
AeroClaim Autopilot is an intelligent, voice-first AI agent designed to completely automate flight delay compensation under EU Regulation 261/2004. Instead of dealing with confusing legal forms, passengers simply **speak out loud** to our Voice AI, telling it their flight number and experience. 

AeroClaim verifies the flight against a deterministic database, calculates statutory eligibility, dynamically authors a personalized legal demand using a sophisticated LLM (Llama 3.3-70B), reads the draft aloud, and dispatches the formal litigation email directly to the airline—all in seconds.

## ✨ Core Features
*   🎙️ **Real-Time Voice UI**: Seamless, ultra-low latency push-to-talk interface using **ElevenLabs** WebSockets (Scribe STT + Turbo TTS). It cleans background noise, normalizes complex flight dictations (e.g., "Double You Six" -> "W6"), and communicates conversationally.
*   ⚖️ **Legal Hallucination Defense**: Integrates deterministic C# backend business logic with Llama 3.3. It prevents "generative AI hallucinations" by rigidly grounding the agent to factual flight delay metrics and European statutory limits *before* text generation occurs.
*   🤖 **Autonomous Agent Pipeline**: Complete visual tracking. Users see the active steps as the AI cross-references APIs, runs the worker services, evaluates Article 7 frameworks, and drafts the legal claim. 
*   📊 **Command Center & Ledger**: Aesthetic, high-legibility dark mode dashboard for tracking total recovered yields, aggregated success metrics, and maintaining a persistent legal dispatch history.

## 🛠️ Architecture & Tech Stack

**Frontend (Client)**
*   **React 18 + Vite** for a highly responsive single-page application.
*   **Tailwind CSS v4** & **Framer Motion** for premium glassmorphic UI, dynamic glowing aesthetics, and fluent micro-animations.
*   **ElevenLabs SDK** for ambient noise isolation and conversational fluidity.

**Backend (Server)**
*   **C# / .NET 10 Minimal APIs**: Robust, high-performance controller endpoints.
*   **MediatR**: For clean CQRS-based request routing.
*   **Entity Framework Core & SQLite**: Persistent legal ledger. 
*   **Groq API (Llama 3.3 70B)**: Asynchronous worker service utilizing advanced language modeling to draft bulletproof legal assertions.

## 🚀 Running Locally

**Prerequisites:**
- .NET 10 SDK
- Node.js (v20+)
- Empty SQLite Database
- ElevenLabs API Key & Groq API Key

**1. Clone & Setup Backend**
```bash
cd AeroClaim.Api
dotnet restore
dotnet run
# The Minimal API spins up on http://localhost:5000
```

**2. Setup Frontend**
```bash
cd AeroClaim.Web
npm install
npm run dev
# The React UI spins up on http://localhost:5173
```

**3. Configure Environments**
Create a `.env` in the `AeroClaim.Web` folder ensuring the API hooks are linked:
```env
VITE_API_BASE_URL="http://localhost:5000"
```

## 🏆 Hackathon Evaluation Target
AeroClaim directly addresses the core **Finance & LegalTech Theme** by recovering unrealized passenger compensation funds. 
We've tightly optimized:
- **Trustworthiness**: Zero-hallucination routing using deterministic grounding.
- **UX**: A completely frictionless, microphone-based legal assistant.
- **Originality**: Moving beyond traditional multi-step web forms directly into physical speech interaction. 

*(Please refer to `explanation.md` and `endpoints.md` for extended grading rubrics and deep API architecture).*
