using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace citrine.Models;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ScamRiskLevel
{
    Low,
    Medium,
    High,
    Critical
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ReportStatus
{
    Draft,
    PendingReview,
    Verified,
    Rejected,
    Duplicate
}

public sealed record ScamSignal(string Name, string Detail, int Weight);

public sealed record ScamAnalysisResult(
    ScamRiskLevel RiskLevel,
    int RiskScore,
    string Category,
    string ContentHash,
    string FingerprintKey,
    IReadOnlyList<ScamSignal> Signals,
    bool SeniorProtectionRecommended);

public sealed class ScamReport
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string OwnerId { get; init; } = string.Empty;
    public string SubmittedBy { get; init; } = string.Empty;
    public bool IsDemo { get; init; }
    public string? SourceExampleId { get; init; }
    public DateTimeOffset SubmittedAt { get; init; } = DateTimeOffset.Now;
    public string ContentPreview { get; init; } = string.Empty;
    public bool ContainsPersonalInfo { get; init; }
    public string ConfidenceLevel { get; init; } = string.Empty;
    public string ContentHash { get; init; } = string.Empty;
    public string FingerprintKey { get; init; } = string.Empty;
    public string Category { get; init; } = string.Empty;
    public ScamRiskLevel RiskLevel { get; init; }
    public int RiskScore { get; init; }
    public ReportStatus Status { get; set; } = ReportStatus.PendingReview;
    public bool SeniorProtectionEnabled { get; init; }
    public int PointsAwarded { get; set; }
    public IReadOnlyList<ScamSignal> Signals { get; init; } = Array.Empty<ScamSignal>();
    public Guid? DuplicateOf { get; set; }

    public string ShortId => Id.ToString("N")[..8];

    public override string ToString()
    {
        return $"{RiskLevel} · {Status} · {Category} · {ShortId}";
    }
}

public sealed class ScamFingerprint
{
    public string Key { get; init; } = string.Empty;
    public string Category { get; init; } = string.Empty;
    public ScamRiskLevel HighestRiskLevel { get; set; }
    public int SeenCount { get; set; }
    public DateTimeOffset LastSeenAt { get; set; } = DateTimeOffset.Now;
    public List<string> Traits { get; init; } = [];

    public override string ToString()
    {
        return $"{Category} · {HighestRiskLevel} · seen {SeenCount}";
    }
}

public sealed class PointsLedgerEntry
{
    public long Id { get; init; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.Now;
    public Guid ReportId { get; init; }
    public string Reason { get; init; } = string.Empty;
    public int Points { get; init; }

    public override string ToString()
    {
        return $"{(Points >= 0 ? "+" : string.Empty)}{Points} · {Reason}";
    }
}
