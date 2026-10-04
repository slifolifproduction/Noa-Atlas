import { ArrowRight, ExternalLink } from 'lucide-react';
import { useAgentPanel } from '../../agent/panel';
import { hrefFor } from '../../app/router';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { ON_CLAUDE, whereOpened } from '../../runtime/claude';

const LINK = 'tap inline-flex items-center gap-1 text-ink-2 underline underline-offset-2 hover:text-ink';

/**
 * Why Claude cannot be asked from here, said where it would have been offered (the agent, Settings), with the ways to
 * where it can. Inside claude.ai the Atlas asks Claude on the viewer's own account, which claude.ai lends only to a
 * page shown in its viewer, not to the Atlas opened there as a page of its own. Anywhere else it asks with the
 * person's own Anthropic API key, once they add one (Settings), or they open it in claude.ai.
 */
export function ClaudeElsewhere({ className }: { className?: string }) {
  const where = whereOpened();
  const claudeLink = (
    <a href={ON_CLAUDE} target="_blank" rel="noopener noreferrer" className={LINK}>
      {t('Open in claude.ai')}
      <ExternalLink size={11} strokeWidth={1.8} aria-hidden />
    </a>
  );
  return (
    // A span (shown as a block), so it can sit inside a label's text in Settings.
    <span className={cn('block text-[12px] leading-snug text-ink-3', className)}>
      {where === 'outside' ? (
        <>
          <span className="block">
            {t('Claude answers here once you add your own Anthropic API key, paid from your own Anthropic credit.')}{' '}
            <a
              href={hrefFor('settings', 'claude')}
              // On a phone the agent covers the page: closed, so Settings is seen.
              onClick={() => window.matchMedia('(min-width: 768px)').matches || useAgentPanel.getState().setOpen(false)}
              className={LINK}
            >
              {t('Add your key')}
              <ArrowRight size={11} strokeWidth={1.8} aria-hidden />
            </a>
          </span>
          <span className="mt-1.5 block">
            {t('Or, signed in to claude.ai, open it there:')} {claudeLink}{' '}
            {t('Your atlas does not come along by itself: export it here (Settings → Your data) and import it there.')}
          </span>
        </>
      ) : where === 'full-page' ? (
        <>
          {t('Opened as a page of its own, the Atlas cannot ask Claude: open it in claude.ai, signed in.')} {claudeLink}
        </>
      ) : (
        t('Claude cannot be asked in this view: sign in to claude.ai, then open the Atlas again.')
      )}
    </span>
  );
}
