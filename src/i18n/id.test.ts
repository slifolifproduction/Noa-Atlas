import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../data/examples';
import { DRIVERS, EMOTION_OPTIONS } from '../domain/constants';
import { TIME_ZONES } from '../lib/dates';
import { ID } from './id';

const ROOT = join(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'i18n' ? [] : sources(p);
    return /\.tsx?$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });
}

/** Every string literal the code passes to t() or tn(), including both branches of `cond ? 'a' : 'b'`. */
function usedKeys(): Set<string> {
  const keys = new Set<string>();
  const literals = (n: ts.Node | undefined): string[] => {
    if (!n) return [];
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return [n.text];
    if (ts.isConditionalExpression(n)) return [...literals(n.whenTrue), ...literals(n.whenFalse)];
    if (ts.isParenthesizedExpression(n)) return literals(n.expression);
    return [];
  };
  for (const file of sources(ROOT)) {
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        const name = n.expression.text;
        // phraseRule() statements are passed through t() when an analysis is written.
        if (name === 't' || name === 'phraseRule') literals(n.arguments[0]).forEach((k) => keys.add(k));
        if (name === 'tn') [n.arguments[1], n.arguments[2]].forEach((a) => literals(a).forEach((k) => keys.add(k)));
      }
      if (file.endsWith('localAnalysis.ts') && ts.isPropertyAssignment(n) && n.name.getText() === 'statement')
        literals(n.initializer).forEach((k) => keys.add(k));
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return keys;
}

/** Values stored in English and translated where they are shown. */
const DYNAMIC = [
  ...DRIVERS,
  ...EMOTION_OPTIONS,
  ...TIME_ZONES.flatMap((z) => [z.city, z.country]),
  ...EXAMPLES.flatMap((e) => [e.identity, e.blurb]),
  'Local heuristics',
  'Claude',
  'Local AI',
];

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('Indonesian dictionary', () => {
  const used = usedKeys();
  const expected = new Set([...used, ...DYNAMIC]);

  it('translates every piece of interface text', () => {
    expect([...expected].filter((k) => !(k in ID))).toEqual([]);
  });

  it('keeps the same placeholders as the English', () => {
    expect(Object.entries(ID).filter(([en, id]) => placeholders(en).join() !== placeholders(id).join())).toEqual([]);
  });

  it('has no entries the code no longer uses', () => {
    expect(Object.keys(ID).filter((k) => !expected.has(k))).toEqual([]);
  });

  it('never leaves a translation empty', () => {
    expect(Object.entries(ID).filter(([, id]) => !id.trim())).toEqual([]);
  });
});
