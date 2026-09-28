import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { FieldLabel } from '../../components/ui/primitives';
import { lines } from '../../lib/text';
import { useAtlas } from '../../state/atlasStore';

export function CurrentStateEditor({ onClose }: { onClose(): void }) {
  const state = useAtlas((s) => s.data.currentState);
  const update = useAtlas((s) => s.updateCurrentState);
  const [position, setPosition] = useState(state.position);
  const [summary, setSummary] = useState(state.summary);
  const [constraints, setConstraints] = useState(state.constraints.join('\n'));
  const [assets, setAssets] = useState(state.assets.join('\n'));
  return (
    <Modal
      open
      onClose={onClose}
      title="Current state"
      description="Where you are starting from. Every path branches from here."
      width="max-w-[560px]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              update({ position: position.trim(), summary: summary.trim(), constraints: lines(constraints), assets: lines(assets) });
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div>
          <FieldLabel htmlFor="cs-pos">Position, in one line</FieldLabel>
          <input id="cs-pos" className="field" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Freelance producer, three months into a hybrid test" />
        </div>
        <div>
          <FieldLabel htmlFor="cs-sum" hint="optional">
            Summary
          </FieldLabel>
          <textarea id="cs-sum" className="field min-h-[56px]" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="cs-con" hint="one per line">
              Constraints
            </FieldLabel>
            <textarea id="cs-con" className="field min-h-[110px] text-[12.5px]" value={constraints} onChange={(e) => setConstraints(e.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="cs-as" hint="one per line">
              Assets
            </FieldLabel>
            <textarea id="cs-as" className="field min-h-[110px] text-[12.5px]" value={assets} onChange={(e) => setAssets(e.target.value)} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
