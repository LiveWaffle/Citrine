using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Input;
using citrine.Models;
using citrine.Services;

namespace citrine;

public partial class MainWindow : Window
{
    private readonly CitrineApiClient _api = new();
    private AccountUser? _user;
    private SubmissionAnalysis? _analysis;
    private ScamReport? _selectedReport;
    private ScamReport? _moderationReport;
    private AccountUser? _selectedUser;
    private List<ScamReport> _reports = [];
    private List<ScamReport> _moderationReports = [];
    private Guid? _seniorId;
    private bool _allHistory = true;
    private bool _ready;
    private bool _binding;
    private bool _busy;
    private int _examplesPage = 1;
    private string _exampleSearch = string.Empty;
    private ScamExample? _selectedExample;
    private ScamStatistics? _statistics;
    private readonly Avalonia.Threading.DispatcherTimer _analyticsTimer = new() { Interval = TimeSpan.FromSeconds(15) };

    public MainWindow()
    {
        InitializeComponent();
        _ready = true;
        DataPathText.Text = _api.BaseAddress;
        ResetWorkspace();
        ApplySession(new AuthSession());
        Opened += async (_, _) => await RunAsync(RefreshSessionAsync);
        Activated += async (_, _) =>
        {
            if (_ready && !_busy && _user is not null) await RunAsync(RefreshSessionAsync);
        };
        _analyticsTimer.Tick += async (_, _) =>
        {
            if (_ready && !_busy && _user is not null && DashboardPage.IsVisible && IsActive)
                await RunAsync(RefreshAnalyticsAsync);
        };
        _analyticsTimer.Start();
        Closed += (_, _) => { _ready = false; _analyticsTimer.Stop(); _api.Dispose(); };
    }

    // Serialize UI operations so an old response cannot be applied to a different account.
    private async Task RunAsync(Func<Task> action)
    {
        if (!_ready || _busy) return;
        _busy = true;
        AppLayout.IsEnabled = false;
        MessageBanner.IsVisible = false;
        try { await action(); }
        catch (CitrineApiException error)
        {
            if (error.StatusCode == HttpStatusCode.Unauthorized) SignOutLocally();
            ShowMessage(error.Message);
        }
        catch (HttpRequestException) { ShowMessage("Cannot reach the Citrine server. Check the connection and try Refresh."); }
        catch (TaskCanceledException) { ShowMessage("The server did not respond in time. Try Refresh."); }
        catch (Exception) { ShowMessage("The request could not be completed. Try Refresh."); }
        finally
        {
            _busy = false;
            AppLayout.IsEnabled = true;
            UpdateSaveButton();
            UpdateModerationButtons();
            UpdateUserButton();
        }
    }

    private void ShowMessage(string message)
    {
        MessageText.Text = message;
        MessageBanner.IsVisible = true;
    }

    private void ApplySession(AuthSession session)
    {
        if (_user?.Id != session.User?.Id || _user?.Role != session.User?.Role) ResetWorkspace();
        _user = session.User;
        WorkspaceNavigation.IsEnabled = _user is not null;
        SearchBox.IsEnabled = _user is not null;
        SubmitToolbarButton.IsEnabled = _user is not null;
        ModerationNav.IsVisible = _user?.IsStaff == true;
        UsersNav.IsVisible = _user?.IsAdmin == true;
        SignedInPanel.IsVisible = _user is not null;
        SignedOutPanel.IsVisible = _user is null;
        SessionUserText.Text = _user is null ? "Sign in" : $"{_user.Username} · {_user.Role}";
        AccountUsernameText.Text = _user?.Username ?? string.Empty;
        AccountDetailsText.Text = _user is null ? string.Empty : $"{_user.Role} · {_user.Status} · {_user.CreatedAt:g}";
        if (_user is null || (ModerationPage.IsVisible && !_user.IsStaff) || (UsersPage.IsVisible && !_user.IsAdmin))
            ShowPage(AccountPage, AccountNav, "Account");
    }

    private void SignOutLocally()
    {
        _api.ClearSession();
        ApplySession(new AuthSession());
        PasswordBox.Text = CurrentPasswordBox.Text = NewPasswordBox.Text = string.Empty;
    }

