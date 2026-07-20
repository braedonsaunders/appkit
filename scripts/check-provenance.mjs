import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const provenance = readFileSync(join(root, 'docs/for-agents/provenance.md'), 'utf8')
const errors = []
let count = 0

for (const directory of readdirSync(join(root, 'packages'))) {
  const manifestPath = join(root, 'packages', directory, 'package.json')
  if (!existsSync(manifestPath)) continue
  const { name } = JSON.parse(readFileSync(manifestPath, 'utf8'))
  count += 1
  if (!provenance.includes(`\`${name}\``)) errors.push(`${name} has no explicit provenance classification`)
}

for (const [source, commit] of [
  ['reference application A', '680b153f84550025a55149bc6deaaaf83b16f41f'],
  ['reference application B', '2bc3d36ae435b6bb7072a9c990b835bbce47fd0e'],
]) {
  if (!provenance.includes(commit)) errors.push(`${source} source commit is not pinned`)
}

if (errors.length) {
  console.error(`Provenance check failed:\n${errors.map((error) => `- ${error}`).join('\n')}`)
  process.exit(1)
}

console.log(`Provenance explicitly classifies all ${count} packages against pinned source commits.`)
