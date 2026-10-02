/**
 * Starting the local AI with the app: the language model is loaded only when you chose the local AI and said yes
 * to its download (Settings), and once it is ready, "close in meaning" is measured on your own links.
 */
import { useEffect } from 'react';
import { mapElements } from '../domain/selectors';
import type { AtlasData } from '../domain/types';
import { useAtlas } from '../state/atlasStore';
import { useUI } from '../state/uiStore';
import { calibrate, elementText, startLocalAI, stopLocalAI, useLocalAI } from './engine';
import { sentencesOf } from './tasks';

/**
 * Notes and elements, as what close looks like: each note with the elements you linked it to, and as many it is not
 * linked to (chosen the same way every time), from the latest notes.
 */
export function pairsFrom(data: AtlasData, notes = 60) {
  const elements = mapElements(data);
  const entries = Object.values(data.entries)
    .filter((e) => e.nodeIds.length && e.content.trim())
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, notes);
  const pairs: { sentences: string[]; label: string; linked: boolean }[] = [];
  for (const e of entries) {
    const sentences = sentencesOf(`${e.title ? `${e.title}. ` : ''}${e.content}`);
    if (!sentences.length) continue;
    // Links the local AI made by meaning on its own say nothing about what close looks like to you: left out.
    const byIt = new Set((e.analysis?.suggestions ?? []).flatMap((s) => (s.type === 'link_node' && s.inferred && s.auto ? [s.nodeId] : [])));
    const linked = elements.filter((n) => e.nodeIds.includes(n.id) && !byIt.has(n.id));
    const others = elements.filter((n) => !e.nodeIds.includes(n.id));
    for (const n of linked) pairs.push({ sentences, label: elementText(n.label, n.summary), linked: true });
    for (let k = 0; k < Math.min(linked.length, others.length); k++) {
      const n = others[(e.seq * 7 + k * 13) % others.length];
      pairs.push({ sentences, label: elementText(n.label, n.summary), linked: false });
    }
  }
  return pairs;
}

export function useLocalAIBoot() {
  const on = useUI((s) => s.settings.provider === 'local-ai' && Boolean(s.settings.localModel));
  const host = useUI((s) => s.settings.modelHost);
  const status = useLocalAI((s) => s.status);
  useEffect(() => {
    if (on) startLocalAI({ host: host || undefined });
    else if (useLocalAI.getState().status !== 'off') stopLocalAI();
  }, [on, host]);
  useEffect(() => {
    if (status === 'ready') void calibrate(pairsFrom(useAtlas.getState().data)).catch(() => undefined);
  }, [status]);
}
