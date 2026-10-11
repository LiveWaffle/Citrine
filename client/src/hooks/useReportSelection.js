import { useCallback, useEffect, useRef, useState } from 'react';
import { api, isAbortError } from '../api.js';
import { useResource } from './useResource.js';

export function useReportSelection(refresh, refreshKey, userId) {
  const [selectedId, setSelectedId] = useState(null);
  const [seniorReportId, setSeniorReportId] = useState(null);
  const [seniorNote, setSeniorNote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const loadReport = useCallback(async signal => {
    if (!selectedId) return null;
    const report = await api.report(selectedId, signal);
    if (report.ownerId !== userId) throw new Error('This report does not belong to your account.');
    return report;
  }, [selectedId, userId, refreshKey]);
  const resource = useResource(loadReport);
  const selectedReport = resource.data?.id === selectedId ? resource.data : null;

  useEffect(() => {
    const controller = new AbortController();
    setSeniorNote(null);
    if (seniorReportId) {
      api.protectionNote(seniorReportId, controller.signal).then(result => {
        if (!controller.signal.aborted) setSeniorNote(result.note);
      }).catch(error => {
        if (!controller.signal.aborted && !isAbortError(error)) setError(error);
      });
    }
    return () => controller.abort();
  }, [seniorReportId, refreshKey]);

  function selectSenior(report) {
    setError(null);
    setSeniorNote(null);
    setSeniorReportId(report.id);
  }

  function selectReport(report) {
    setError(null);
    setSelectedId(report.id);
    if (report.seniorProtectionEnabled) selectSenior(report);
  }

  async function withdraw() {
    if (!selectedReport || selectedReport.ownerId !== userId || selectedReport.status === 'Draft' || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.updateStatus(selectedReport.id, { status: 'Draft', expectedStatus: selectedReport.status });
      if (mounted.current) {
        resource.refresh();
        refresh();
      }
    } catch (error) {
      if (mounted.current && !isAbortError(error)) {
        setError(error);
        if (error.status === 409 || error.status === 404) {
          resource.refresh();
          refresh();
        }
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function clear() {
    setSelectedId(null);
    setSeniorReportId(null);
    setSeniorNote(null);
    setError(null);
  }
  return { selectedReport, seniorReportId, seniorNote, busy: busy || resource.loading,
    error: error || resource.error, selectReport, selectSenior, withdraw, clear };
}
