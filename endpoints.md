# AeroClaim API Endpoints Documentation

AeroClaim's backend exposes three strict, RESTful `.NET Minimal API` endpoints that drive the entire agentic pipeline. They handle flight data orchestration, state persistence to SQLite, and triggering the specific external AI Web Workers.

---

### 1. Execute Claim Pipeline
**`POST /api/claims/execute`**

**Explanation:**
This is the core entry point for the Application. When a user submits a flight number (via UI typing or voice dictation), this endpoint locates the raw flight timeline data from the database. It then dispatches an HTTP call to the asynchronous `AeroClaim.Worker` (which talks to Groq / LLaMA 3.3-70B) to evaluate EU261 qualification, calculate financial compensation, and synthesize the legal email. Lastly, it persists the result in the SQLite `Claims` historical table.

**Request Body Example:**
```json
{
  "flightNumber": "W62205"
}
```

**Successful Response Example (`200 OK`):**
```json
{
  "id": 14,
  "is_eligible": true,
  "calculated_compensation_eur": 250,
  "airline_target_email": "claims@wizzair.com",
  "email_subject": "EU261 Compensation Claim - Flight W62205",
  "email_body_draft": "Dear Wizz Air Legal Department,\n\nI demand compensation under EU Regulation 261/2004 for flight W62205 (BUD→EIN), delayed 270 minutes.\n\nSincerely,\nSener Dag",
  "flight": {
    "flightNumber": "W62205",
    "airline": "Wizz Air",
    "departure": "BUD",
    "arrival": "EIN",
    "delayMinutes": 270,
    "distanceKm": 1150
  }
}
```
**Error Response Example (`404 Not Found`):**
*Returned if the flight string does not correspond to an established, tracked flight sequence.*
```json
{
  "error": "Flight not found"
}
```

---

### 2. Dispatch Legal Demand Email
**`POST /api/claims/send`**

**Explanation:**
This endpoint executes the final compliance step. Once the user reviews the AI-generated context and clicks 'Send', this endpoint initiates the outbound email delivery queue through the worker. It then locates the corresponding claim record in SQLite and permanently updates the `EmailSent` flag and `SentAt` timestamp for record-keeping.

**Request Body Example:**
```json
{
  "to": "claims@wizzair.com",
  "subject": "EU261 Compensation Claim - Flight W62205",
  "body": "Dear Wizz Air Legal Department,\n\nI demand compensation under EU Regulation 261/2004 for flight W62205...",
  "claimId": 14
}
```

**Successful Response Example (`200 OK`):**
```json
{
  "success": true
}
```

---

### 3. Retrieve Claim History
**`GET /api/claims/history`**

**Explanation:**
Retrieves a paginated list (top 50) of all processed claims ordered by creation time. This acts as the administrative ledger, feeding the Dashboard view's charts and history table arrays. It extracts data directly from Entity Framework Core's `AppDbContext`.

**Request Body:** None required.

**Successful Response Example (`200 OK`):**
```json
[
  {
    "id": 14,
    "flightNumber": "W62205",
    "airline": "Wizz Air",
    "departure": "BUD",
    "arrival": "EIN",
    "delayMinutes": 270,
    "distanceKm": 1150,
    "compensationEur": 250,
    "isEligible": true,
    "airlineEmail": "claims@wizzair.com",
    "emailSubject": "EU261 Compensation Claim - Flight W62205",
    "emailBody": "Dear Wizz Air...",
    "emailSent": true,
    "createdAt": "2026-04-10T12:05:00Z",
    "sentAt": "2026-04-10T12:07:05Z"
  },
  {
    "id": 15,
    "flightNumber": "LH1900",
    "airline": "Lufthansa",
    "departure": "FRA",
    "arrival": "BUD",
    "delayMinutes": 45,
    "distanceKm": 870,
    "compensationEur": 0,
    "isEligible": false,
    "airlineEmail": "claims@lufthansa.com",
    "emailSubject": "EU261 Analysis",
    "emailBody": "Not eligible due to insufficient delay limits.",
    "emailSent": false,
    "createdAt": "2026-04-10T14:30:00Z",
    "sentAt": null
  }
]
```
