using System;
using System.Collections.Generic;

namespace citrine.Models;

public sealed class AccountUser
{
    public string Id { get; init; } = string.Empty;
    public string Username { get; init; } = string.Empty;
    public string Role { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public DateTimeOffset CreatedAt { get; init; }
    public bool IsStaff => Status == "active" && Role is "moderator" or "admin";
    public bool IsAdmin => Status == "active" && Role == "admin";
}

public sealed class AuthSession
{
    public AccountUser? User { get; init; }
    public string? CsrfToken { get; init; }
}

public sealed class WorkspaceSummary
{
    public int TotalReports { get; init; }
    public int PendingReviewCount { get; init; }
    public int FingerprintCount { get; init; }
    public int TotalPoints { get; init; }
}

public sealed class SubmissionAnalysis
{
    public bool IsReferenceExample { get; init; }
    public ScamRiskLevel RiskLevel { get; init; }
    public int RiskScore { get; init; }
    public string Category { get; init; } = string.Empty;
    public string ContentHash { get; init; } = string.Empty;
    public string FingerprintKey { get; init; } = string.Empty;
    public IReadOnlyList<ScamSignal> Signals { get; init; } = [];
    public bool SeniorProtectionRecommended { get; init; }
    public string ContentPreview { get; init; } = string.Empty;
    public string DuplicateNotice { get; init; } = string.Empty;
    public string SeniorNotice { get; init; } = string.Empty;
}

public sealed class ExampleDataset
{
    public string Title { get; init; } = string.Empty;
    public string Attribution { get; init; } = string.Empty;
    public string LicenseNote { get; init; } = string.Empty;
    public int Total { get; init; }
    public int SpamCount { get; init; }
    public int HamCount { get; init; }
}

public sealed class ScamExample
{
    public string Id { get; init; } = string.Empty;
    public int SourceRow { get; init; }
    public string Label { get; init; } = string.Empty;
    public string Content { get; init; } = string.Empty;
    public string DisplayLabel => Label == "spam" ? "Spam" : "Ham (not spam)";
    public SubmissionAnalysis? Analysis { get; init; }
}

public sealed class ExamplePageResult
{
    public List<ScamExample> Items { get; init; } = [];
    public int Total { get; init; }
    public int Page { get; init; }
    public int PageSize { get; init; }
    public ExampleDataset? Dataset { get; init; }
}

public sealed class ProtectionNote
{
    public string Note { get; init; } = string.Empty;
}

public sealed class ModerationAction
{
    public string Id { get; init; } = string.Empty;
    public string ActorUsername { get; init; } = string.Empty;
    public string ActorId { get; init; } = string.Empty;
    public string? ReportId { get; init; }
    public string? TargetUserId { get; init; }
    public string Action { get; init; } = string.Empty;
    public string Reason { get; init; } = string.Empty;
    public string? PreviousStatus { get; init; }
    public string? NewStatus { get; init; }
    public DateTimeOffset CreatedAt { get; init; }
    public int PointsDelta { get; init; }
    public string StatusChange => PreviousStatus is null && NewStatus is null
        ? string.Empty : $"{PreviousStatus} -> {NewStatus}";
    public string Target => ReportId ?? TargetUserId ?? string.Empty;
}
