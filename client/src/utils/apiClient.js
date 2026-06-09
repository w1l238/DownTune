import { API_BASE_URL } from '../config';

let csrfToken = null;

export function getCsrfToken() {
  return csrfToken;
}

export async function initCsrf() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/csrf-token`);
    if (res.ok) {
      const data = await res.json();
      csrfToken = data.token;
    }
  } catch { /* degrades gracefully if backend unreachable */ }
}

async function _apiFetch(path, { body, ...options } = {}, timeoutMs, retry) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);

  const method = (options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };

  if (method !== 'GET') {
    if (!csrfToken) await initCsrf();
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  }

  let serializedBody = body;
  if (body != null && typeof body === 'object' && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    serializedBody = JSON.stringify(body);
  }

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      method,
      headers,
      body: serializedBody,
      signal: controller.signal,
    });

    if (!res.ok && res.status === 403 && !retry) {
      await initCsrf();
      return _apiFetch(path, { body, ...options }, timeoutMs, true);
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timerId);
  }
}

export function apiFetch(path, options = {}, timeoutMs = 30000) {
  return _apiFetch(path, options, timeoutMs, false);
}
