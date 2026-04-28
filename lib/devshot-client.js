export const DEFAULT_DEVSHOT_API_URL = 'https://console.devshot.com';

export class DevshotApiError extends Error {
  constructor(message, { status = 500, url = '', details = null } = {}) {
    super(message);
    this.name = 'DevshotApiError';
    this.status = status;
    this.url = url;
    this.details = details;
  }
}

export function normalizeBaseUrl(baseUrl) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    return DEFAULT_DEVSHOT_API_URL;
  }

  const normalized = baseUrl.trim().replace(/\/+$/, '');
  return normalized.endsWith('/api') ? normalized.slice(0, -4) : normalized;
}

async function parseResponseBody(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function appendQuery(url, query) {
  if (!query) return;

  for (const [key, rawValue] of Object.entries(query)) {
    if (rawValue === undefined || rawValue === null || rawValue === '') continue;
    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        url.searchParams.append(key, String(value));
      }
      continue;
    }
    url.searchParams.set(key, String(rawValue));
  }
}

export function createDevshotClient({
  apiKey = process.env.DEVSHOT_API_KEY,
  baseUrl = process.env.DEVSHOT_API_URL || DEFAULT_DEVSHOT_API_URL,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey) {
    throw new Error('DEVSHOT_API_KEY is required');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch API is unavailable');
  }

  const resolvedBaseUrl = normalizeBaseUrl(baseUrl);

  async function request(path, {
    method = 'GET',
    query,
    body,
    headers = {},
    ...rest
  } = {}) {
    const url = new URL(`${resolvedBaseUrl}${path}`);
    appendQuery(url, query);

    const requestHeaders = new Headers(headers);
    requestHeaders.set('accept', 'application/json');
    requestHeaders.set('authorization', `Bearer ${apiKey}`);
    requestHeaders.set('x-devshot-client', 'mcp');

    let payload;
    if (body !== undefined) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
      if (!requestHeaders.has('content-type')) {
        requestHeaders.set('content-type', 'application/json');
      }
    }

    const response = await fetchImpl(url, {
      method,
      headers: requestHeaders,
      body: payload,
      ...rest,
    });
    const responseBody = await parseResponseBody(response);

    if (!response.ok) {
      const message =
        responseBody && typeof responseBody === 'object' && 'error' in responseBody
          ? responseBody.error
          : response.statusText || 'DevShot API request failed';
      throw new DevshotApiError(message, {
        status: response.status,
        url: url.toString(),
        details: responseBody,
      });
    }

    return responseBody;
  }

  return {
    apiKey,
    baseUrl: resolvedBaseUrl,
    request,
  };
}
