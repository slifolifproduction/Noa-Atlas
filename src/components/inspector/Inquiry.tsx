import { accountLabel, type Account } from '../../domain/accounts';
import { INQUIRY_KIND_LABEL, type Inquiry } from '../../domain/inquiry';
import type { EntityRef } from '../../domain/types';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { Button } from '../ui/Button';
import { t } from '../../i18n';

const same = (a: EntityRef, b?: EntityRef) => Boolean(b) && a.kind === b!.kind && a.id === b!.id;

/**
 * What the Atlas would like to find out, and why: the question, the two
 * readings its answer would tell apart, and what each answer would mean.
 * "Not now" puts it away for a while.
 */
export function InquiryList({ items, max = 2, here }: { items: Inquiry[]; max?: number; here?: EntityRef }) {
  const open = useUI((s) => s.openEntity);
  const decline = useAtlas((s) => s.declineInquiry);
  if (!items.length) return null;
  return (
    <ul className="space-y-2">
      {items.slice(0, max).map((q) => (
        <li key={q.key} className="rounded-[2px] border border-line p-2.5">
          <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-ink-3">
            <span className="label">{INQUIRY_KIND_LABEL[q.kind]()}</span>
            {q.decisive && <span>· {t('would tell them apart')}</span>}
          </div>
          <p className="mt-1 text-[12.5px] leading-snug text-ink">{q.question}</p>
          {q.between.length === 2 && (
            <p className="mt-1 text-[11.5px] leading-snug text-ink-3">{t('Between “{a}” and “{b}”.', { a: q.between[0], b: q.between[1] })}</p>
          )}
          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-3">
            {t('If so: {a}', { a: q.ifSo })} {t('If not: {b}', { b: q.ifNot })}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            {!same(q.open, here) && (
              <Button size="sm" variant="ghost" onClick={() => open(q.open)}>
                {t('Look into it')}
              </Button>
            )}
            <button type="button" className="text-[11.5px] text-ink-3 hover:text-ink" onClick={() => decline(q.key, q.kind)}>
              {t('Not now')}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

const STANDING = {
  get open() {
    return t('open');
  },
  get weakened() {
    return t('weakened');
  },
  get set_aside() {
    return t('set aside');
  },
};

/** Other ways to read the same record, each with where it stands and why. */
export function AccountList({ accounts, max = 5 }: { accounts: Account[]; max?: number }) {
  const data = useAtlas((s) => s.data);
  const open = accounts.filter((a) => a.standing !== 'set_aside');
  const aside = accounts.filter((a) => a.standing === 'set_aside');
  if (!accounts.length) return null;
  return (
    <div>
      <ul className="space-y-1.5">
        {[...open.slice(0, max), ...aside].map((a) => (
          <li key={a.key} className={cn('text-[12.5px] leading-snug', a.standing === 'set_aside' ? 'text-ink-3' : 'text-ink-2')}>
            {accountLabel(data, a)} <span className="text-[11px] text-ink-3">· {STANDING[a.standing]}</span>
            <span className="block text-[11.5px] text-ink-3">{a.because}</span>
          </li>
        ))}
      </ul>
      {open.length > max && <p className="mt-1 text-[11.5px] text-ink-3">{t('{n} more still open.', { n: open.length - max })}</p>}
    </div>
  );
}
