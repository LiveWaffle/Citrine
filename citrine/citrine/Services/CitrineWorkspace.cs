using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Text.Json;
using citrine.Models;

namespace citrine.Services;

public sealed class CitrineWorkspace
{
    private readonly ScamAnalysisService _analysisService;
    private readonly string _dataPath;
    private readonly JsonSerializerOptions _jsonOptions = new() { WriteIndented = true };

    public CitrineWorkspace(ScamAnalysisService analysisService)
    {
        _analysisService = analysisService;
        var dataDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Citrine");
        Directory.CreateDirectory(dataDirectory);
        _dataPath = Path.Combine(dataDirectory, "workspace.json");
    }

    public ObservableCollection<ScamReport> Reports { get; } = [];
    public ObservableCollection<ScamFingerprint> Fingerprints { get; } = [];
    public ObservableCollection<PointsLedgerEntry> PointsLedger { get; } = [];

    public int TotalPoints => PointsLedger.Sum(entry => entry.Points);
    public int PendingReviewCount => Reports.Count(report => report.Status == ReportStatus.PendingReview);
    public int SeniorProtectionCount => Reports.Count(report => report.SeniorProtectionEnabled);
    public string DataPath => _dataPath;

    public void Load()
    {
        if (!File.Exists(_dataPath))
        {
            return;
        }

        var json = File.ReadAllText(_dataPath);
        var state = JsonSerializer.Deserialize<WorkspaceState>(json, _jsonOptions);
        if (state is null)
        {
            return;
        }

        Reports.Clear();
        Fingerprints.Clear();
        PointsLedger.Clear();

        foreach (var report in state.Reports.OrderByDescending(report => report.SubmittedAt))
        {
            Reports.Add(report.ToModel());
        }

        foreach (var fingerprint in state.Fingerprints.OrderByDescending(fingerprint => fingerprint.LastSeenAt))
        {
            Fingerprints.Add(fingerprint.ToModel());
        }

        foreach (var entry in state.PointsLedger.OrderByDescending(entry => entry.CreatedAt))
        {
            PointsLedger.Add(entry.ToModel());
        }
    }

    public ScamReport AddReport(
        string content,
        string confidenceLevel,
        bool containsPersonalInfo,
        ScamAnalysisResult analysis)
    {
        var duplicate = Reports.FirstOrDefault(report => report.ContentHash == analysis.ContentHash);
        var isDuplicate = duplicate is not null;
        var points = isDuplicate ? 0 : CalculatePoints(analysis, confidenceLevel);

        var report = new ScamReport
        {
            ContentPreview = _analysisService.Redact(content),
            ContainsPersonalInfo = containsPersonalInfo,
            ConfidenceLevel = confidenceLevel,
            ContentHash = analysis.ContentHash,
            FingerprintKey = analysis.FingerprintKey,
            Category = analysis.Category,
            RiskLevel = analysis.RiskLevel,
            RiskScore = analysis.RiskScore,
            Status = isDuplicate ? ReportStatus.Duplicate : ReportStatus.PendingReview,
            SeniorProtectionEnabled = analysis.SeniorProtectionRecommended,
            PointsAwarded = points,
            Signals = analysis.Signals,
            DuplicateOf = duplicate?.Id
        };

        Reports.Insert(0, report);

        if (!isDuplicate)
        {
            UpsertFingerprint(analysis);
        }

        PointsLedger.Insert(0, new PointsLedgerEntry
        {
            ReportId = report.Id,
            Reason = isDuplicate ? "Duplicate report linked" : BuildPointsReason(analysis, confidenceLevel),
            Points = points
        });

        Save();
        return report;
    }

    public void UpdateStatus(ScamReport report, ReportStatus status)
    {
        report.Status = status;
        Save();
    }

    public void ClearAll()
    {
        Reports.Clear();
        Fingerprints.Clear();
        PointsLedger.Clear();

        if (File.Exists(_dataPath))
        {
            File.Delete(_dataPath);
        }
    }

    public void Save()
    {
        var state = new WorkspaceState
        {
            Reports = Reports.Select(ReportState.FromModel).ToList(),
            Fingerprints = Fingerprints.Select(FingerprintState.FromModel).ToList(),
            PointsLedger = PointsLedger.Select(PointsState.FromModel).ToList()
        };

        File.WriteAllText(_dataPath, JsonSerializer.Serialize(state, _jsonOptions));
    }

    private void UpsertFingerprint(ScamAnalysisResult analysis)
    {
        var fingerprint = Fingerprints.FirstOrDefault(item => item.Key == analysis.FingerprintKey);
        if (fingerprint is null)
        {
            fingerprint = new ScamFingerprint
            {
                Key = analysis.FingerprintKey,
                Category = analysis.Category,
                HighestRiskLevel = analysis.RiskLevel,
                SeenCount = 0
            };

            foreach (var trait in _analysisService.BuildTraits(analysis))
            {
                fingerprint.Traits.Add(trait);
            }

            Fingerprints.Insert(0, fingerprint);
        }

        fingerprint.SeenCount += 1;
        fingerprint.LastSeenAt = DateTimeOffset.Now;
        if (analysis.RiskLevel > fingerprint.HighestRiskLevel)
        {
            fingerprint.HighestRiskLevel = analysis.RiskLevel;
        }
    }

