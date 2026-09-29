import { Fragment, type ReactNode } from 'react';

/**
 * A translated sentence with pieces of markup inside it: `text` holds
 * `{name}` markers (already passed through t()), `values` the nodes to put
 * there. Translators can move the markers, so word order stays natural.
 */
export function Trans({ text, values }: { text: string; values: Record<string, ReactNode> }) {
  const parts = text.split(/\{(\w+)\}/g);
  return <>{parts.map((p, i) => (i % 2 ? <Fragment key={i}>{values[p] ?? `{${p}}`}</Fragment> : p))}</>;
}
