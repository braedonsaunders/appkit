import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)

export const FEATURE_PACKAGES = {
  ai: ['@appkit/ai'],
  analytics: ['@appkit/analytics', '@appkit/dashboard', '@appkit/reports'],
  communications: ['@appkit/email-render', '@appkit/emails', '@appkit/notifications', '@appkit/sms'],
  customization: ['@appkit/customization'],
  documents: ['@appkit/design-studio', '@appkit/forms-documents', '@appkit/forms-pdf', '@appkit/pdf'],
  extensions: ['@appkit/apps', '@appkit/endpoints', '@appkit/sandbox', '@appkit/scripts'],
  forms: ['@appkit/editor', '@appkit/forms', '@appkit/forms-core', '@appkit/i18n'],
  integrations: ['@appkit/integrations', '@appkit/sync'],
  platform: ['@appkit/api', '@appkit/auth', '@appkit/crypto', '@appkit/events'],
  tenancy: ['@appkit/db', '@appkit/tenant'],
  workflows: ['@appkit/jobs', '@appkit/workflows'],
} as const

export type FeatureName = keyof typeof FEATURE_PACKAGES
export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

export type ScaffoldOptions = {
  directory: string
  features?: FeatureName[]
  packageManager?: PackageManager
  install?: boolean
  initializeGit?: boolean
}

const APPKIT_VERSION = 'latest'

export async function scaffoldProject(options: ScaffoldOptions): Promise<{ directory: string; packages: string[] }> {
  const directory = resolve(options.directory)
  const packageManager = options.packageManager ?? 'pnpm'
  const features = [...new Set(options.features ?? [])].sort()
  for (const feature of features) {
    if (!(feature in FEATURE_PACKAGES)) throw new Error(`Unknown AppKit feature: ${feature}`)
  }

  await assertWritableTarget(directory)
  await mkdir(directory, { recursive: true })

  const selectedPackages = [
    '@appkit/tokens',
    '@appkit/ui',
    ...features.flatMap((feature) => FEATURE_PACKAGES[feature]),
  ].filter((value, index, values) => values.indexOf(value) === index)

  const projectName = safePackageName(basename(directory))
  const dependencies = Object.fromEntries(selectedPackages.map((name) => [name, APPKIT_VERSION]))
  Object.assign(dependencies, {
    'lucide-react': '^1.24.0',
    next: '16.2.10',
    react: '^19.2.7',
    'react-dom': '^19.2.7',
  })
  if (features.includes('analytics')) Object.assign(dependencies, { 'react-grid-layout': '^2.2.3' })
  if (features.includes('tenancy')) Object.assign(dependencies, { 'drizzle-orm': '^0.45.2', pg: '^8.13.1' })
  if (features.includes('workflows')) Object.assign(dependencies, { '@xyflow/react': '^12.10.0' })

  await writeProjectFiles(directory, {
    '.gitignore': `.next/\nnode_modules/\ndist/\n.env\n.env.local\n*.tsbuildinfo\n`,
    'README.md': projectReadme(projectName, features, selectedPackages, packageManager),
    'eslint.config.mjs': `import { defineConfig, globalIgnores } from 'eslint/config'\nimport nextVitals from 'eslint-config-next/core-web-vitals'\nimport nextTs from 'eslint-config-next/typescript'\n\nexport default defineConfig([\n  ...nextVitals,\n  ...nextTs,\n  globalIgnores(['.next/**', 'dist/**', 'next-env.d.ts']),\n])\n`,
    'next.config.ts': `import type { NextConfig } from 'next'\n\nconst nextConfig: NextConfig = {\n  experimental: { viewTransition: true },\n}\n\nexport default nextConfig\n`,
    'package.json': `${JSON.stringify(
      {
        name: projectName,
        version: '0.1.0',
        private: true,
        type: 'module',
        scripts: {
          dev: 'next dev',
          build: 'next build',
          start: 'next start',
          lint: 'eslint .',
          typecheck: 'tsc --noEmit',
        },
        dependencies,
        devDependencies: {
          '@tailwindcss/postcss': '^4.1.16',
          '@types/node': '^22',
          '@types/react': '^19',
          '@types/react-dom': '^19',
          eslint: '^9',
          'eslint-config-next': '16.2.10',
          tailwindcss: '^4.1.16',
          typescript: '^5.9.3',
        },
      },
      null,
      2,
    )}\n`,
    'postcss.config.mjs': `export default { plugins: { '@tailwindcss/postcss': {} } }\n`,
    'src/app/globals.css': `@import '@appkit/ui/styles.css';\n@source '../**/*.{ts,tsx}';\n\nhtml, body { min-height: 100%; }\n`,
    'src/app/layout.tsx': `import type { Metadata } from 'next'\nimport Script from 'next/script'\nimport type { ReactNode } from 'react'\nimport { getThemeScript, Toaster } from '@appkit/ui'\nimport { AppFrame } from '@/components/app-frame'\nimport './globals.css'\n\nexport const metadata: Metadata = {\n  title: '${displayName(projectName)}',\n  description: 'Built with AppKit',\n}\n\nexport default function RootLayout({ children }: { children: ReactNode }) {\n  return (\n    <html lang="en" suppressHydrationWarning>\n      <head><Script id="appkit-theme" strategy="beforeInteractive">{getThemeScript()}</Script></head>\n      <body className="min-h-screen bg-bg text-fg antialiased">\n        <AppFrame>{children}</AppFrame>\n        <Toaster richColors closeButton />\n      </body>\n    </html>\n  )\n}\n`,
    'src/app/page.tsx': `import { Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader } from '@appkit/ui'\n\nexport default function HomePage() {\n  return (\n    <div className="min-h-0 flex-1 overflow-y-auto">\n      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">\n        <PageHeader title="${displayName(projectName)}" description="Your application foundation is ready." />\n        <Card>\n          <CardHeader>\n            <CardTitle>Build the product</CardTitle>\n            <CardDescription>AppKit supplies the shell, tokens, primitives, and optional platform packages.</CardDescription>\n          </CardHeader>\n          <CardContent className="text-sm text-fg-muted">Replace this card with your first application workflow.</CardContent>\n        </Card>\n      </div>\n    </div>\n  )\n}\n`,
    'src/components/app-frame.tsx': `'use client'\n\nimport Link from 'next/link'\nimport { usePathname } from 'next/navigation'\nimport type { ReactNode } from 'react'\nimport { AppShell, ThemeProvider, UiLinkProvider, type SidebarNavGroup } from '@appkit/ui'\nimport { PageTransition } from '@appkit/ui/page-transition'\n\nconst navigation: SidebarNavGroup[] = [\n  { id: 'app', label: 'Application', items: [{ href: '/', label: 'Home', iconKey: 'home', exact: true, mobile: true }] },\n]\n\nexport function AppFrame({ children }: { children: ReactNode }) {\n  const pathname = usePathname()\n  return (\n    <UiLinkProvider link={Link}>\n      <ThemeProvider>\n        <AppShell groups={navigation} pathname={pathname} brand={<strong>${displayName(projectName)}</strong>}>\n          <PageTransition navigationKey={pathname}>{children}</PageTransition>\n        </AppShell>\n      </ThemeProvider>\n    </UiLinkProvider>\n  )\n}\n`,
    'tsconfig.json': `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2023',
          lib: ['dom', 'dom.iterable', 'esnext'],
          allowJs: false,
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          module: 'esnext',
          moduleResolution: 'bundler',
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: 'react-jsx',
          incremental: true,
          plugins: [{ name: 'next' }],
          paths: { '@/*': ['./src/*'] },
        },
        include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
        exclude: ['node_modules'],
      },
      null,
      2,
    )}\n`,
  })

  if (options.install !== false) await run(packageManager, installArguments(packageManager), directory)
  if (options.initializeGit !== false && !(await exists(resolve(directory, '.git')))) {
    await run('git', ['init', '--quiet'], directory)
  }

  return { directory, packages: selectedPackages }
}

