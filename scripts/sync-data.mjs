// Copies the public site data the CLI needs into cli/data/, so the npm tarball is self-contained.
// Run from cli/ inside the site repo (`npm run sync`) after protocol.json, tools.json or the
// first-aid text change, then commit data/ to the public CLI repo. Only public page text and tone
// parameters go in: nothing from reviews, D1 or private notes.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(cli, '..');
const read = (p) => JSON.parse(readFileSync(join(site, p), 'utf8'));

const protocol = read('src/data/protocol.json');
const tools = read('src/data/tools.json').tools
  .filter((t) => t.status === 'live')
  .map(({ id, path, kind, name, summary }) => ({ id, path, kind, name, summary }));
const fa = read('src/i18n/en/first-aid.json');
const firstAid = {
  skipTitle: fa.skipTitle, skip: fa.skip, skipNote: fa.skipNote,
  stepsTitle: fa.stepsTitle, steps: fa.steps,
  sources: fa.sources,
};

mkdirSync(join(cli, 'data'), { recursive: true });
const out = { protocol, tools, firstAid };
for (const [name, data] of Object.entries(out)) {
  writeFileSync(join(cli, 'data', `${name}.json`), JSON.stringify(data, null, 2) + '\n');
}
console.log(`synced data/: protocol v${protocol.version}, ${tools.length} tools, ${firstAid.steps.length} first-aid steps`);
