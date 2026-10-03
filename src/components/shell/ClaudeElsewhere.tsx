import { ExternalLink } from 'lucide-react';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { ON_CLAUDE, whereOpened } from '../../runtime/claude';

/**
 * Why Claude cannot be asked from here, said where it would have been offered (the agent, Settings), with the way to
 * where it can. The Atlas asks Claude on the viewer's own claude.ai account, which claude.ai lends only to a page shown
 * in its viewer: not to the app opened anywhere else, nor to the Atlas opened on claude.ai as a page of its own.
 */
export function ClaudeElsewhere({ className }: { className?: string }) {
  const where = whereOpened();
  return (
    // A span (shown as a block), so it can sit inside a label's text in Settings.
    <span className={cn('block text-[12px] leading-snug text-ink-3', className)}>
      {where === 'outside'
        ? t('Claude answers when the Atlas is opened in claude.ai, signed in.')
        : where === 'full-page'
          ? t('Opened as a page of its own, the Atlas cannot ask Claude: open it in claude.ai, signed in.')
          : t('Claude cannot be asked in this view: sign in to claude.ai, then open the Atlas again.')}
      {where !== 'viewer' && (
        <>
          {' '}
          <a
            href={ON_CLAUDE}
            target="_blank"
            rel="noopener noreferrer"
            className="tap inline-flex items-center gap-1 text-ink-2 underline underline-offset-2 hover:text-ink"
          >
            {t('Open in claude.ai')}
            <ExternalLink size={11} strokeWidth={1.8} aria-hidden />
          </a>
        </>
      )}
      {where === 'outside' && <> {t('Your atlas does not come along by itself: export it here (Settings → Your data) and import it there.')}</>}
    </span>
  );
}
