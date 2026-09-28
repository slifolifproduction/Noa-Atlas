import { useState } from 'react';
import { CATEGORIES, DOMAINS } from '../../domain/constants';
import type { DomainKey, MindCategory } from '../../domain/types';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { FieldLabel } from '../ui/primitives';

/** Add a satellite to an Orbit domain, or a node to the Mind graph. */
export function AddNodeModal({ layer, onClose, defaultDomain, defaultCategory }: { layer: 'orbit' | 'mind'; onClose(): void; defaultDomain?: DomainKey; defaultCategory?: MindCategory }) {
  const addNode = useAtlas((s) => s.addNode);
  const openEntity = useUI((s) => s.openEntity);
  const requestFocus = useUI((s) => s.requestFocus);
  const [domain, setDomain] = useState<DomainKey>(defaultDomain ?? 'projects');
  const [category, setCategory] = useState<MindCategory>(defaultCategory ?? 'belief');
  const [label, setLabel] = useState('');
  const [summary, setSummary] = useState('');

  const submit = () => {
    if (!label.trim()) return;
    const id = addNode(layer === 'orbit' ? { label, summary, domain } : { label, summary, category });
    openEntity({ kind: 'node', id });
    setTimeout(() => requestFocus(layer, id), 60);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={layer === 'orbit' ? 'Add to Orbit' : 'Add to Mind'}
      description={layer === 'orbit' ? 'A goal, project, skill, person or condition within a life domain.' : 'A belief, assumption, motivation, fear, value, model, decision, question or experience.'}
      width="max-w-[480px]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!label.trim()}>
            Add node
          </Button>
        </>
      }
    >
      <form
        className="space-y-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {layer === 'orbit' ? (
          <div>
            <FieldLabel htmlFor="add-domain">Domain</FieldLabel>
            <select id="add-domain" className="field" value={domain} onChange={(e) => setDomain(e.target.value as DomainKey)}>
              {DOMAINS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <FieldLabel htmlFor="add-cat">Category</FieldLabel>
            <select id="add-cat" className="field" value={category} onChange={(e) => setCategory(e.target.value as MindCategory)}>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label} — {c.description}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <FieldLabel htmlFor="add-label">{layer === 'mind' && category === 'question' ? 'Question' : 'Label'}</FieldLabel>
          <input id="add-label" className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={layer === 'orbit' ? 'e.g. Ship Night Ferry' : 'State it in your own words'} autoFocus />
        </div>
        <div>
          <FieldLabel htmlFor="add-summary" hint="optional">
            Description
          </FieldLabel>
          <textarea id="add-summary" className="field min-h-[72px]" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
