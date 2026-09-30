import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { addDays, formatDate, todayISO } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { toast } from '../../state/uiStore';
import { t } from '../../i18n';

/**
 * A quest of your own: a name, a date, and the steps that bring it down.
 * With a plan in Ahead it goes into the plan as a target with its steps
 * (unless kept apart); without one it is kept on its own. Either way it is
 * a boss, it shows in Ahead, and its date is watched on Time.
 */
export function NewQuestModal({ open, onClose, onCreated }: { open: boolean; onClose(): void; onCreated(bossId: string): void }) {
  const hasPlan = useAtlas((s) => Boolean(s.data.navigation));
  const createQuest = useAtlas((s) => s.createQuest);
  const today = todayISO();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(addDays(today, 14));
  const [steps, setSteps] = useState('');
  const [inPlan, setInPlan] = useState(true);
  const ready = title.trim() && due > today;

  const start = () => {
    if (!ready) return;
    const id = createQuest({ title, due, steps: steps.split('\n'), inPlan: hasPlan && inPlan });
    toast(
      hasPlan && inPlan
        ? t('{title} is on: a target in your plan, due {date}.', { title: title.trim(), date: formatDate(due) })
        : t('{title} is on, due {date}. It is in Ahead under your own quests.', { title: title.trim(), date: formatDate(due) }),
      { tone: 'success' },
    );
    setTitle('');
    setSteps('');
    setDue(addDays(today, 14));
    onCreated(`target:${id}`);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('Start a quest')}
      description={t('Something with a date that stands in your way: a deadline, a task, a thing to get done. Its steps are what bring it down.')}
      width="max-w-[520px]"
      initialFocus="#quest-title"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button variant="primary" onClick={start} disabled={!ready}>
            {t('Start the quest')}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <label className="block">
          <span className="label mb-1.5 block">{t('What is it?')}</span>
          <input
            id="quest-title"
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('e.g. Send the grant application')}
          />
        </label>
        <label className="block">
          <span className="label mb-1.5 block">{t('By when?')}</span>
          <input type="date" className="field w-auto" min={addDays(today, 1)} value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <label className="block">
          <span className="label mb-1.5 block">{t('Its steps, one per line')}</span>
          <textarea
            className="field min-h-[96px]"
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            placeholder={t('Each step is one hit. The quest itself, marked done, is the last.')}
          />
        </label>
        {hasPlan ? (
          <label className="flex items-start gap-2.5 text-[13px] text-ink-2">
            <input type="checkbox" className="mt-0.5" checked={inPlan} onChange={(e) => setInPlan(e.target.checked)} />
            <span>
              {t('Put it in your plan in Ahead, as a target with these steps')}
              <span className="block text-[12px] text-ink-3">{t('Unticked, it is kept on its own, and shows in Ahead under your own quests.')}</span>
            </span>
          </label>
        ) : (
          <p className="text-[12px] text-ink-3">{t('No direction is chosen yet, so it is kept on its own and shows in Ahead under your own quests.')}</p>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
