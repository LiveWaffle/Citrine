import { createHash } from 'node:crypto';

// Expressions, vocabulary and weights follow ScamAnalysisService.cs.
const urlRegex = /https?:\/\/[^\s]+|www\.[^\s]+/gi;
const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phoneRegex = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;
const amountRegex = /(?:\$|USD\s*)\d{2,}(?:,\d{3})*(?:\.\d{2})?/gi;
const codeRegex = /\b(?:verification|security|one[-\s]?time|2fa|mfa)\s+(?:code|pin)\b|\b\d{6}\b/gi;
const containsAny = (content, ...terms) => terms.some(term => content.toLowerCase().includes(term));
const matches = (content, expression) => [...content.matchAll(expression)];
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
const normalize = content => content.trim().toLowerCase().replace(/\s+/g, ' ');
export const hashContent = content => hash(normalize(content));

function hostname(value) {
  try {
    return new URL(/^http/i.test(value) ? value : `https://${value}`).hostname;
  } catch {
    return '';
  }
}

function determineCategory(content, signals) {
  if (containsAny(content, 'bank', 'account locked', 'verify your account', 'password', 'login')) return 'Account impersonation';
  if (containsAny(content, 'gift card', 'crypto', 'bitcoin', 'wire transfer', 'zelle', 'cash app')) return 'Payment request';
  if (containsAny(content, 'package', 'delivery', 'tracking', 'shipping')) return 'Delivery impersonation';
  if (containsAny(content, 'remote access', 'anydesk', 'teamviewer', 'microsoft support', 'apple support')) return 'Tech support';
  if (signals.some(signal => signal.name === 'Senior risk pattern')) return 'Senior-targeting pattern';
  return signals.length === 0 ? 'Unclassified' : 'Suspicious content';
}

export function buildTraits(analysis) {
  return [...new Set(analysis.signals.map(signal => signal.name))].sort();
}

export function analyze(content, selectedCategory = 'Unknown') {
  const normalized = normalize(content);
  const signals = [];
  const addIf = (condition, name, detail, weight) => {
    if (condition) signals.push({ name, detail, weight });
  };

  addIf(matches(content, urlRegex).length, 'Link', 'Contains a link or website.', 10);
  addIf(matches(content, urlRegex).some(([url]) => containsAny(url, 'bit.ly', 'tinyurl', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'rebrand.ly')), 'Short link', 'Uses a shortened or obscured link.', 20);
  addIf(matches(content, emailRegex).length, 'Email', 'Contains an email address.', 8);
  addIf(matches(content, phoneRegex).length, 'Phone', 'Contains a phone number.', 8);
  addIf(matches(content, amountRegex).length, 'Money request', 'Mentions a payment or requested amount.', 16);
  addIf(matches(content, codeRegex).length, 'Verification code', 'Mentions a verification code or one-time PIN.', 25);
  addIf(containsAny(normalized, 'urgent', 'immediately', 'act now', 'final notice', 'limited time', 'today only'), 'Urgency', 'Uses time pressure.', 18);
  addIf(containsAny(normalized, 'gift card', 'steam card', 'apple card', 'google play', 'crypto', 'bitcoin', 'wire transfer', 'zelle', 'cash app'), 'Irreversible payment', 'Requests a risky payment method.', 28);
  addIf(containsAny(normalized, 'remote access', 'anydesk', 'teamviewer', 'screen share', 'install this app'), 'Remote access', 'Asks for remote access or screen sharing.', 30);
  addIf(containsAny(normalized, 'password', 'login', 'account locked', 'suspended', 'verify your account'), 'Credential pressure', 'Asks for account access or verification.', 22);
  addIf(containsAny(normalized, 'bank', 'irs', 'medicare', 'social security', 'amazon', 'paypal', 'microsoft', 'apple support'), 'Impersonation', 'References a trusted institution or brand.', 15);
  addIf(containsAny(normalized, 'grandchild', 'grandson', 'granddaughter', 'bail', 'hospital', 'medicare', 'social security', 'retirement'), 'Senior risk pattern', 'Matches common elder-targeting language.', 24);

  const riskScore = Math.min(100, signals.reduce((total, signal) => total + signal.weight, 0));
  const riskLevel = riskScore >= 80 ? 'Critical' : riskScore >= 55 ? 'High' : riskScore >= 25 ? 'Medium' : 'Low';
  const category = selectedCategory === 'Unknown' ? determineCategory(normalized, signals) : selectedCategory;
  const domains = [...new Set(matches(normalized, urlRegex).map(([url]) => hostname(url)).filter(Boolean))];
  const signalKey = buildTraits({ signals }).join('-');
  return {
    riskLevel,
    riskScore,
    category,
    contentHash: hash(normalized),
    fingerprintKey: hash(`${category}|${domains.join(',')}|${signalKey}`).slice(0, 16),
    signals,
    seniorProtectionRecommended: signals.some(signal =>
      ['Senior risk pattern', 'Irreversible payment', 'Remote access', 'Verification code'].includes(signal.name)),
  };
}

export function redact(content) {
  return content
    .replace(emailRegex, email => {
      const [local, domain] = email.split('@');
      return `${local[0] || '*'}***@${domain}`;
    })
    .replace(phoneRegex, phone => `***-***-${phone.replace(/\D/g, '').slice(-4)}`)
    .replace(urlRegex, url => hostname(url) ? `${hostname(url)}/...` : '[link removed]')
    .replace(codeRegex, '[code removed]')
    .trim();
}

function noteLines(analysis) {
  return [
    'Pause before paying, sharing codes, or installing remote-access software.',
    `Risk: ${analysis.riskLevel} (${analysis.riskScore}/100).`,
    ...(analysis.signals.length ? ['Signals found:', ...analysis.signals.slice(0, 5).map(signal => `- ${signal.name}: ${signal.detail}`)] : []),
    'Verify through a phone number or website you already trust, not through the message.',
  ];
}

export function buildSafetyNote(analysis) {
  return [...noteLines(analysis), 'If this involves money, codes, or account access, ask a trusted person to review it first.', ''].join('\n');
}

export function buildSeniorProtectionNote(report) {
  return [...noteLines(report), 'Ask a trusted person to review this before sending money, codes, or account access.', ''].join('\n');
}
