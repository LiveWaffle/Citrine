import { useCallback, useEffect, useState } from 'react';
import { api, isAbortError } from '../api.js';

const emptyWorkspace = () => ({ summary: null, reports: [], fingerprints: [], points: [], seniorReports: [] });

export function useWorkspace(refreshKey) {
  const [search, setSearch] = useState('');
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(emptyWorkspace);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setLoading(true);
    setError(null);
    Promise.all([
      api.workspace(signal), api.reports(search, signal), api.fingerprints(signal),
      api.points(signal), api.seniorReports(signal),
    ]).then(([summary, reports, fingerprints, points, seniorReports]) => {
      if (!signal.aborted) setData({ summary, reports, fingerprints, points, seniorReports });
    }).catch(error => {
      if (!signal.aborted && !isAbortError(error)) {
        setData(emptyWorkspace());
        setError(error);
      }
    }).finally(() => {
      if (!signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [search, revision, refreshKey]);

  return { ...data, search, setSearch, loading, error, refresh };
}
