using MediatR;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using System.Text;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

// SQLite
builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseSqlite("Data Source=aeroclaim.db"));

builder.Services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(Program).Assembly));
builder.Services.AddHttpClient("WorkerClient", client =>
{
    client.BaseAddress = new Uri(builder.Configuration["WorkerBaseUrl"] ?? "http://localhost:5001");
});
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();

// Auto-migrate
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
}

app.UseCors();

// Execute full claim pipeline
app.MapPost("/api/claims/execute", async (ClaimRequest request, IMediator mediator, AppDbContext db) =>
{
    var flightData = await mediator.Send(new GetFlightDetailsQuery(request.FlightNumber));
    if (flightData == null)
        return Results.NotFound(new { error = "Flight not found" });

    var command = new ExecuteClaimCommand(flightData);
    var result = await mediator.Send(command);

    // Save to history
    var record = new ClaimRecord
    {
        FlightNumber = flightData.FlightNumber,
        Airline = flightData.Airline,
        Departure = flightData.Departure,
        Arrival = flightData.Arrival,
        DelayMinutes = flightData.DelayMinutes,
        DistanceKm = flightData.DistanceKm,
        CompensationEur = result.CalculatedCompensationEur,
        IsEligible = result.IsEligible,
        AirlineEmail = result.AirlineTargetEmail,
        EmailSubject = result.EmailSubject,
        EmailBody = result.EmailBodyDraft,
        CreatedAt = DateTime.UtcNow
    };
    db.Claims.Add(record);
    await db.SaveChangesAsync();

    return Results.Ok(new
    {
        id = record.Id,
        is_eligible = result.IsEligible,
        calculated_compensation_eur = result.CalculatedCompensationEur,
        airline_target_email = result.AirlineTargetEmail,
        email_subject = result.EmailSubject,
        email_body_draft = result.EmailBodyDraft,
        flight = new
        {
            flightData.FlightNumber,
            flightData.Airline,
            flightData.Departure,
            flightData.Arrival,
            flightData.DelayMinutes,
            flightData.DistanceKm
        }
    });
});

// Send email
app.MapPost("/api/claims/send", async (SendEmailRequest request, IMediator mediator, AppDbContext db) =>
{
    var ok = await mediator.Send(new SendEmailCommand(request.To, request.Subject, request.Body));

    // Update history record if ID given
    if (request.ClaimId > 0)
    {
        var record = await db.Claims.FindAsync(request.ClaimId);
        if (record != null)
        {
            record.EmailSent = true;
            record.SentAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }
    }

    return Results.Ok(new { success = ok });
});

// Get claim history
app.MapGet("/api/claims/history", async (AppDbContext db) =>
{
    var claims = await db.Claims
        .OrderByDescending(c => c.CreatedAt)
        .Take(50)
        .ToListAsync();
    return Results.Ok(claims);
});

app.Run();

// --- DTOs ---
public record ClaimRequest(string FlightNumber);
public record SendEmailRequest(string To, string Subject, string Body, int ClaimId = 0);

// --- EF Core ---
public class ClaimRecord
{
    public int Id { get; set; }
    public string FlightNumber { get; set; } = "";
    public string Airline { get; set; } = "";
    public string Departure { get; set; } = "";
    public string Arrival { get; set; } = "";
    public int DelayMinutes { get; set; }
    public int DistanceKm { get; set; }
    public int CompensationEur { get; set; }
    public bool IsEligible { get; set; }
    public string AirlineEmail { get; set; } = "";
    public string EmailSubject { get; set; } = "";
    public string EmailBody { get; set; } = "";
    public bool EmailSent { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? SentAt { get; set; }
}

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }
    public DbSet<ClaimRecord> Claims => Set<ClaimRecord>();
}

// --- Models ---
public record FlightData(string FlightNumber, string Airline, string Departure, string Arrival, string Date, int DelayMinutes, int DistanceKm);

