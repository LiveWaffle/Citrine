import { useEffect, useRef, useState } from 'react';
import { api, isAbortError } from '../api.js';
import { categories, confidenceLevels } from '../source.js';

export function useSubmission(onSaved) {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [confidenceLevel, setConfidenceLevel] = useState(confidenceLevels[0]);
  const [containsPersonalInfo, setContainsPersonalInfo] = useState(false);
  const [privacyReviewed, setPrivacyReviewed] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [message, setMessage] = useState('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const operation = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => () => { operation.current += 1; }, []);

  function clear(saved = false) {
    operation.current += 1;
    setContent('');
    setCategory(categories[0]);
    setConfidenceLevel(confidenceLevels[0]);
    setContainsPersonalInfo(false);
    setPrivacyReviewed(false);
    setAnalysis(null);
    setMessage(saved ? 'saved' : 'idle');
    setError(null);
  }

  function changeContent(value) {
    operation.current += 1;
    setContent(value);
    setAnalysis(null);
    setPrivacyReviewed(false);
    setMessage('idle');
    setError(null);
  }

  function changeCategory(value) {
    operation.current += 1;
    setCategory(value);
    setAnalysis(null);
    setPrivacyReviewed(false);
    setMessage('idle');
    setError(null);
  }

  async function analyze() {
    if (inFlight.current) return;
    const current = ++operation.current;
    setError(null);
    setAnalysis(null);
    if (!content.trim()) {
      setMessage('empty');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await api.analyze(content.trim(), category);
      if (current === operation.current) {
        setAnalysis(result);
        setMessage('analyzed');
      }
    } catch (error) {
      if (current === operation.current && !isAbortError(error)) {
        setError(error);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function save(event) {
    event.preventDefault();
    if (inFlight.current || !analysis || analysis.isReferenceExample || !privacyReviewed) return;
    inFlight.current = true;
    const current = ++operation.current;
    setBusy(true);
    setError(null);
    try {
      const report = await api.saveReport({ content, category, confidenceLevel, containsPersonalInfo, privacyReviewed });
      if (current !== operation.current) return;
      clear(true);
      onSaved(report);
    } catch (error) {
      if (current === operation.current && !isAbortError(error)) setError(error);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return {
    content, changeContent, category, changeCategory, confidenceLevel, setConfidenceLevel,
    containsPersonalInfo, setContainsPersonalInfo, privacyReviewed, setPrivacyReviewed,
    analysis, message, busy, error, analyze, save, clear,
    canSave: Boolean(analysis && !analysis.isReferenceExample && privacyReviewed && !busy),
  };
}