    private async Task RefreshSessionAsync()
    {
        ApplySession(await _api.SessionAsync());
        if (_user is not null) await RefreshCurrentAsync();
    }

    private async Task RefreshCurrentAsync()
    {
        if (_user is null) return;
        var summary = await _api.WorkspaceAsync();
        var reports = await _api.ReportsAsync(string.Empty);
        var fingerprints = await _api.FingerprintsAsync();
        var points = await _api.PointsAsync();
        var seniors = await _api.SeniorReportsAsync();
        _binding = true;
        try
        {
            _reports = reports;
            FilterReports();
            FingerprintsList.ItemsSource = fingerprints;
            PointsLedgerList.ItemsSource = points;
            SeniorReportsList.ItemsSource = seniors;
            TotalReportsText.Text = summary.TotalReports.ToString();
            PendingReportsText.Text = summary.PendingReviewCount.ToString();
            FingerprintCountText.Text = summary.FingerprintCount.ToString();
            TotalPointsText.Text = PointsTotalLargeText.Text = summary.TotalPoints.ToString();
            if (_selectedReport is not null) SelectReport(reports.FirstOrDefault(row => row.Id == _selectedReport.Id));
        }
        finally { _binding = false; }
        if (_seniorId is not null && seniors.Any(row => row.Id == _seniorId))
            SeniorNoteText.Text = (await _api.ProtectionNoteAsync(_seniorId.Value)).Note;
        else
        {
            _seniorId = null;
            SeniorNoteText.Text = "Select a report with a senior-risk signal to prepare a plain-language note.";
        }
        if (ModerationPage.IsVisible && _user.IsStaff) await RefreshModerationAsync();
        if (UsersPage.IsVisible && _user.IsAdmin) await RefreshUsersAsync();
        if (ExamplesPage.IsVisible) await RefreshExamplesAsync();
        if (DashboardPage.IsVisible) await RefreshAnalyticsAsync();
    }

    private async Task RefreshAnalyticsAsync()
    {
        _statistics = await _api.AnalyticsAsync();
        ApplyAnalytics();
    }

