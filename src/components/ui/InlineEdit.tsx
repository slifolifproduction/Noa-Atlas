import { useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { t } from '../../i18n';

/**
 * Text you change where it stands: shown as it reads, and a click (or tap)
 * turns it into a field. Enter saves a line, Ctrl/⌘ + Enter saves a longer
 * text, leaving the field saves too, and Escape puts it back as it was.
 * Nothing is saved when nothing changed. `display` replaces the plain text
 * when it reads better another way (a list, a badge).
 */
export function EditableLine({
  value,
  onSave,
  className,
  multiline,
  placeholder,
  label,
  hint,
  display,
}: {
  value: string;
  onSave(v: string): void;
  className?: string;
  multiline?: boolean;
  placeholder?: string;
  /** What the field is, for screen readers. */
  label?: string;
  /** A line under the field while it is open. */
  hint?: string;
  display?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const done = useRef(false);
  if (!editing) {
    const start = () => {
      done.current = false;
      setDraft(value);
      setEditing(true);
    };
    const shared = {
      className: cn('tap block w-full cursor-text rounded-[2px] text-left hover:bg-ink/[0.04]', className),
      onClick: start,
      title: t('Click to edit'),
      'aria-label': label ? t('Edit {name}', { name: label }) : undefined,
    };
    // A list is not allowed inside a <button>, so what reads as a list is shown in a focusable block instead.
    if (display)
      return (
        <div
          {...shared}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              start();
            }
          }}
        >
          {display}
        </div>
      );
    return (
      <button type="button" {...shared}>
        {value || <span className="text-ink-3">{placeholder ?? t('Add…')}</span>}
      </button>
    );
  }
  const commit = () => {
    if (done.current) return;
    done.current = true;
    const next = draft.trim();
    if (next !== value.trim()) onSave(next);
    setEditing(false);
  };
  const cancel = () => {
    done.current = true;
    setEditing(false);
  };
  return (
    <div>
      {multiline ? (
        <textarea
          className="field min-h-[56px] text-[12.5px]"
          value={draft}
          rows={Math.max(3, draft.split('\n').length + 1)}
          autoFocus
          aria-label={label}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') cancel();
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
          }}
        />
      ) : (
        <input
          className="field"
          value={draft}
          autoFocus
          aria-label={label}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') cancel();
          }}
        />
      )}
      {hint && <p className="mt-1 text-[11px] text-ink-3">{hint}</p>}
    </div>
  );
}
