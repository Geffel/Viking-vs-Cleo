import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(process.cwd());
const markdownFiles = [
  path.join(repoRoot, 'README.md'),
  ...await collectMarkdown(path.join(repoRoot, 'docs')),
  ...await collectMarkdown(path.join(repoRoot, 'Design-documents')),
];
const broken = [];

for (const file of markdownFiles) {
  const text = await fs.readFile(file, 'utf8');
  for (const match of text.matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = localTarget(match[1]);
    if (!target) continue;

    const resolved = path.resolve(path.dirname(file), target);
    if (!isInsideRepo(resolved) || !await exists(resolved)) {
      broken.push(`${path.relative(repoRoot, file)} -> ${target}`);
    }
  }
}

assert.deepEqual(broken, [], `Brutna lokala Markdown-länkar:\n${broken.join('\n')}`);
console.log(`DOCUMENTATION LINK TESTS OK: ${markdownFiles.length} Markdown-filer kontrollerade`);

async function collectMarkdown(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectMarkdown(candidate));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(candidate);
  }
  return files;
}

function localTarget(rawTarget) {
  let target = rawTarget.trim();
  if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
  target = target.split(/[?#]/, 1)[0];
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) return null;
  return decodeURIComponent(target);
}

function isInsideRepo(candidate) {
  const relative = path.relative(repoRoot, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function exists(candidate) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}
