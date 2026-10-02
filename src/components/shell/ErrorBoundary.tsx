import { Component, type ErrorInfo, type ReactNode } from 'react';
import { navigate } from '../../app/router';
import { t } from '../../i18n';
import { todayISO } from '../../lib/dates';
import { downloadText } from '../../lib/download';
import { exportPayload } from '../../persistence/storage';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { Button } from '../ui/Button';

type Where = 'app' | 'page' | 'panel';

/**
 * When drawing something fails, only that part gives way: the page, the side panel, or (last of all) the whole app,
 * each saying that the atlas is safe, with a way on (try again, somewhere else) and a copy of the atlas to download.
 * The atlas is in its store and in the browser's storage, not in what is drawn, so nothing of it is lost.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; where: Where; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[atlas] the ${this.props.where} could not be drawn`, error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    // Somewhere else now (another page, another thing in the panel): try drawing again.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <Fallback where={this.props.where} error={error} retry={() => this.setState({ error: null })} />;
  }
}

function Fallback({ where, error, retry }: { where: Where; error: Error; retry(): void }) {
  const download = () => downloadText(`noa-atlas-${todayISO()}.json`, exportPayload(useAtlas.getState().data));
  const title =
    where === 'panel' ? t('This panel could not be drawn.') : where === 'page' ? t('Something went wrong drawing this page.') : t('Something went wrong.');
  return (
    <div
      role="alert"
      className={
        where === 'panel'
          ? 'fixed right-3 bottom-3 z-40 w-[min(360px,calc(100vw-24px))] rounded-[2px] border border-line-strong bg-overlay p-4 shadow-2xl'
          : where === 'page'
            ? 'mx-auto max-w-[560px] px-6 py-16'
            : 'flex min-h-dvh flex-col items-start justify-center bg-canvas px-6 py-16 sm:mx-auto sm:max-w-[560px]'
      }
    >
      <h2 className="display text-[22px] leading-tight text-ink">{title}</h2>
      <p className="mt-2 text-[13px] leading-snug text-ink-2">{t('Your atlas is safe: it is kept in this browser, and nothing was changed.')}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {where === 'app' ? (
          <Button variant="primary" onClick={() => location.reload()}>
            {t('Reload')}
          </Button>
        ) : (
          <Button variant="primary" onClick={retry}>
            {t('Try again')}
          </Button>
        )}
        {where === 'page' && (
          <Button
            onClick={() => {
              navigate('orbit');
              retry();
            }}
          >
            {t('Go to the Map')}
          </Button>
        )}
        {where === 'panel' && (
          <Button
            onClick={() => {
              useUI.getState().closeInspector();
              retry();
            }}
          >
            {t('Close the panel')}
          </Button>
        )}
        <Button variant="ghost" onClick={download}>
          {t('Download a copy of your atlas')}
        </Button>
      </div>
      <p className="mt-4 font-mono text-[11px] break-words text-ink-3">{error.message}</p>
    </div>
  );
}
