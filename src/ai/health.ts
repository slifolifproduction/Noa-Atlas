/** Checks that the analysis proxy is reachable. Kept free of heavy imports. */
export async function checkProxyHealth(endpoint: string): Promise<{ ok: boolean; model?: string; message: string }> {
  try {
    const res = await fetch(`${endpoint.replace(/\/+$/, '')}/health`);
    if (!res.ok) return { ok: false, message: `Proxy responded with ${res.status}.` };
    const json = (await res.json()) as { model?: string };
    return { ok: true, model: json.model, message: `Connected${json.model ? ` · ${json.model}` : ''}.` };
  } catch {
    return { ok: false, message: 'Could not reach the proxy. Start it with `npm run proxy`.' };
  }
}
