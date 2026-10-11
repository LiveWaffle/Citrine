// Labels, option order and defaults are copied from MainWindow.axaml.
export const pages = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'submit', label: 'Submit' },
  { id: 'reports', label: 'Reports' },
  { id: 'fingerprints', label: 'Fingerprints' },
  { id: 'points', label: 'Points' },
  { id: 'senior', label: 'Senior Protection' },
  { id: 'examples', label: 'Scam examples' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'moderation', label: 'Moderation', staffOnly: true },
  { id: 'users', label: 'Users', adminOnly: true },
  { id: 'account', label: 'Account' },
];
export const isStaff = user => user?.role === 'moderator' || user?.role === 'admin';
export const categories = ['Unknown', 'SMS', 'Phone call', 'Email', 'Website', 'Social media', 'Payment request', 'Impersonation'];
export const confidenceLevels = ['I personally received this', 'Reported by someone else', 'Unsure'];
export const seniorEmptyText = 'Select a report with a senior-risk signal to prepare a plain-language note.';
export const separator = ' \u00b7 ';
export const formatDate = value => value ? new Date(value).toLocaleString() : '';
