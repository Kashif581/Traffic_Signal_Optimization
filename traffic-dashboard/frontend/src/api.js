// Small wrapper around fetch(): always sends the session cookie and turns errors into Error objects.
async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : {},
    ...options,
  })
  let data = null
  try { data = await res.json() } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return data
}

export const api = {
  status: () => request('/api/status'),
  signup: (body) => request('/api/signup', { method: 'POST', body: JSON.stringify(body) }),
  signin: (body) => request('/api/signin', { method: 'POST', body: JSON.stringify(body) }),
  signout: () => request('/api/signout', { method: 'POST', body: '{}' }),
  runs: () => request('/api/runs'),
}
