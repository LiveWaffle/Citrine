import { useEffect, useState } from 'react';
import { pages } from '../source.js';

const readPage = () => pages.find(page => `#${page.id}` === window.location.hash) || pages[0];

export function useNavigation() {
  const [page, setPage] = useState(readPage);
  useEffect(() => {
    const onHashChange = () => setPage(readPage());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  function navigate(id) {
    const next = pages.find(candidate => candidate.id === id);
    if (next) {
      window.location.hash = id;
      setPage(next);
    }
  }
  return { page, navigate };
}