    private void OnAnalyticsSourceChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (_ready && !_binding) ApplyAnalytics();
    }

    private void ApplyAnalytics()
    {
        if (_statistics is null) return;
        var scope = AnalyticsSourceComboBox.SelectedIndex;
        var total = scope == 1 ? _statistics.DemoCount : scope == 2 ? _statistics.UserCount : _statistics.Total;
        ScamDistribution Project(ScamDistribution row)
        {
            var demo = scope == 2 ? 0 : row.DemoCount;
            var user = scope == 1 ? 0 : row.UserCount;
            return new ScamDistribution { Label = row.Label, DemoCount = demo, UserCount = user,
                Total = demo + user, Share = total == 0 ? 0 : (demo + user) * 100.0 / total };
        }
        AnalyticsCountText.Text = $"{_statistics.DemoCount:N0} demo examples / {_statistics.UserCount:N0} user {(_statistics.UserCount == 1 ? "report" : "reports")}";
        AnalyticsEmptyText.IsVisible = total == 0;
        ScamTypesChart.ItemsSource = total == 0 ? null : _statistics.Types.Select(Project).OrderByDescending(row => row.Total).ThenBy(row => row.Label).ToList();
        ScamRiskChart.ItemsSource = total == 0 ? null : _statistics.Risks.Select(Project).ToList();
    }

    private async void Navigate(Control page, Button button, string title) => await RunAsync(async () =>
    {
        ApplySession(await _api.SessionAsync());
        if (_user is null) return;
        if (page == ModerationPage && !_user.IsStaff || page == UsersPage && !_user.IsAdmin) return;
        ShowPage(page, button, title);
        await RefreshCurrentAsync();
    });
    private void ShowDashboard(object? s = null, RoutedEventArgs? e = null) => Navigate(DashboardPage, DashboardNav, "Dashboard");
    private void ShowSubmit(object? s, RoutedEventArgs e) => Navigate(SubmitPage, SubmitNav, "Submit");
    private void ShowReports(object? s, RoutedEventArgs e) => Navigate(ReportsPage, ReportsNav, "Reports");
    private void ShowFingerprints(object? s, RoutedEventArgs e) => Navigate(FingerprintsPage, FingerprintsNav, "Fingerprints");
    private void ShowPoints(object? s, RoutedEventArgs e) => Navigate(PointsPage, PointsNav, "Points");
    private void ShowSeniorProtection(object? s, RoutedEventArgs e) => Navigate(SeniorPage, SeniorNav, "Senior Protection");
    private void ShowExamples(object? s, RoutedEventArgs e) => Navigate(ExamplesPage, ExamplesNav, "Scam examples");
    private void ShowPrivacy(object? s, RoutedEventArgs e) => Navigate(PrivacyPage, PrivacyNav, "Privacy");
    private void ShowModeration(object? s, RoutedEventArgs e) => Navigate(ModerationPage, ModerationNav, "Moderation");
    private void ShowUsers(object? s, RoutedEventArgs e) => Navigate(UsersPage, UsersNav, "Users");
    private void ShowAccount(object? s, RoutedEventArgs e) => ShowPage(AccountPage, AccountNav, "Account");
    private async void OnRefresh(object? s, RoutedEventArgs e) => await RunAsync(RefreshSessionAsync);

    private void ShowPage(Control page, Button navButton, string title)
    {
        Control[] pages = [DashboardPage, SubmitPage, ReportsPage, FingerprintsPage, PointsPage, SeniorPage, ExamplesPage, PrivacyPage, AccountPage, ModerationPage, UsersPage];
        Button[] buttons = [DashboardNav, SubmitNav, ReportsNav, FingerprintsNav, PointsNav, SeniorNav, ExamplesNav, PrivacyNav, AccountNav, ModerationNav, UsersNav];
        foreach (var candidate in pages) candidate.IsVisible = candidate == page;
        foreach (var button in buttons) button.Classes.Set("active", button == navButton);
        PageTitle.Text = title;
    }

    private async Task AuthenticateAsync(bool register)
    {
        try
        {
            var username = UsernameBox.Text ?? string.Empty;
            var password = PasswordBox.Text ?? string.Empty;
            ApplySession(register ? await _api.RegisterAsync(username, password) : await _api.LoginAsync(username, password));
            ShowPage(DashboardPage, DashboardNav, "Dashboard");
            await RefreshCurrentAsync();
        }
        finally { PasswordBox.Text = string.Empty; }
    }
    private async void OnLogin(object? s, RoutedEventArgs e) => await RunAsync(() => AuthenticateAsync(false));
    private async void OnRegister(object? s, RoutedEventArgs e) => await RunAsync(() => AuthenticateAsync(true));
    private async void OnLogout(object? s, RoutedEventArgs e) => await RunAsync(async () =>
    {
        try { await _api.LogoutAsync(); }
        finally { SignOutLocally(); }
    });
    private async void OnChangePassword(object? s, RoutedEventArgs e) => await RunAsync(async () =>
    {
        try
        {
            ApplySession(await _api.ChangePasswordAsync(CurrentPasswordBox.Text ?? "", NewPasswordBox.Text ?? ""));
            ShowMessage("Password changed.");
        }
        finally { CurrentPasswordBox.Text = NewPasswordBox.Text = string.Empty; }
    });

    private async void OnAnalyzeSubmission(object? s, RoutedEventArgs e) => await RunAsync(async () =>
    {
        InvalidateAnalysis();
        _analysis = await _api.AnalyzeAsync(SuspiciousContentBox.Text?.Trim() ?? "", GetComboBoxText(CategoryComboBox));
        RiskLevelText.Text = $"{_analysis.RiskLevel} · {_analysis.Category}";
        RiskScoreText.Text = $"{_analysis.RiskScore}/100";
        RiskScoreBar.Value = _analysis.RiskScore;
        RedactedPreviewText.Text = _analysis.ContentPreview;
        SignalsItems.ItemsSource = _analysis.Signals;
        DuplicateNoticeText.Text = _analysis.DuplicateNotice;
        SeniorNoticeText.Text = _analysis.SeniorNotice;
    });
    private async void OnSaveReport(object? s, RoutedEventArgs e) => await RunAsync(async () =>
    {
        if (_analysis is null || _analysis.IsReferenceExample || PrivacyReviewCheckBox.IsChecked != true) return;
        var report = await _api.SaveReportAsync(SuspiciousContentBox.Text?.Trim() ?? "", GetComboBoxText(CategoryComboBox),
            GetComboBoxText(ConfidenceComboBox), ContainsPersonalInfoCheckBox.IsChecked == true, true);
        ClearSubmission();
        SelectReport(report);
        ShowPage(ReportsPage, ReportsNav, "Reports");
        await RefreshCurrentAsync();
        ShowMessage("Saved with redaction applied.");
    });
    private void OnSubmissionChanged(object? s, TextChangedEventArgs e) { if (_ready) InvalidateAnalysis(); }
    private void OnCategoryChanged(object? s, SelectionChangedEventArgs e) { if (_ready) InvalidateAnalysis(); }
    private void OnClearSubmission(object? s, RoutedEventArgs e) => ClearSubmission();
    private void OnPrivacyReviewChanged(object? s, RoutedEventArgs e) { if (_ready) UpdateSaveButton(); }
    private void UpdateSaveButton() => SaveReportButton.IsEnabled = !_busy && _user is not null && _analysis is not null && !_analysis.IsReferenceExample && PrivacyReviewCheckBox.IsChecked == true;
    private void InvalidateAnalysis()
    {
        _analysis = null;
        PrivacyReviewCheckBox.IsChecked = false;
        SaveReportButton.IsEnabled = false;
        SignalsItems.ItemsSource = Array.Empty<ScamSignal>();
        RiskLevelText.Text = "No analysis yet";
        RiskScoreText.Text = "0/100";
        RiskScoreBar.Value = 0;
        RedactedPreviewText.Text = "Analysis will show the saved preview here.";
        DuplicateNoticeText.Text = SeniorNoticeText.Text = string.Empty;
    }
    private void ClearSubmission()
    {
        SuspiciousContentBox.Text = string.Empty;
        CategoryComboBox.SelectedIndex = ConfidenceComboBox.SelectedIndex = 0;
        ContainsPersonalInfoCheckBox.IsChecked = false;
        InvalidateAnalysis();
    }

    private void FilterReports()
    {
        var query = SearchBox.Text?.Trim() ?? "";
        var rows = _reports.Where(report => Matches(report, query)).ToList();
        var binding = _binding;
        _binding = true;
        ReportsList.ItemsSource = rows;
        DashboardReportsList.ItemsSource = rows.Take(8).ToList();
        DashboardEmptyText.IsVisible = _reports.Count == 0;
        ReportsList.SelectedItem = rows.FirstOrDefault(row => row.Id == _selectedReport?.Id);
        _binding = binding;
    }
    private static bool Matches(ScamReport row, string query) => new[] { row.Category, row.ContentPreview, row.Status.ToString(), row.RiskLevel.ToString(), row.SubmittedBy }
        .Any(value => value.Contains(query, StringComparison.OrdinalIgnoreCase));
    private void OnSearchChanged(object? s, TextChangedEventArgs e) { if (_ready && !_binding) FilterReports(); }
    private async Task LoadReportAsync(ScamReport report, bool openPage)
    {
        var loaded = await _api.ReportAsync(report.Id);
        if (loaded.OwnerId != _user?.Id) return;
        SelectReport(loaded);
        if (openPage) ShowPage(ReportsPage, ReportsNav, "Reports");
    }
    private async void OnReportSelected(object? s, SelectionChangedEventArgs e)
    {
        if (!_binding && ReportsList.SelectedItem is ScamReport report) await RunAsync(() => LoadReportAsync(report, false));
    }
    private async void OnDashboardReportSelected(object? s, SelectionChangedEventArgs e)
    {
        if (!_binding && DashboardReportsList.SelectedItem is ScamReport report) await RunAsync(() => LoadReportAsync(report, true));
    }
    private async void OnSeniorReportSelected(object? s, SelectionChangedEventArgs e)
    {
        if (!_binding && SeniorReportsList.SelectedItem is ScamReport report) await RunAsync(async () =>
        {
            _seniorId = report.Id;
            SeniorNoteText.Text = (await _api.ProtectionNoteAsync(report.Id)).Note;
        });
    }
    private void SelectReport(ScamReport? report)
    {
        _selectedReport = report;
        SelectedReportTitle.Text = report is null ? "No report selected" : $"{report.Category} · {report.RiskLevel}";
        SelectedReportMeta.Text = report is null ? "Select a report to inspect its evidence and moderation state." : $"{report.Status} · {report.SubmittedAt:g} · {report.ShortId}";
        SelectedReportSource.IsVisible = report?.IsDemo == true;
        SelectedReportSource.Text = report?.IsDemo == true
            ? $"Demo report from SMS Spam Collection ({report.SourceExampleId}). Reference copy, not a community submission. No points awarded."
            : string.Empty;
        SelectedReportPreview.Text = report?.ContentPreview ?? "No report loaded.";
        SelectedFingerprintText.Text = report?.FingerprintKey ?? "-";
        SelectedPointsText.Text = report?.PointsAwarded.ToString() ?? "-";
        SelectedReportSignals.ItemsSource = report?.Signals ?? Array.Empty<ScamSignal>();
        WithdrawReportButton.IsEnabled = report is not null && report.OwnerId == _user?.Id && report.Status != ReportStatus.Draft;
    }
    private async void OnWithdrawReport(object? s, RoutedEventArgs e) => await RunAsync(async () =>
    {
        if (_selectedReport is null) return;
        try { SelectReport(await _api.UpdateReportAsync(_selectedReport, ReportStatus.Draft, "")); }
        finally { await RefreshCurrentAsync(); }
    });
    private void OnDeleteConfirmationChanged(object? s, RoutedEventArgs e)
    {
        if (_ready) DeleteWorkspaceButton.IsEnabled = _user is not null && DeleteWorkspaceCheckBox.IsChecked == true;
    }
    private async void OnClearWorkspace(object? s, RoutedEventArgs e) => await RunAsync(async () =>
    {
        if (DeleteWorkspaceCheckBox.IsChecked != true) return;
        await _api.DeleteWorkspaceAsync();
        ResetWorkspace();
        await RefreshCurrentAsync();
    });

    private async Task RefreshModerationAsync()
    {
        _moderationReports = await _api.ModerationReportsAsync(GetComboBoxText(ModerationStatusComboBox), "");
        FilterModeration();
        if (_moderationReport is not null)
        {
            try { SetModerationReport(await _api.ReportAsync(_moderationReport.Id), false); }
            catch (CitrineApiException error) when (error.StatusCode == HttpStatusCode.NotFound) { SetModerationReport(null); }
        }
        await RefreshHistoryAsync();
    }
    private void FilterModeration()
    {
        var rows = _moderationReports.Where(row => Matches(row, ModerationSearchBox.Text?.Trim() ?? "")).ToList();
        _binding = true;
        ModerationReportsList.ItemsSource = rows;
        ModerationReportsList.SelectedItem = rows.FirstOrDefault(row => row.Id == _moderationReport?.Id);
        _binding = false;
        ModerationEmptyText.IsVisible = rows.Count == 0;
    }
    private async void OnModerationFilterChanged(object? s, SelectionChangedEventArgs e)
    {
        if (_ready && !_binding && _user?.IsStaff == true) await RunAsync(RefreshModerationAsync);
    }
    private void OnModerationSearchChanged(object? s, TextChangedEventArgs e) { if (_ready && !_binding) FilterModeration(); }
    private async void OnModerationReportSelected(object? s, SelectionChangedEventArgs e)
    {
        if (!_binding && ModerationReportsList.SelectedItem is ScamReport report) await RunAsync(async () =>
        {
            SetModerationReport(await _api.ReportAsync(report.Id));
            _allHistory = false;
            await RefreshHistoryAsync();
        });
    }
    private void SetModerationReport(ScamReport? report, bool resetReason = true)
    {
        _moderationReport = report;
        ModerationReportTitle.Text = report is null ? "No report selected" : $"{report.Category} · {report.RiskLevel}";
        ModerationReportMeta.Text = report is null ? "" : $"{report.SubmittedBy} · {report.Status} · {report.SubmittedAt:g} · {report.ShortId}";
        ModerationReportPreview.Text = report?.ContentPreview ?? "";
        ModerationReportFingerprint.Text = report?.FingerprintKey ?? "";
        ModerationSignals.ItemsSource = report?.Signals ?? Array.Empty<ScamSignal>();
        ModerationPermissionText.Text = report is not null && report.OwnerId == _user?.Id ? "Another moderator must review your report." : "";
        if (resetReason) ModerationReasonBox.Text = string.Empty;
        UpdateModerationButtons();
    }
    private void UpdateModerationButtons()
    {
        var allowed = !_busy && _user?.IsStaff == true && _moderationReport is not null
            && _moderationReport.OwnerId != _user.Id && !string.IsNullOrWhiteSpace(ModerationReasonBox.Text);
        VerifyReportButton.IsEnabled = allowed && _moderationReport!.Status is not (ReportStatus.Verified or ReportStatus.Duplicate);
        RejectReportButton.IsEnabled = allowed && _moderationReport!.Status != ReportStatus.Rejected;
        ReopenReportButton.IsEnabled = allowed && _moderationReport!.Status is not (ReportStatus.PendingReview or ReportStatus.Duplicate);
        ModerationReasonBox.IsEnabled = _moderationReport is not null && _moderationReport.OwnerId != _user?.Id;
    }
    private void OnModerationReasonChanged(object? s, TextChangedEventArgs e) { if (_ready) UpdateModerationButtons(); }
    private async Task ReviewAsync(ReportStatus status)
    {
        if (_moderationReport is null) return;
        try { SetModerationReport(await _api.UpdateReportAsync(_moderationReport, status, ModerationReasonBox.Text ?? "")); }
        finally { await RefreshCurrentAsync(); }
    }
    private async void OnMarkVerified(object? s, RoutedEventArgs e) => await RunAsync(() => ReviewAsync(ReportStatus.Verified));
    private async void OnMarkRejected(object? s, RoutedEventArgs e) => await RunAsync(() => ReviewAsync(ReportStatus.Rejected));
    private async void OnReopenReport(object? s, RoutedEventArgs e) => await RunAsync(() => ReviewAsync(ReportStatus.PendingReview));
    private async Task RefreshHistoryAsync()
    {
        var history = await _api.ModerationActionsAsync(_allHistory ? null : _moderationReport?.Id);
        ModerationHistoryList.ItemsSource = history;
        HistoryEmptyText.IsVisible = history.Count == 0;
    }
    private async void OnAllHistory(object? s, RoutedEventArgs e) => await RunAsync(async () => { _allHistory = true; await RefreshHistoryAsync(); });

    private async Task RefreshUsersAsync()
    {
        var users = await _api.UsersAsync();
        _binding = true;
        UsersList.ItemsSource = users;
        UsersList.SelectedItem = users.FirstOrDefault(row => row.Id == _selectedUser?.Id);
        _binding = false;
        if (_selectedUser is not null && UsersList.SelectedItem is null) SelectUser(null);
    }
    private void OnUserSelected(object? s, SelectionChangedEventArgs e)
    {
        if (!_binding) SelectUser(UsersList.SelectedItem as AccountUser);
    }
    private void SelectUser(AccountUser? user)
    {
        _selectedUser = user;
        SelectedUserText.Text = user?.Username ?? "No user selected";
        SelectedUserMeta.Text = user?.CreatedAt.ToString("g") ?? "";
        UserRoleComboBox.SelectedIndex = user is null ? -1 : Array.IndexOf(new[] { "member", "moderator", "admin" }, user.Role);
        UserStatusComboBox.SelectedIndex = user is null ? -1 : user.Status == "active" ? 0 : 1;
        UserReasonBox.Text = "";
        UpdateUserButton();
    }
    private void OnUserAccessChanged(object? s, SelectionChangedEventArgs e) { if (_ready) UpdateUserButton(); }
    private void OnUserReasonChanged(object? s, TextChangedEventArgs e) { if (_ready) UpdateUserButton(); }
    private void UpdateUserButton() => SaveUserButton.IsEnabled = !_busy && _user?.IsAdmin == true && _selectedUser is not null
        && !string.IsNullOrWhiteSpace(UserReasonBox.Text)
        && (GetComboBoxText(UserRoleComboBox) != _selectedUser.Role || GetComboBoxText(UserStatusComboBox) != _selectedUser.Status);
    private async void OnSaveUser(object? s, RoutedEventArgs e) => await RunAsync(async () =>
    {
        if (_selectedUser is null) return;
        var self = _selectedUser.Id == _user?.Id;
        try
        {
            SelectUser(await _api.UpdateUserAsync(_selectedUser, GetComboBoxText(UserRoleComboBox), GetComboBoxText(UserStatusComboBox), UserReasonBox.Text ?? ""));
            if (self) await RefreshSessionAsync();
            else await RefreshUsersAsync();
            ShowMessage(self ? "Account access changed. Sign in again." : "Account access updated.");
        }
        catch (CitrineApiException error) when (error.StatusCode == HttpStatusCode.Conflict)
        {
            SelectUser(null);
            await RefreshUsersAsync();
            throw;
        }
    });

    private void ResetWorkspace()
    {
        _binding = true;
        _reports = [];
        _statistics = null;
        ScamTypesChart.ItemsSource = ScamRiskChart.ItemsSource = null;
        AnalyticsCountText.Text = string.Empty;
        AnalyticsEmptyText.IsVisible = true;
        AnalyticsSourceComboBox.SelectedIndex = 0;
        _moderationReports = [];
        _seniorId = null;
        _allHistory = true;
        _examplesPage = 1;
        _exampleSearch = string.Empty;
        ExamplesSearchBox.Text = string.Empty;
        ExamplesLabelComboBox.SelectedIndex = 0;
        ExamplesList.ItemsSource = null;
        SelectExample(null);
        ExamplesCountText.Text = ExamplesPaginationText.Text = ExamplesAttributionText.Text = ExamplesLicenseText.Text = string.Empty;
        ExamplesSourcePanel.IsVisible = false;
        ExamplesPreviousButton.IsEnabled = ExamplesNextButton.IsEnabled = false;
        SearchBox.Text = ModerationSearchBox.Text = string.Empty;
        foreach (var list in new[] { ReportsList, DashboardReportsList, SeniorReportsList, FingerprintsList, PointsLedgerList, ModerationReportsList, UsersList }) list.ItemsSource = null;
        ModerationHistoryList.ItemsSource = null;
        SelectReport(null);
        SetModerationReport(null);
        SelectUser(null);
        ClearSubmission();
        TotalReportsText.Text = PendingReportsText.Text = FingerprintCountText.Text = TotalPointsText.Text = PointsTotalLargeText.Text = "0";
        DashboardEmptyText.IsVisible = true;
        SeniorNoteText.Text = "Select a report with a senior-risk signal to prepare a plain-language note.";
        DeleteWorkspaceCheckBox.IsChecked = false;
        DeleteWorkspaceButton.IsEnabled = false;
        CurrentPasswordBox.Text = NewPasswordBox.Text = string.Empty;
        _binding = false;
    }

    private async Task RefreshExamplesAsync()
    {
        var label = ExamplesLabelComboBox.SelectedIndex switch { 1 => "ham", 2 => "all", _ => "spam" };
        var result = await _api.ExamplesAsync(label, _exampleSearch, _examplesPage);
        _examplesPage = result.Page;
        _binding = true;
        ExamplesList.ItemsSource = result.Items;
        ExamplesList.SelectedItem = result.Items.FirstOrDefault(row => row.Id == _selectedExample?.Id);
        _binding = false;
        if (_selectedExample is not null && ExamplesList.SelectedItem is null) SelectExample(null);
        ExamplesEmptyText.IsVisible = result.Total == 0;
        ExamplesEmptyText.Text = result.Dataset is null ? "No examples imported." : "No examples match this search.";
        var pages = Math.Max(1, (int)Math.Ceiling((double)result.Total / result.PageSize));
        ExamplesPaginationText.Text = $"Page {result.Page} of {pages} / {result.Total:N0} messages";
        ExamplesPreviousButton.IsEnabled = result.Page > 1;
        ExamplesNextButton.IsEnabled = result.Page < pages;
        ExamplesSourcePanel.IsVisible = result.Dataset is not null;
        ExamplesCountText.Text = result.Dataset is null ? "" : $"{result.Dataset.Total:N0} messages: {result.Dataset.SpamCount:N0} spam, {result.Dataset.HamCount:N0} ham (not spam).";
        ExamplesAttributionText.Text = result.Dataset?.Attribution ?? "";
        ExamplesLicenseText.Text = result.Dataset?.LicenseNote ?? "";
    }
    private async void OnExamplesLabelChanged(object? s, SelectionChangedEventArgs e)
    {
        if (!_ready || _binding || _user is null) return;
        await RunAsync(async () => { _examplesPage = 1; SelectExample(null); await RefreshExamplesAsync(); });
    }
    private async void OnExamplesSearch(object? s, RoutedEventArgs e) => await RunAsync(async () =>
    {
        _exampleSearch = ExamplesSearchBox.Text ?? "";
        _examplesPage = 1;
        SelectExample(null);
        await RefreshExamplesAsync();
    });
    private void OnExamplesSearchKeyDown(object? s, KeyEventArgs e)
    {
        if (e.Key == Key.Enter) { e.Handled = true; OnExamplesSearch(s, e); }
    }
    private async void OnExamplesPrevious(object? s, RoutedEventArgs e) => await RunAsync(async () =>
    {
        _examplesPage = Math.Max(1, _examplesPage - 1);
        SelectExample(null);
        await RefreshExamplesAsync();
    });
    private async void OnExamplesNext(object? s, RoutedEventArgs e) => await RunAsync(async () =>
    {
        _examplesPage++;
        SelectExample(null);
        await RefreshExamplesAsync();
    });
    private async void OnExampleSelected(object? s, SelectionChangedEventArgs e)
    {
        if (!_binding && ExamplesList.SelectedItem is ScamExample example)
            await RunAsync(async () => SelectExample(await _api.ExampleAsync(example.Id)));
    }
    private void SelectExample(ScamExample? example)
    {
        _selectedExample = example;
        ExampleTitleText.Text = example is null ? "No example selected" : $"Example {example.SourceRow}";
        ExampleLabelText.Text = example is null ? "" : "Dataset label: " + example.DisplayLabel;
        ExampleContentText.Text = example?.Content ?? "";
        ExampleAnalysisPanel.IsVisible = example?.Analysis is not null;
        ExampleRiskText.Text = example?.Analysis is null ? "" : $"{example.Analysis.RiskLevel} / {example.Analysis.RiskScore}/100";
        ExampleSignals.ItemsSource = example?.Analysis?.Signals ?? Array.Empty<ScamSignal>();
    }
    private void OnExampleSource(object? s, RoutedEventArgs e)
    {
        var url = ((s as Button)?.Tag as string) switch
        {
            "kaggle" => "https://www.kaggle.com/datasets/uciml/sms-spam-collection-dataset",
            "uci" => "https://archive.ics.uci.edu/dataset/228/sms+spam+collection",
            "license" => "https://creativecommons.org/licenses/by/4.0/",
            _ => null
        };
        if (url is null) return;
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch (Exception) { ShowMessage("The source could not be opened in your browser."); }
    }

    private static string GetComboBoxText(ComboBox comboBox) => comboBox.SelectedItem is ComboBoxItem item
        ? item.Content?.ToString() ?? "" : comboBox.SelectedItem?.ToString() ?? "";
}
