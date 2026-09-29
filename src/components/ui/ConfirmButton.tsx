import { Trash } from 'lucide-react';
import { useState } from 'react';
import { Button } from './Button';
import { t } from '../../i18n';

/** Two-step destructive action, inline rather than a blocking dialog. */
export function ConfirmButton({
  label = t('Delete'),
  confirmLabel = t('Delete permanently'),
  onConfirm,
  size = 'sm',
}: {
  label?: string;
  confirmLabel?: string;
  onConfirm(): void;
  size?: 'sm' | 'md';
}) {
  const [armed, setArmed] = useState(false);
  if (!armed)
    return (
      <Button variant="ghost" size={size} icon={Trash} onClick={() => setArmed(true)}>
        {label}
      </Button>
    );
  return (
    <span className="inline-flex items-center gap-1">
      <Button variant="danger" size={size} onClick={onConfirm} autoFocus>
        {confirmLabel}
      </Button>
      <Button variant="ghost" size={size} onClick={() => setArmed(false)}>
        {t('Cancel')}
      </Button>
    </span>
  );
}
