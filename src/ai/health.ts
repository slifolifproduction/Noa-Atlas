import { t } from '../i18n';

/** Checks that the analysis proxy is reachable. Kept free of heavy imports. */
export async function checkProxyHealth(endpoint: string): Promise<{ ok: boolean; model?: string; message: string }> {
  try {
    const res = await fetch(`${endpoint.replace(/\/+$/, '')}/health`);
    if (!res.ok) return { ok: false, message: t('Proxy responded with {status}.', { status: res.status }) };
    const json = (await res.json()) as { model?: string };
    return { ok: true, model: json.model, message: json.model ? t('Connected · {model}.', { model: json.model }) : t('Connected.') };
  } catch {
    return { ok: false, message: t('Could not reach the proxy. Start it with `npm run proxy`.') };
  }
}
