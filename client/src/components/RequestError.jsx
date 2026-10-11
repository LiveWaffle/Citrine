export function RequestError({ error }) {
  return error ? <p role="alert" className="request-error">{error.message || 'The request could not be completed. Please try again.'}</p> : null;
}
