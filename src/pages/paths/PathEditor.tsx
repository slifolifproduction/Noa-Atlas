import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { Modal } from '../../components/ui/Modal';
import { FieldLabel } from '../../components/ui/primitives';
import { pathCode } from '../../domain/selectors';
import type { SkillRequirement, SkillStatus, StrategicPath } from '../../domain/types';
import { lines } from '../../lib/text';
import { useAtlas } from '../../state/atlasStore';

type ListKey = 'requirements' | 'dependencies' | 'risks' | 'tradeoffs' | 'opportunityCosts' | 'unknowns' | 'proposedExperiments';

const LIST_FIELDS: { key: ListKey; label: string; placeholder: string }[] = [
  { key: 'requirements', label: 'Requirements', placeholder: 'What must be true for this path to work' },
  { key: 'dependencies', label: 'Dependencies', placeholder: 'People, money or conditions it relies on' },
  { key: 'risks', label: 'Risks', placeholder: 'What could go wrong' },
  { key: 'tradeoffs', label: 'Trade-offs', placeholder: 'What you gain and what you give up' },
  { key: 'opportunityCosts', label: 'Opportunity costs', placeholder: 'What this path rules out' },
  { key: 'unknowns', label: 'Unknowns', placeholder: 'Beliefs that have not been tested' },
  { key: 'proposedExperiments', label: 'Experiment ideas', placeholder: 'Cheap ways to reduce an unknown' },
];

const skillsToText = (s: SkillRequirement[]) => s.map((x) => `${x.label} | ${x.status}`).join('\n');
function textToSkills(t: string): SkillRequirement[] {
  return lines(t).map((l) => {
    const [label, status] = l.split('|').map((x) => x.trim());
    const st = (['have', 'developing', 'gap'] as SkillStatus[]).find((x) => x === status?.toLowerCase()) ?? 'developing';
    return { label, status: st };
  });
}

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
      title: title.trim() || 'Untitled path',
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
      title={`Edit ${pathCode(path.code)}`}
      description="One item per line. Keep the language descriptive rather than persuasive."
      width="max-w-[720px]"
      footer={
        <>
          <span className="mr-auto">
            <ConfirmButton
              label="Delete path"
              onConfirm={() => {
                remove(path.id);
                onClose();
              }}
            />
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save path
          </Button>
        </>
      }
    >
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FieldLabel htmlFor="p-title">Title</FieldLabel>
          <input id="p-title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel htmlFor="p-obj">Objective</FieldLabel>
          <textarea id="p-obj" className="field min-h-[56px]" value={objective} onChange={(e) => setObjective(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel htmlFor="p-sum" hint="optional">
            Summary
          </FieldLabel>
          <input id="p-sum" className="field" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="p-cap">Capital</FieldLabel>
          <input id="p-cap" className="field" value={capital} onChange={(e) => setCapital(e.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="p-time">Time</FieldLabel>
          <input id="p-time" className="field" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel htmlFor="p-skills" hint="label | have, developing or gap">
            Skills
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
