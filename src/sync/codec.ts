/**
 * How an atlas travels to an account and back.
 *
 * The whole atlas is written as JSON, compressed with gzip where the browser
 * can (every current one can), turned into base64 text and cut into parts
 * small enough for one stored document each. A manifest names the parts by
 * a short hash, so a reader can tell a complete set from one caught halfway
 * through a write, and a writer can skip parts that did not change.
 */
import type { AtlasData } from '../domain/types';

export type Encoding = 'gzip-b64' | 'json';

/** Characters per part: a stored document holds at most 256 KiB, with room to spare. */
export const PART_CHARS = 150_000;

export interface Encoded {
  encoding: Encoding;
  parts: string[];
  /** A hash per part, in order. */
  hashes: string[];
  /** A hash of the whole, to tell whether anything changed at all. */
  hash: string;
  /** Size of the JSON before compression. */
  bytes: number;
}

/** FNV-1a, 32-bit, as 8 hex digits: a change detector, not a security measure. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const canCompress = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

function cut(text: string, size = PART_CHARS): string[] {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size));
  return parts.length ? parts : [''];
}

export async function encodeAtlas(data: AtlasData, size = PART_CHARS): Promise<Encoded> {
  const json = JSON.stringify(data);
  const encoding: Encoding = canCompress() ? 'gzip-b64' : 'json';
  const text = encoding === 'gzip-b64' ? toBase64(await pipe(new TextEncoder().encode(json), new CompressionStream('gzip'))) : json;
  const parts = cut(text, size);
  return { encoding, parts, hashes: parts.map(fnv1a), hash: fnv1a(json), bytes: json.length };
}

export async function decodeAtlas(encoding: Encoding, parts: string[]): Promise<AtlasData> {
  const text = parts.join('');
  const json = encoding === 'gzip-b64' ? new TextDecoder().decode(await pipe(fromBase64(text), new DecompressionStream('gzip'))) : text;
  return JSON.parse(json) as AtlasData;
}