async function assertWritableTarget(directory: string): Promise<void> {
  if (!(await exists(directory))) return
  const entries = await readdir(directory)
  if (entries.length > 0) throw new Error(`Target directory is not empty: ${directory}`)
  await access(directory, constants.W_OK)
}

async function writeProjectFiles(directory: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const target = resolve(directory, path)
    await mkdir(resolve(target, '..'), { recursive: true })
    await writeFile(target, content)
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function run(command: string, args: string[], cwd: string): Promise<void> {
  await exec(command, args, { cwd, maxBuffer: 10 * 1024 * 1024 })
}

function installArguments(packageManager: PackageManager): string[] {
  if (packageManager === 'yarn') return ['install']
  if (packageManager === 'bun') return ['install']
  return ['install']
}

function safePackageName(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!normalized) throw new Error('The target directory must produce a valid package name')
  return normalized
}

function displayName(value: string): string {
  return value
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function projectReadme(
  name: string,
  features: FeatureName[],
  packages: string[],
  packageManager: PackageManager,
): string {
  const selected = features.length > 0 ? features.join(', ') : 'interface foundation'
  return `# ${displayName(name)}\n\nBuilt with [AppKit](https://github.com/braedonsaunders/appkit).\n\nSelected capabilities: ${selected}.\n\n## Development\n\n\`\`\`bash\n${packageManager} install\n${packageManager === 'npm' ? 'npm run' : packageManager} dev\n\`\`\`\n\n## Installed AppKit packages\n\n${packages.map((pkg) => `- \`${pkg}\``).join('\n')}\n\nAppKit packages are modular. Configure only the adapters and persistence required by your application; see the [AppKit package guide](https://github.com/braedonsaunders/appkit#what-you-can-build-with).\n`
}

export async function readGeneratedPackage(directory: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'))
}
