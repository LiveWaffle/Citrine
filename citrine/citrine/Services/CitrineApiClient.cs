using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using citrine.Models;

namespace citrine.Services;

public sealed class CitrineApiException(HttpStatusCode statusCode, string message) : Exception(message)
{
    public HttpStatusCode StatusCode { get; } = statusCode;
}

public sealed class CitrineApiClient : IDisposable
{
    private readonly CookieContainer _cookies = new();
    private readonly HttpClient _http;
    private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web);
    private string? _csrfToken;

    public CitrineApiClient()
    {
        var address = (Environment.GetEnvironmentVariable("CITRINE_API_URL")
            ?? "http://127.0.0.1:3001").TrimEnd('/');
        if (!address.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
        {
            address += "/api";
        }

        if (!Uri.TryCreate(address + "/", UriKind.Absolute, out var uri)
            || (uri.Scheme != "http" && uri.Scheme != "https") || !string.IsNullOrEmpty(uri.UserInfo))
        {
            throw new ArgumentException("CITRINE_API_URL must be an HTTP or HTTPS server URL.");
        }
        if (uri.Scheme != "https" && !uri.IsLoopback)
        {
            throw new ArgumentException("CITRINE_API_URL must use HTTPS outside this computer.");
        }

        _http = new HttpClient(new HttpClientHandler
        {
            CookieContainer = _cookies,
            UseCookies = true,
            AllowAutoRedirect = false
        }) { BaseAddress = uri, Timeout = TimeSpan.FromSeconds(30) };
    }

    public string BaseAddress => _http.BaseAddress!.ToString().TrimEnd('/');

    public async Task<AuthSession> SessionAsync() => await AuthenticateAsync("auth/session", HttpMethod.Get);
    public async Task<AuthSession> LoginAsync(string username, string password) =>
        await AuthenticateAsync("auth/login", HttpMethod.Post, new { username, password });
    public async Task<AuthSession> RegisterAsync(string username, string password) =>
        await AuthenticateAsync("auth/register", HttpMethod.Post, new { username, password });
    public async Task<AuthSession> ChangePasswordAsync(string currentPassword, string newPassword) =>
        await AuthenticateAsync("auth/password", HttpMethod.Post, new { currentPassword, newPassword });

    public async Task LogoutAsync()
    {
        await SendAsync<object>(HttpMethod.Post, "auth/logout");
        ClearSession();
    }

    public void ClearSession()
    {
        _csrfToken = null;
        foreach (Cookie cookie in _cookies.GetAllCookies())
        {
            cookie.Expired = true;
        }
    }

    public Task<WorkspaceSummary> WorkspaceAsync() => GetAsync<WorkspaceSummary>("workspace");
    public Task<ScamStatistics> AnalyticsAsync() => GetAsync<ScamStatistics>("analytics");
    public Task<ExamplePageResult> ExamplesAsync(string label, string search, int page) =>
        GetAsync<ExamplePageResult>("examples?label=" + Uri.EscapeDataString(label)
            + "&search=" + Uri.EscapeDataString(search) + "&page=" + page);
    public Task<ScamExample> ExampleAsync(string id) => GetAsync<ScamExample>("examples/" + Uri.EscapeDataString(id));
    public Task<List<ScamReport>> ReportsAsync(string search) =>
        GetAsync<List<ScamReport>>("reports?search=" + Uri.EscapeDataString(search));
    public Task<List<ScamReport>> SeniorReportsAsync() => GetAsync<List<ScamReport>>("reports?seniorProtection=true");
    public Task<ScamReport> ReportAsync(Guid id) => GetAsync<ScamReport>($"reports/{id}");
    public Task<List<ScamFingerprint>> FingerprintsAsync() => GetAsync<List<ScamFingerprint>>("fingerprints");
    public Task<List<PointsLedgerEntry>> PointsAsync() => GetAsync<List<PointsLedgerEntry>>("points");
    public Task<ProtectionNote> ProtectionNoteAsync(Guid id) => GetAsync<ProtectionNote>($"reports/{id}/protection-note");
    public Task<SubmissionAnalysis> AnalyzeAsync(string content, string category) =>
        RequiredAsync<SubmissionAnalysis>(HttpMethod.Post, "analysis", new { content, category });
    public Task<ScamReport> SaveReportAsync(string content, string category, string confidenceLevel,
        bool containsPersonalInfo, bool privacyReviewed) => RequiredAsync<ScamReport>(HttpMethod.Post, "reports",
        new { content, category, confidenceLevel, containsPersonalInfo, privacyReviewed });
    public Task<ScamReport> UpdateReportAsync(ScamReport report, ReportStatus status, string reason) =>
        RequiredAsync<ScamReport>(HttpMethod.Patch, $"reports/{report.Id}/status",
            new { status, reason, expectedStatus = report.Status });
    public async Task DeleteWorkspaceAsync() => await SendAsync<object>(HttpMethod.Delete, "workspace");
    public Task<List<ScamReport>> ModerationReportsAsync(string status, string search) =>
        GetAsync<List<ScamReport>>("moderation/reports?status=" + Uri.EscapeDataString(status)
            + "&search=" + Uri.EscapeDataString(search));
    public Task<List<ModerationAction>> ModerationActionsAsync(Guid? reportId = null) =>
        GetAsync<List<ModerationAction>>("moderation/actions" + (reportId is null ? "" : $"?reportId={reportId}"));
    public Task<List<AccountUser>> UsersAsync() => GetAsync<List<AccountUser>>("admin/users");
    public Task<AccountUser> UpdateUserAsync(AccountUser user, string role, string status, string reason) =>
        RequiredAsync<AccountUser>(HttpMethod.Patch, "admin/users/" + Uri.EscapeDataString(user.Id),
            new { role, status, reason, expectedRole = user.Role, expectedStatus = user.Status });

    private async Task<AuthSession> AuthenticateAsync(string path, HttpMethod method, object? body = null)
    {
        var session = await RequiredAsync<AuthSession>(method, path, body);
        _csrfToken = session.CsrfToken;
        return session;
    }

    private Task<T> GetAsync<T>(string path) => RequiredAsync<T>(HttpMethod.Get, path);

    private async Task<T> RequiredAsync<T>(HttpMethod method, string path, object? body = null) =>
        await SendAsync<T>(method, path, body)
        ?? throw new CitrineApiException(HttpStatusCode.BadGateway, "The server returned an empty response.");

    private async Task<T?> SendAsync<T>(HttpMethod method, string path, object? body = null)
    {
        using var request = new HttpRequestMessage(method, path);
        if (method != HttpMethod.Get)
        {
            request.Headers.Add("X-Citrine-Client", "1");
            if (_csrfToken is not null)
            {
                request.Headers.Add("X-CSRF-Token", _csrfToken);
            }
        }
        if (body is not null)
        {
            request.Content = JsonContent.Create(body, options: _jsonOptions);
        }

        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        // Bound reads as well as connection setup; never leave the UI waiting for an unfinished body.
        using var readTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        if (!response.IsSuccessStatusCode)
        {
            var message = $"Request failed ({(int)response.StatusCode}).";
            try
            {
                var error = await response.Content.ReadFromJsonAsync<ApiError>(_jsonOptions, readTimeout.Token);
                if (!string.IsNullOrWhiteSpace(error?.Message))
                {
                    message = error.Message;
                }
            }
            catch (JsonException) { }
            throw new CitrineApiException(response.StatusCode, message);
        }
        if (response.StatusCode == HttpStatusCode.NoContent)
        {
            return default;
        }
        return await response.Content.ReadFromJsonAsync<T>(_jsonOptions, readTimeout.Token);
    }

    public void Dispose() => _http.Dispose();

    private sealed class ApiError
    {
        public string? Message { get; init; }
    }
}
