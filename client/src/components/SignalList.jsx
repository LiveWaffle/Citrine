export function SignalList({ signals }) {
  return <div>
    {/* TODO: No empty signal label is defined in the XAML. */}
    {signals.map(signal => <div className="signal" key={signal.name}>
      <p className="strong">{signal.name}</p>
      <p className="caption">{signal.detail}</p>
    </div>)}
  </div>;
}
