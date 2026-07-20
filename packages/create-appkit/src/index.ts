#!/usr/bin/env node

import { createInterface } from 'node:readline/promises'
import { readFile } from 'node:fs/promises'
import { stdin, stdout } from 'node:process'
import { FEATURE_PACKAGES, scaffoldProject, type FeatureName, type PackageManager } from './scaffold'

type CliOptions = {
  directory?: string
  features: FeatureName[]
  packageManager: PackageManager
  install: boolean
  initializeGit: boolean
  yes: boolean
  help: boolean
  version: boolean
}

export function parseArguments(argv: string[]): CliOptions {
  const options: CliOptions = {
    features: [],
    packageManager: 'pnpm',
    install: true,
    initializeGit: true,
    yes: false,
    help: false,
    version: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]!
    if (value === '--help' || value === '-h') options.help = true
    else if (value === '--version' || value === '-v') options.version = true
    else if (value === '--yes' || value === '-y') options.yes = true
    else if (value === '--no-install') options.install = false
    else if (value === '--no-git') options.initializeGit = false
    else if (value === '--features') options.features = parseFeatures(argv[++index])
    else if (value.startsWith('--features=')) options.features = parseFeatures(value.slice(11))
    else if (value === '--package-manager') options.packageManager = parsePackageManager(argv[++index])
    else if (value.startsWith('--package-manager=')) options.packageManager = parsePackageManager(value.slice(18))
    else if (value.startsWith('-')) throw new Error(`Unknown option: ${value}`)
    else if (options.directory) throw new Error(`Unexpected argument: ${value}`)
    else options.directory = value
  }
  return options
}

function parseFeatures(value: string | undefined): FeatureName[] {
  if (value === undefined) throw new Error('--features requires a comma-separated value')
  if (!value.trim()) return []
  return value.split(',').map((feature) => {
    const normalized = feature.trim() as FeatureName
    if (!(normalized in FEATURE_PACKAGES)) throw new Error(`Unknown AppKit feature: ${feature.trim()}`)
    return normalized
  })
}

function parsePackageManager(value: string | undefined): PackageManager {
  if (value === 'pnpm' || value === 'npm' || value === 'yarn' || value === 'bun') return value
  throw new Error(`Unsupported package manager: ${value ?? ''}`)
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) return stdout.write(helpText())
  if (options.version) {
    const manifest = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'))
    return stdout.write(`${manifest.version}\n`)
  }

  let directory = options.directory
  let features = options.features
  const interactive = !options.yes && stdin.isTTY && stdout.isTTY
  const prompt = interactive ? createInterface({ input: stdin, output: stdout }) : null
  try {
    if (!directory) {
      if (!prompt) throw new Error('A target directory is required outside an interactive terminal')
      directory = (await prompt.question('Where should AppKit create the application? (my-app) ')).trim() || 'my-app'
    }
    if (prompt && features.length === 0) {
      const answer = await prompt.question(
        `Optional capabilities (${Object.keys(FEATURE_PACKAGES).join(', ')}; blank for none): `,
      )
      features = parseFeatures(answer)
    }
  } finally {
    prompt?.close()
  }

  const result = await scaffoldProject({
    directory,
    features,
    packageManager: options.packageManager,
    install: options.install,
    initializeGit: options.initializeGit,
  })
  stdout.write(`\nCreated ${result.directory}\nInstalled AppKit foundation: ${result.packages.join(', ')}\n`)
}

function helpText(): string {
  return `create-appkit [directory] [options]\n\nCreate a Next.js application on AppKit's modular foundation.\n\nOptions:\n  --features <list>         Comma-separated optional capabilities\n  --package-manager <name> pnpm, npm, yarn, or bun (default: pnpm)\n  --no-install              Write the project without installing dependencies\n  --no-git                  Do not initialize a Git repository\n  -y, --yes                 Accept non-interactive defaults\n  -h, --help                Show this help\n  -v, --version             Show the package version\n\nCapabilities:\n  ${Object.keys(FEATURE_PACKAGES).join(', ')}\n`
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
