import { useState } from 'react';

export function ListBox({ label, items, getKey, selectedKey, onSelect, children, compact = false, busy = false }) {
  const [localSelection, setLocalSelection] = useState(null);
  const current = selectedKey === undefined ? localSelection : selectedKey;
  const selectedIndex = items.findIndex(item => getKey(item) === current);

  function select(item) {
    setLocalSelection(getKey(item));
    onSelect?.(item);
  }

  function onKeyDown(event) {
    const offsets = { ArrowDown: 1, ArrowUp: -1 };
    let index;
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = items.length - 1;
    else if (event.key in offsets) index = selectedIndex < 0 ? 0 : Math.min(items.length - 1, Math.max(0, selectedIndex + offsets[event.key]));
    else return;
    if (!items[index]) return;
    event.preventDefault();
    select(items[index]);
    event.currentTarget.children[index]?.focus();
  }

  return <div className={`list-box${compact ? ' compact' : ''}`} role="listbox"
    aria-label={label} aria-busy={busy} onKeyDown={onKeyDown} tabIndex={items.length ? -1 : 0}>
    {/* TODO: The Avalonia lists have no empty/loading/error labels. Keep those spaces blank. */}
    {items.map((item, index) => <div key={getKey(item)} role="option"
      aria-selected={current === getKey(item)}
      tabIndex={selectedIndex === index || (selectedIndex < 0 && index === 0) ? 0 : -1}
      className="list-option" onClick={() => select(item)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select(item);
        }
      }}>{children(item)}</div>)}
  </div>;
}
