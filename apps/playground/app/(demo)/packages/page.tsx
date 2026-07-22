import Link from 'next/link'
import { ArrowRight, Boxes } from 'lucide-react'
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageContainer,
  PageHeader,
} from '@appkit/ui'
import { PACKAGE_CATALOG, PACKAGE_CATEGORIES } from '../../../lib/server/package-catalog'

export const metadata = {
  title: 'Packages — appkit',
  description: 'Every publishable AppKit package, its entry points, dependencies, and live references.',
}

export default function PackagesPage() {
  return (
    <PageContainer className="space-y-10">
      <PageHeader
        title="Packages"
        description={`${PACKAGE_CATALOG.length} independently installable packages. Open any package to inspect its real manifest, public entry points, dependency posture, and available demo.`}
      />

      {PACKAGE_CATEGORIES.map((category) => {
        const packages = PACKAGE_CATALOG.filter((item) => item.category === category.key)
        return (
          <section key={category.key} className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-fg">{category.label}</h2>
              <p className="text-sm text-fg-muted">{category.description}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {packages.map((item) => (
                <Link key={item.name} href={`/packages/${item.slug}`} className="group rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Card interactive className="h-full">
                    <CardHeader className="gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary">
                          <Boxes className="size-4" />
                        </span>
                        <Badge variant="secondary">v{item.version}</Badge>
                      </div>
                      <CardTitle className="font-mono text-base">{item.name}</CardTitle>
                      <CardDescription>{item.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between gap-3 text-xs text-fg-subtle">
                      <span>{item.exports.length} public {item.exports.length === 1 ? 'entry' : 'entries'}</span>
                      <span className="inline-flex items-center gap-1 font-medium text-primary">
                        Package details <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )
      })}
    </PageContainer>
  )
}
