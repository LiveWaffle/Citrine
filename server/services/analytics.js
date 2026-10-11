// One primary, rule-based type per message. These are sample counts, not scam verdicts.
const typeRules = [
  ['Tech support / remote access', /\b(remote access|anydesk|teamviewer|tech support|screen shar\w*)\b/i],
  ['Account impersonation', /\b(password|login|account locked|verify your account|suspended|security alert|bank|paypal|irs|medicare|social security)\b/i],
  ['Payment / financial offer', /\b(gift card|crypto\w*|bitcoin|wire transfer|zelle|cash app|loan\w*|debt\w*|invest\w*)\b/i],
  ['Delivery impersonation', /\b(package|delivery|shipping|tracking|parcel)\b/i],
  ['Prize / lottery offer', /\b(prize\w*|winner\w*|won|win|lottery|jackpot|reward\w*|claim|draw|awarded)\b/i],
  ['Dating / adult promotion', /\b(dating|sexy|adult|xxx\w*|flirt\w*|singles|chatline|dogging)\b/i],
  ['Subscription / sales promotion', /\b(free\w*|offer\w*|subscription|subscri\w*|ringtone\w*|tone\w*|mobile|discount|voucher\w*|sale|service\w*|membership|upgrade|update)\b/i],
];
const categoryTypes = {
  'Tech support': typeRules[0][0], 'Account impersonation': typeRules[1][0],
  'Impersonation': typeRules[1][0], 'Payment request': typeRules[2][0],
  'Delivery impersonation': typeRules[3][0], 'Senior-targeting pattern': 'Senior-targeting pattern',
};

export function classifyType({ category, content }) {
  return categoryTypes[category] ?? typeRules.find(([, pattern]) => pattern.test(content))?.[0] ?? 'Other / unclassified';
}

export function createAnalytics({ statements: sql }) {
  return {
    summary() {
      const rows = sql.analyticsReports.all();
      const types = new Map();
      const risks = new Map(['Critical', 'High', 'Medium', 'Low'].map(label => [label, { label, demoCount: 0, userCount: 0 }]));
      let demoCount = 0;
      for (const row of rows) {
        const type = classifyType(row);
        if (!types.has(type)) types.set(type, { label: type, demoCount: 0, userCount: 0 });
        const field = row.source === 'demo' ? 'demoCount' : 'userCount';
        types.get(type)[field]++;
        risks.get(row.risk_level)[field]++;
        if (row.source === 'demo') demoCount++;
      }
      const complete = row => ({ ...row, total: row.demoCount + row.userCount,
        share: rows.length ? (row.demoCount + row.userCount) / rows.length * 100 : 0 });
      return {
        total: rows.length, demoCount, userCount: rows.length - demoCount,
        types: [...types.values()].map(complete).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)),
        risks: [...risks.values()].map(complete),
      };
    },
  };
}
