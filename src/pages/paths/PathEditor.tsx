import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { Modal } from '../../components/ui/Modal';
import { FieldLabel } from '../../components/ui/primitives';
import { SKILL_STATUS_LABEL } from '../../domain/constants';
import { pathCode } from '../../domain/selectors';
import type { SkillRequirement, SkillStatus, StrategicPath } from '../../domain/types';
import { lines } from '../../lib/text';
import { useAtlas } from '../../state/atlasStore';
import { t } from '../../i18n';

type ListKey = 'requirements' | 'dependencies' | 'risks' | 'tradeoffs' | 'opportunityCosts' | 'unknowns' | 'proposedExperiments';

const LIST_FIELDS: { key: ListKey; label: string; placeholder: string }[] = [
  {
    key: 'requirements',
    get label() {
      return t('Requirements');
    },
    get placeholder() {
      return t('What must be true for this path to work');
    },
  },
  {
    key: 'dependencies',
    get label() {
      return t('Dependencies');
    },
    get placeholder() {
      return t('People, money or conditions it relies on');
    },
  },
  {
    key: 'risks',
    get label() {
      return t('Risks');
    },
    get placeholder() {
      return t('What could go wrong');
    },
  },
  {
    key: 'tradeoffs',
    get label() {
      return t('Trade-offs');
    },
    get placeholder() {
      return t('What you gain and what you give up');
    },
  },
  {
    key: 'opportunityCosts',
    get label() {
      return t('Opportunity costs');
    },
    get placeholder() {
      return t('What this path rules out');
    },
  },
  {
    key: 'unknowns',
    get label() {
      return t('Unknowns');
    },
    get placeholder() {
      return t('Beliefs that have not been tested');
    },
  },
  {
    key: 'proposedExperiments',
    get label() {
      return t('Experiment ideas');
    },
    get placeholder() {
      return t('Cheap ways to reduce an unknown');
    },
  },
];

const SKILL_STATUSES: SkillStatus[] = ['have', 'developing', 'gap'];

/** Skills as text, one per line: "label | have", with the level in the interface language. */
export const skillsToText = (s: SkillRequirement[]) => s.map((x) => `${x.label} | ${SKILL_STATUS_LABEL[x.status].toLowerCase()}`).join('\n');

/** Reads "label | level" lines back; the level may be written in either language, and is "developing" when unclear. */
export function textToSkills(text: string): SkillRequirement[] {
  return lines(text).map((l) => {
    const [label, status] = l.split('|').map((x) => x.trim());
    const said = status?.toLowerCase();
    const st = SKILL_STATUSES.find((x) => x === said || SKILL_STATUS_LABEL[x].toLowerCase() === said) ?? 'developing';
    return { label, status: st };
  });
}

/** How skills are written, in the interface language. */
export const skillsHint = () =>
  t('label | {have}, {developing} or {gap}', {
    have: SKILL_STATUS_LABEL.have.toLowerCase(),
    developing: SKILL_STATUS_LABEL.developing.toLowerCase(),
    gap: SKILL_STATUS_LABEL.gap.toLowerCase(),
  });

/** Every path is described with the same fields, which is what makes them comparable. */
export function PathEditor({ path, onClose }: { path: StrategicPath; onClose(): void }) {
  const update = useAtlas((s) => s.updatePath);
  const remove = useAtlas((s) => s.deletePath);
  const [title, setTitle] = useState(path.title);
  const [objective, setObjective] = useState(path.objective);
  const [summary, setSummary] = useState(path.summary);
  const [capital, setCapital] = useState(path.capital);
  const [time, setTime] = useState(path.time);
  const [skills, setSkills] = useState(skillsToText(path.skills));
  const [lists, setLists] = useState(() => Object.fromEntries(LIST_FIELDS.map((f) => [f.key, path[f.key].join('\n')])) as Record<ListKey, string>);

  const save = () => {
    update(path.id, {
      title: title.trim() || t('Untitled path'),
      objective: objective.trim(),
      summary: summary.trim(),
      capital: capital.trim(),
      time: time.trim(),
      skills: textToSkills(skills),
      ...(Object.fromEntries(LIST_FIELDS.map((f) => [f.key, lines(lists[f.key])])) as Record<ListKey, string[]>),
    });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('Edit {code}', { code: pathCode(path.code) })}
      description={t('One item per line. Keep the language descriptive rather than persuasive.')}
      width="max-w-[720px]"
      footer={
        <>
          <span className="mr-auto">
            <ConfirmButton
              label={t('Delete path')}
              onConfirm={() => {
                remove(path.id);
                onClose();
              }}
            />
          </span>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button variant="primary" onClick={save}>
            {t('Save path')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FieldLabel htmlFor="p-title">{t('Title')}</FieldLabel>
          <input id="p-title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel htmlFor="p-obj">{t('Objective')}</FieldLabel>
          <textarea id="p-obj" className="field min-h-[56px]" value={objective} onChange={(e) => setObjective(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel htmlFor="p-sum" hint="optional">
            {t('Summary')}
          </FieldLabel>
          <input id="p-sum" className="field" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="p-cap">{t('Capital')}</FieldLabel>
          <input id="p-cap" className="field" value={capital} onChange={(e) => setCapital(e.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="p-time">{t('Time')}</FieldLabel>
          <input id="p-time" className="field" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel htmlFor="p-skills" hint={skillsHint()}>
            {t('Skills')}
          </FieldLabel>
          <textarea id="p-skills" className="field num min-h-[88px] text-[12.5px]" value={skills} onChange={(e) => setSkills(e.target.value)} />
        </div>
        {LIST_FIELDS.map((f) => (
          <div key={f.key}>
            <FieldLabel htmlFor={`p-${f.key}`}>{f.label}</FieldLabel>
            <textarea
              id={`p-${f.key}`}
              className="field min-h-[88px] text-[12.5px]"
              value={lists[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => setLists({ ...lists, [f.key]: e.target.value })}
            />
          </div>
        ))}
      </div>
    </Modal>
  );
}
