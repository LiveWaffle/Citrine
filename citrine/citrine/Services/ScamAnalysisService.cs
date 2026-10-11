using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using citrine.Models;

namespace citrine.Services;

public sealed class ScamAnalysisService
{
    private static readonly Regex UrlRegex = new(@"https?://[^\s]+|www\.[^\s]+", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex EmailRegex = new(@"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex PhoneRegex = new(@"\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b", RegexOptions.Compiled);
    private static readonly Regex AmountRegex = new(@"(?:\$|USD\s*)\d{2,}(?:,\d{3})*(?:\.\d{2})?", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex CodeRegex = new(@"\b(?:verification|security|one[-\s]?time|2fa|mfa)\s+(?:code|pin)\b|\b\d{6}\b", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public ScamAnalysisResult Analyze(string content)
    {
        var normalized = Normalize(content);
        var signals = new List<ScamSignal>();

        AddIf(signals, UrlRegex.IsMatch(content), "Link", "Contains a link or website.", 10);
        AddIf(signals, HasShortenedUrl(content), "Short link", "Uses a shortened or obscured link.", 20);
        AddIf(signals, EmailRegex.IsMatch(content), "Email", "Contains an email address.", 8);
        AddIf(signals, PhoneRegex.IsMatch(content), "Phone", "Contains a phone number.", 8);
        AddIf(signals, AmountRegex.IsMatch(content), "Money request", "Mentions a payment or requested amount.", 16);
        AddIf(signals, CodeRegex.IsMatch(content), "Verification code", "Mentions a verification code or one-time PIN.", 25);
        AddIf(signals, ContainsAny(normalized, "urgent", "immediately", "act now", "final notice", "limited time", "today only"), "Urgency", "Uses time pressure.", 18);
        AddIf(signals, ContainsAny(normalized, "gift card", "steam card", "apple card", "google play", "crypto", "bitcoin", "wire transfer", "zelle", "cash app"), "Irreversible payment", "Requests a risky payment method.", 28);
        AddIf(signals, ContainsAny(normalized, "remote access", "anydesk", "teamviewer", "screen share", "install this app"), "Remote access", "Asks for remote access or screen sharing.", 30);
        AddIf(signals, ContainsAny(normalized, "password", "login", "account locked", "suspended", "verify your account"), "Credential pressure", "Asks for account access or verification.", 22);
        AddIf(signals, ContainsAny(normalized, "bank", "irs", "medicare", "social security", "amazon", "paypal", "microsoft", "apple support"), "Impersonation", "References a trusted institution or brand.", 15);
        AddIf(signals, ContainsAny(normalized, "grandchild", "grandson", "granddaughter", "bail", "hospital", "medicare", "social security", "retirement"), "Senior risk pattern", "Matches common elder-targeting language.", 24);

        var score = Math.Min(100, signals.Sum(signal => signal.Weight));
        var risk = score switch
        {
            >= 80 => ScamRiskLevel.Critical,
            >= 55 => ScamRiskLevel.High,
            >= 25 => ScamRiskLevel.Medium,
            _ => ScamRiskLevel.Low
        };

        var category = DetermineCategory(normalized, signals);
        var contentHash = Hash(normalized);
        var fingerprintKey = BuildFingerprintKey(category, normalized, signals);
        var seniorProtectionRecommended = signals.Any(signal => signal.Name is "Senior risk pattern" or "Irreversible payment" or "Remote access" or "Verification code");

        return new ScamAnalysisResult(
            risk,
            score,
            category,
            contentHash,
            fingerprintKey,
            signals,
            seniorProtectionRecommended);
    }

    public string Redact(string content)
    {
        var redacted = EmailRegex.Replace(content, match =>
        {
            var parts = match.Value.Split('@', 2);
            var first = parts[0].Length > 0 ? parts[0][0] : '*';
            return $"{first}***@{parts[1]}";
        });

        redacted = PhoneRegex.Replace(redacted, match =>
        {
            var digits = new string(match.Value.Where(char.IsDigit).ToArray());
            var lastFour = digits.Length >= 4 ? digits[^4..] : "****";
            return $"***-***-{lastFour}";
        });

        redacted = UrlRegex.Replace(redacted, match =>
        {
            var value = match.Value.StartsWith("http", StringComparison.OrdinalIgnoreCase)
                ? match.Value
                : $"https://{match.Value}";

            return Uri.TryCreate(value, UriKind.Absolute, out var uri)
                ? $"{uri.Host}/..."
                : "[link removed]";
        });

        redacted = CodeRegex.Replace(redacted, "[code removed]");
        return redacted.Trim();
    }

    public string BuildSafetyNote(string content, ScamAnalysisResult analysis)
    {
        var builder = new StringBuilder();
        builder.AppendLine("Pause before paying, sharing codes, or installing remote-access software.");
        builder.AppendLine($"Risk: {analysis.RiskLevel} ({analysis.RiskScore}/100).");

        if (analysis.Signals.Count > 0)
        {
            builder.AppendLine("Signals found:");
            foreach (var signal in analysis.Signals.Take(5))
            {
                builder.AppendLine($"- {signal.Name}: {signal.Detail}");
            }
        }

        builder.AppendLine("Verify through a phone number or website you already trust, not through the message.");
        builder.AppendLine("If this involves money, codes, or account access, ask a trusted person to review it first.");
        return builder.ToString();
    }

    public IReadOnlyList<string> BuildTraits(ScamAnalysisResult analysis)
    {
        return analysis.Signals
            .Select(signal => signal.Name)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(name => name)
            .ToArray();
    }

    private static void AddIf(List<ScamSignal> signals, bool condition, string name, string detail, int weight)
    {
        if (condition)
        {
            signals.Add(new ScamSignal(name, detail, weight));
        }
    }

    private static bool ContainsAny(string content, params string[] terms)
    {
        return terms.Any(term => content.Contains(term, StringComparison.OrdinalIgnoreCase));
    }

    private static bool HasShortenedUrl(string content)
    {
        return UrlRegex.Matches(content)
            .Select(match => match.Value)
            .Any(url => ContainsAny(url, "bit.ly", "tinyurl", "t.co", "goo.gl", "ow.ly", "is.gd", "rebrand.ly"));
    }

    private static string DetermineCategory(string normalized, IReadOnlyCollection<ScamSignal> signals)
    {
        if (ContainsAny(normalized, "bank", "account locked", "verify your account", "password", "login"))
        {
            return "Account impersonation";
        }

        if (ContainsAny(normalized, "gift card", "crypto", "bitcoin", "wire transfer", "zelle", "cash app"))
        {
            return "Payment request";
        }

        if (ContainsAny(normalized, "package", "delivery", "tracking", "shipping"))
        {
            return "Delivery impersonation";
        }

        if (ContainsAny(normalized, "remote access", "anydesk", "teamviewer", "microsoft support", "apple support"))
        {
            return "Tech support";
        }

        if (signals.Any(signal => signal.Name == "Senior risk pattern"))
        {
            return "Senior-targeting pattern";
        }

        return signals.Count == 0 ? "Unclassified" : "Suspicious content";
    }

    private static string BuildFingerprintKey(string category, string normalized, IEnumerable<ScamSignal> signals)
    {
        var domains = UrlRegex.Matches(normalized)
            .Select(match => match.Value.StartsWith("http", StringComparison.OrdinalIgnoreCase) ? match.Value : $"https://{match.Value}")
            .Select(url => Uri.TryCreate(url, UriKind.Absolute, out var uri) ? uri.Host : string.Empty)
            .Where(domain => !string.IsNullOrWhiteSpace(domain))
            .Distinct(StringComparer.OrdinalIgnoreCase);

        var signalKey = string.Join("-", signals.Select(signal => signal.Name).Distinct().OrderBy(name => name));
        var rawKey = $"{category}|{string.Join(",", domains)}|{signalKey}";
        return Hash(rawKey)[..16];
    }

    private static string Normalize(string content)
    {
        return Regex.Replace(content.Trim().ToLowerInvariant(), @"\s+", " ");
    }

    private static string Hash(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