    private static int CalculatePoints(ScamAnalysisResult analysis, string confidenceLevel)
    {
        var basePoints = analysis.RiskLevel switch
        {
            ScamRiskLevel.Critical => 35,
            ScamRiskLevel.High => 25,
            ScamRiskLevel.Medium => 15,
            _ => 8
        };

        if (analysis.SeniorProtectionRecommended)
        {
            basePoints += 10;
        }

        if (confidenceLevel.Contains("unsure", StringComparison.OrdinalIgnoreCase))
        {
            basePoints = Math.Max(5, basePoints / 2);
        }

        return basePoints;
    }

    private static string BuildPointsReason(ScamAnalysisResult analysis, string confidenceLevel)
    {
        var reason = $"{analysis.RiskLevel} {analysis.Category.ToLowerInvariant()} report";
        return confidenceLevel.Contains("unsure", StringComparison.OrdinalIgnoreCase)
            ? $"{reason}, reduced for low confidence"
            : reason;
    }

    private sealed class WorkspaceState
    {
        public List<ReportState> Reports { get; set; } = [];
        public List<FingerprintState> Fingerprints { get; set; } = [];
        public List<PointsState> PointsLedger { get; set; } = [];
    }

    private sealed class ReportState
    {
        public Guid Id { get; set; }
        public DateTimeOffset SubmittedAt { get; set; }
        public string ContentPreview { get; set; } = string.Empty;
        public bool ContainsPersonalInfo { get; set; }
        public string ConfidenceLevel { get; set; } = string.Empty;
        public string ContentHash { get; set; } = string.Empty;
        public string FingerprintKey { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public ScamRiskLevel RiskLevel { get; set; }
        public int RiskScore { get; set; }
        public ReportStatus Status { get; set; }
        public bool SeniorProtectionEnabled { get; set; }
        public int PointsAwarded { get; set; }
        public List<ScamSignal> Signals { get; set; } = [];
        public Guid? DuplicateOf { get; set; }

        public ScamReport ToModel()
        {
            return new ScamReport
            {
                Id = Id,
                SubmittedAt = SubmittedAt,
                ContentPreview = ContentPreview,
                ContainsPersonalInfo = ContainsPersonalInfo,
                ConfidenceLevel = ConfidenceLevel,
                ContentHash = ContentHash,
                FingerprintKey = FingerprintKey,
                Category = Category,
                RiskLevel = RiskLevel,
                RiskScore = RiskScore,
                Status = Status,
                SeniorProtectionEnabled = SeniorProtectionEnabled,
                PointsAwarded = PointsAwarded,
                Signals = Signals,
                DuplicateOf = DuplicateOf
            };
        }

        public static ReportState FromModel(ScamReport report)
        {
            return new ReportState
            {
                Id = report.Id,
                SubmittedAt = report.SubmittedAt,
                ContentPreview = report.ContentPreview,
                ContainsPersonalInfo = report.ContainsPersonalInfo,
                ConfidenceLevel = report.ConfidenceLevel,
                ContentHash = report.ContentHash,
                FingerprintKey = report.FingerprintKey,
                Category = report.Category,
                RiskLevel = report.RiskLevel,
                RiskScore = report.RiskScore,
                Status = report.Status,
                SeniorProtectionEnabled = report.SeniorProtectionEnabled,
                PointsAwarded = report.PointsAwarded,
                Signals = report.Signals.ToList(),
                DuplicateOf = report.DuplicateOf
            };
        }
    }

    private sealed class FingerprintState
    {
        public string Key { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public ScamRiskLevel HighestRiskLevel { get; set; }
        public int SeenCount { get; set; }
        public DateTimeOffset LastSeenAt { get; set; }
        public List<string> Traits { get; set; } = [];

        public ScamFingerprint ToModel()
        {
            var fingerprint = new ScamFingerprint
            {
                Key = Key,
                Category = Category,
                HighestRiskLevel = HighestRiskLevel,
                SeenCount = SeenCount,
                LastSeenAt = LastSeenAt
            };

            foreach (var trait in Traits)
            {
                fingerprint.Traits.Add(trait);
            }

            return fingerprint;
        }

        public static FingerprintState FromModel(ScamFingerprint fingerprint)
        {
            return new FingerprintState
            {
                Key = fingerprint.Key,
                Category = fingerprint.Category,
                HighestRiskLevel = fingerprint.HighestRiskLevel,
                SeenCount = fingerprint.SeenCount,
                LastSeenAt = fingerprint.LastSeenAt,
                Traits = fingerprint.Traits.ToList()
            };
        }
    }

    private sealed class PointsState
    {
        public DateTimeOffset CreatedAt { get; set; }
        public Guid ReportId { get; set; }
        public string Reason { get; set; } = string.Empty;
        public int Points { get; set; }

        public PointsLedgerEntry ToModel()
        {
            return new PointsLedgerEntry
            {
                CreatedAt = CreatedAt,
                ReportId = ReportId,
                Reason = Reason,
                Points = Points
            };
        }

        public static PointsState FromModel(PointsLedgerEntry entry)
        {
            return new PointsState
            {
                CreatedAt = entry.CreatedAt,
                ReportId = entry.ReportId,
                Reason = entry.Reason,
                Points = entry.Points
            };
        }
    }
}
