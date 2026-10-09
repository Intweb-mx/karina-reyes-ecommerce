/**
 * fetch para Supabase Auth con tiempo máximo. Sin él, una conexión que no responde deja la página colgada hasta el
 * límite de 300 s de Node/Vercel. Las lecturas (GET/HEAD) se reintentan una vez con una conexión nueva; las escrituras
 * no, para no repetir un inicio de sesión o una renovación de token.
 */
export function createAuthFetch(timeoutMs = 6000): typeof fetch {
  return async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const attempts = method === "GET" || method === "HEAD" ? 2 : 1;
    for (let attempt = 1; ; attempt++) {
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      try {
        return await fetch(input, { ...init, signal });
      } catch (error) {
        if (attempt >= attempts || init?.signal?.aborted) throw error;
      }
    }
  };
}

export const authFetch = createAuthFetch();
