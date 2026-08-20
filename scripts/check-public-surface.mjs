import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { extname, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const ignoredPaths = new Set(['scripts/check-public-surface.mjs'])
const binaryExtensions = new Set([
  '.avif', '.gif', '.ico', '.jpeg', '.jpg', '.pdf', '.png', '.webp',
])
const forbiddenContent = [
  {
    label: 'private product or repository name',
    pattern: /\b(?:BeaconHS|Bunkhouse|Bidwright|OpenBooks|OpenStudio|Steward)\b/gi,
  },
  {
    label: 'lettered internal reference',
    pattern: /\breference (?:application|repository|source) [ABC]\b/gi,
  },
  {
    label: 'internal repository direction',
    pattern: /\b(?:adjacent reference repositories|named sibling source)\b/gi,
  },
  {
    label: 'internal implementation lineage',
    pattern: /\b(?:source provenance|faithful extraction|extracted from|ported from|production sibling|reference runtime|reference worker|source platform)\b/gi,
  },
  {
    label: 'pinned internal source commit',
    pattern: /\b(?:8d6ace86d3faf92381f2dbfe9ed0d14d937d7beb|2bc3d36ae435b6bb7072a9c990b835bbce47fd0e|1a85726d05d469e93b116b4d7b7e84171291e3ae|76cf58d203001d2111eaf3fb67cdf3b8a380c2df)\b/gi,
  },
  {
    label: 'absolute local user path',
    pattern: /\/Users\/[A-Za-z0-9._-]+\//g,
  },
  {
    label: 'credential-shaped token',
    pattern: /\b(?:github_pat_[A-Za-z0-9_]+|gh[opurs]_[A-Za-z0-9_]+|npm_[A-Za-z0-9]+|sk-[A-Za-z0-9_-]{20,})\b/g,
  },
]

const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
}).split('\0').filter(Boolean)
const errors = []

for (const path of trackedFiles) {
  const absolutePath = resolve(root, path)
  if (!existsSync(absolutePath)) continue
  if (/(?:^|\/)provenance\.md$/i.test(path)) {
    errors.push(`${path} is internal-only and must not be tracked`)
    continue
  }
  if (ignoredPaths.has(path) || binaryExtensions.has(extname(path).toLowerCase())) continue

  const source = readFileSync(absolutePath, 'utf8')
  if (source.includes('\0')) continue
  for (const { label, pattern } of forbiddenContent) {
    pattern.lastIndex = 0
    for (const match of source.matchAll(pattern)) {
      const line = source.slice(0, match.index).split('\n').length
      errors.push(`${relative(root, resolve(root, path))}:${line} contains ${label}`)
    }
  }
}

if (errors.length) {
  console.error(`Public-surface check failed:\n${errors.map((error) => `- ${error}`).join('\n')}`)
  process.exit(1)
}

console.log(`Public surface is clear across ${trackedFiles.length} tracked files.`)
