import { analyze } from './scamAnalysis.js';
import { requireValue } from './errors.js';

export const exampleDatasetId = 'kaggle-uciml-sms-v1';
export const exampleDataset = {
  id: exampleDatasetId,
  title: 'SMS Spam Collection Dataset',
  sourceUrl: 'https://www.kaggle.com/datasets/uciml/sms-spam-collection-dataset',
  upstreamUrl: 'https://archive.ics.uci.edu/dataset/228/sms+spam+collection',
  attribution: 'Almeida, T. and Hidalgo, J. (2011). SMS Spam Collection. UCI Machine Learning Repository. DOI: 10.24432/C5CC84.',
  licenseNote: 'Kaggle lists the license as Unknown. The upstream UCI dataset is CC BY 4.0.',
  version: '1',
  sourceSha256: '440e6ea9fa825578abfdd7b7932ef8393d72ef86c0c33f64676705ce40b1dfc2',
};

export function createExamples({ statements: sql }) {
  function dataset() {
    const row = sql.getExampleDataset.get(exampleDatasetId);
    return row ? {
      id: row.id, title: row.title, sourceUrl: row.source_url, upstreamUrl: row.upstream_url,
      attribution: row.attribution, licenseNote: row.license_note, version: row.version,
      sourceSha256: row.source_sha256, importedAt: row.imported_at,
      total: row.total, spamCount: row.spam_count, hamCount: row.ham_count,
    } : null;
  }
  return {
    list({ label = 'spam', search = '', page = '1' }) {
      requireValue(['spam', 'ham', 'all'].includes(label), 400, 'INVALID_LABEL', 'Choose spam, ham, or all examples.');
      requireValue(typeof search === 'string' && search.length <= 200, 400, 'INVALID_SEARCH', 'Use a search of up to 200 characters.');
      requireValue(typeof page === 'string' && /^[1-9]\d{0,6}$/.test(page), 400, 'INVALID_PAGE', 'Choose a valid page.');
      const pageSize = 25;
      const filter = { datasetId: exampleDatasetId, label, search: search.trim().toLowerCase() };
      const { total } = sql.countExamples.get(filter);
      const currentPage = Math.min(Number(page), Math.max(1, Math.ceil(total / pageSize)));
      return { items: sql.listExamples.all({ ...filter, limit: pageSize, offset: (currentPage - 1) * pageSize }),
        total, page: currentPage, pageSize, dataset: dataset() };
    },
    get(id) {
      const example = sql.getExample.get(id);
      requireValue(example, 404, 'NOT_FOUND', 'Example not found.');
      return { ...example, analysis: analyze(example.content, 'SMS') };
    },
  };
}
