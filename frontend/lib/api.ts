function formatApiUrl(raw?: string): string {
  if (!raw) return 'http://localhost:3031';
  const trimmed = raw.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed.replace(/\/+$/, '');
  }
  return `https://${trimmed.replace(/\/+$/, '')}`;
}

export const API_URL = formatApiUrl(process.env.NEXT_PUBLIC_API_URL);

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('robozap_token');
}

export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('robozap_token', token);
}

export function removeAuthToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('robozap_token');
  localStorage.removeItem('robozap_user');
}

async function fetchWithRetry(url: string, init?: RequestInit, maxRetries = 2): Promise<Response> {
  let lastError: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, init);
      if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
    }
  }
  throw lastError || new Error('Falha de conexão com o servidor. Aguarde alguns segundos.');
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string>),
  };

  const res = await fetchWithRetry(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && typeof window !== 'undefined') {
    const isAuthPage = window.location.pathname === '/login' || window.location.pathname === '/register';
    if (!isAuthPage) {
      removeAuthToken();
      window.location.href = '/login';
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

/** Multipart form upload helper with retry capability and cold-start tolerance */
export async function apiUpload<T>(
  path: string,
  formDataOrFactory: FormData | (() => FormData),
  options?: {
    maxRetries?: number;
    onProgress?: (message: string) => void;
  }
): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const maxRetries = options?.maxRetries ?? 3;
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0 && options?.onProgress) {
        options.onProgress(`Conectando ao servidor (tentativa ${attempt}/${maxRetries})...`);
      }

      // Generate fresh FormData if factory provided to avoid exhausted streams
      const body = typeof formDataOrFactory === 'function' ? formDataOrFactory() : formDataOrFactory;

      const res = await fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers,
        body,
      });

      if (res.status === 401 && typeof window !== 'undefined') {
        const isAuthPage = window.location.pathname === '/login' || window.location.pathname === '/register';
        if (!isAuthPage) {
          removeAuthToken();
          window.location.href = '/login';
        }
      }

      // Render cold-start codes: 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout
      if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < maxRetries) {
        if (options?.onProgress) {
          options.onProgress('Servidor iniciando... Aguarde alguns instantes.');
        }
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || `Erro HTTP ${res.status} ao enviar imagem.`);
      }

      return res.json() as Promise<T>;
    } catch (err: any) {
      lastError = err;
      const isNetworkErr = err.message === 'Failed to fetch' || err.name === 'TypeError';
      if (isNetworkErr && attempt < maxRetries) {
        if (options?.onProgress) {
          options.onProgress('Aguardando servidor acordar... Tentando novamente em instantes.');
        }
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (isNetworkErr) {
        throw new Error('Falha ao enviar a foto. O servidor demorou para responder ou está reconectando. Clique em "Tentar novamente".');
      }
      throw err;
    }
  }

  throw lastError || new Error('Falha ao enviar a imagem após tentativas.');
}

