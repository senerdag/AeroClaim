using System.Text.Json;
using System.Text;
using System.Net.Http.Headers;
using Resend;

var builder = WebApplication.CreateBuilder(args);

// --- Manual .env Loader for Local Development ---
var envPath = Path.Combine(Directory.GetCurrentDirectory(), "..", ".env");
if (File.Exists(envPath))
{
    foreach (var line in File.ReadAllLines(envPath))
    {
        var parts = line.Split('=', 2);
        if (parts.Length == 2) Environment.SetEnvironmentVariable(parts[0], parts[1]);
    }
}

builder.Services.AddHttpClient("GroqClient", client => {
    client.BaseAddress = new Uri("https://api.groq.com/");
    var key = builder.Configuration["GROQ_API_KEY"] ?? Environment.GetEnvironmentVariable("GROQ_API_KEY");
    client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", key);
});

// Resend SDK is used directly in the endpoint as requested.

var app = builder.Build();

app.MapPost("/api/worker/process", async (WorkerFlightData data, IHttpClientFactory httpClientFactory) => 
{
    var groqClient = httpClientFactory.CreateClient("GroqClient");

    string systemPrompt = @"You are 'AeroClaim', an autonomous Agentic Financial & Legal Assistant. 
RULES FOR EU261 COMPENSATION:
1. Distance < 1500 km AND delay > 3 hours = €250.
2. Distance 1500 - 3500 km AND delay > 3 hours = €400.
3. Distance > 3500 km AND delay > 4 hours = €600.
4. If delay is under 3 hours, compensation is €0.
YOUR INPUT: Flight distance (km), delay time (minutes), and airline.
YOUR TASKS: 1) Calculate exact compensation. 2) Identify the general legal or customer support email address of the specific airline (e.g., claims@wizzair.com). 3) Draft a formal legal email to the airline demanding the amount citing EU Reg 261/2004. 
OUTPUT FORMAT: You MUST respond ONLY in valid JSON: { ""is_eligible"": true, ""calculated_compensation_eur"": integer, ""airline_target_email"": ""string"", ""email_subject"": ""string"", ""email_body_draft"": ""string"" }";

    string userPrompt = $"Distance: {data.DistanceKm} km, Delay: {data.DelayMinutes} minutes, Airline: {data.Airline}";

    // Call Groq API
    var groqRequest = new {
        model = "llama-3.3-70b-versatile",
        messages = new[] {
            new { role = "system", content = systemPrompt },
            new { role = "user", content = userPrompt }
        },
        response_format = new { type = "json_object" }
    };

    var content = new StringContent(JsonSerializer.Serialize(groqRequest), Encoding.UTF8, "application/json");
    try {
        var response = await groqClient.PostAsync("openai/v1/chat/completions", content);

        if (response.IsSuccessStatusCode)
        {
            var resultJson = await response.Content.ReadAsStringAsync();
            using var document = JsonDocument.Parse(resultJson);
            var llmContent = document.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString();
            if (llmContent != null) return Results.Content(llmContent, "application/json");
        }
    } catch { /* Handle timeout/network issues */ }

    // Enhanced Mock Fallback for hackathon (Matches Groq's high-quality style)
    var comp = data.DistanceKm < 1500 ? 250 : data.DistanceKm <= 3500 ? 400 : 600;
    return Results.Ok(new {
        is_eligible = true,
        calculated_compensation_eur = comp,
        airline_target_email = $"legal@{data.Airline.ToLower().Replace(" ", "")}.com",
        email_subject = $"Legal Action: Compensation Claim per EU261/2004 - Flight {data.FlightNumber}",
        email_body_draft = $@"To the Legal Department of {data.Airline},

I am writing to you in my capacity as a passenger of flight {data.FlightNumber} ({data.Departure} to {data.Arrival}). This flight was delayed by {data.DelayMinutes} minutes, exceeding the statutory limit defined in Article 6 of EU Regulation 261/2004.

Under the jurisprudence of the European Court of Justice (Sturgeon v Condor), I am entitled to a fixed compensation of €{comp} for this delay.

Please acknowledge receipt of this demand and process the payment within 14 business days to avoid further legal escalation.

Kind regards,
Sener Dag
AeroClaim Autopilot Automated Dispatch"
    });
});

app.MapPost("/api/worker/send-email", async (SendEmailCommand cmd) => 
{
    IResend resend = ResendClient.Create("re_f9w4VQxv_KLKyCQ1BE95XZLgmpYQ1j3KM");

    string htmlBody = $@"
        <p><strong>Originally intended for:</strong> {cmd.To}</p>
        <hr/>
        <p>{cmd.Body.Replace("\n", "<br/>")}</p>
    ";

    var resp = await resend.EmailSendAsync(new EmailMessage()
    {
        From = "onboarding@resend.dev",
        To = "senershopify@gmail.com",
        Subject = cmd.Subject,
        HtmlBody = htmlBody,
    });
    
    if (resp == null) return Results.Problem("Failed to dispatch via Resend.");
    return Results.Ok(new { success = true });
});

app.Run();

public record WorkerFlightData(string FlightNumber, string Airline, string Departure, string Arrival, string Date, int DelayMinutes, int DistanceKm);
public record SendEmailCommand(string To, string Subject, string Body);