public class ClaimResultDto
{
    [JsonPropertyName("is_eligible")]
    public bool IsEligible { get; set; }
    [JsonPropertyName("calculated_compensation_eur")]
    public int CalculatedCompensationEur { get; set; }
    [JsonPropertyName("airline_target_email")]
    public string AirlineTargetEmail { get; set; } = "";
    [JsonPropertyName("email_subject")]
    public string EmailSubject { get; set; } = "";
    [JsonPropertyName("email_body_draft")]
    public string EmailBodyDraft { get; set; } = "";
}

// --- MediatR Handlers ---
public record GetFlightDetailsQuery(string FlightNumber) : IRequest<FlightData?>;

public class GetFlightDetailsQueryHandler : IRequestHandler<GetFlightDetailsQuery, FlightData?>
{
    public Task<FlightData?> Handle(GetFlightDetailsQuery request, CancellationToken ct)
    {
        var flights = new List<FlightData>
        {
            new("W62205", "Wizz Air", "BUD", "EIN", "2026-04-10", 270, 1150),
            new("TK1234", "Turkish Airlines", "IST", "BUD", "2026-04-08", 195, 1260),
            new("LH1900", "Lufthansa", "FRA", "BUD", "2026-04-09", 45, 870),
        };

        var match = flights.FirstOrDefault(f =>
            f.FlightNumber.Equals(request.FlightNumber, StringComparison.OrdinalIgnoreCase));

        return Task.FromResult(match);
    }
}

public record ExecuteClaimCommand(FlightData Flight) : IRequest<ClaimResultDto>;

public class ExecuteClaimCommandHandler : IRequestHandler<ExecuteClaimCommand, ClaimResultDto>
{
    private readonly IHttpClientFactory _httpClientFactory;
    public ExecuteClaimCommandHandler(IHttpClientFactory httpClientFactory) => _httpClientFactory = httpClientFactory;

    public async Task<ClaimResultDto> Handle(ExecuteClaimCommand request, CancellationToken ct)
    {
        var client = _httpClientFactory.CreateClient("WorkerClient");
        var json = JsonSerializer.Serialize(request.Flight);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        try
        {
            var response = await client.PostAsync("/api/worker/process", content, ct);
            if (response.IsSuccessStatusCode)
            {
                var resultStr = await response.Content.ReadAsStringAsync(ct);
                var result = JsonSerializer.Deserialize<ClaimResultDto>(resultStr);
                if (result != null) return result;
            }
        }
        catch { /* fallback below */ }

        // Fallback if worker unreachable
        return new ClaimResultDto
        {
            IsEligible = request.Flight.DelayMinutes >= 180,
            CalculatedCompensationEur = request.Flight.DistanceKm < 1500 ? 250 : request.Flight.DistanceKm <= 3500 ? 400 : 600,
            AirlineTargetEmail = $"claims@{request.Flight.Airline.ToLower().Replace(" ", "")}.com",
            EmailSubject = $"EU261 Compensation Claim - Flight {request.Flight.FlightNumber}",
            EmailBodyDraft = $"Dear {request.Flight.Airline} Legal Department,\n\nI demand compensation under EU Regulation 261/2004 for flight {request.Flight.FlightNumber} ({request.Flight.Departure}→{request.Flight.Arrival}), delayed {request.Flight.DelayMinutes} minutes.\n\nSincerely,\nSener Dag"
        };
    }
}

public record SendEmailCommand(string To, string Subject, string Body) : IRequest<bool>;

public class SendEmailCommandHandler : IRequestHandler<SendEmailCommand, bool>
{
    private readonly IHttpClientFactory _httpClientFactory;
    public SendEmailCommandHandler(IHttpClientFactory httpClientFactory) => _httpClientFactory = httpClientFactory;

    public async Task<bool> Handle(SendEmailCommand request, CancellationToken ct)
    {
        var client = _httpClientFactory.CreateClient("WorkerClient");
        var content = new StringContent(JsonSerializer.Serialize(request), Encoding.UTF8, "application/json");
        try
        {
            var response = await client.PostAsync("/api/worker/send-email", content, ct);
            return response.IsSuccessStatusCode;
        }
        catch { return false; }
    }
}
