/**
 * Tests read every example and Noa's atlas as if they came with the app: in the app they are fetched when needed
 * (loadExample, loadNoa), which the tests of that are written to do on their own.
 */
import { EXAMPLES, loadExample } from './data/examples';
import { loadNoa } from './data/noa';

await Promise.all([loadNoa(), ...EXAMPLES.flatMap((e) => (['id', 'en'] as const).map((lang) => loadExample(e.key, lang)))]);
