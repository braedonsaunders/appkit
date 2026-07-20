'use client'

import * as React from 'react'

export type UiLinkComponent = React.ComponentType<
  React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }
>

const UiLinkContext = React.createContext<UiLinkComponent | null>(null)

/** Inject an app router link once so appkit primitives never force full reloads. */
export function UiLinkProvider({
  link,
  children,
}: {
  link: UiLinkComponent
  children: React.ReactNode
}) {
  return <UiLinkContext.Provider value={link}>{children}</UiLinkContext.Provider>
}

export function UiLink({
  href,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const Link = React.useContext(UiLinkContext) ?? 'a'
  return <Link href={href} {...rest} />
}

export type BackLinkProps = { href: string; label: string; className?: string }
export type BackLinkLike = React.ComponentType<BackLinkProps>
export type BackLinkComponent = BackLinkLike

const UiBackLinkContext = React.createContext<BackLinkLike | null>(null)

/** Inject an app-aware history resolver for every PageHeader back link. */
export function UiBackLinkProvider({
  backLink,
  children,
}: {
  backLink: BackLinkLike
  children: React.ReactNode
}) {
  return <UiBackLinkContext.Provider value={backLink}>{children}</UiBackLinkContext.Provider>
}

export function UiBackLink({ href, label, className }: BackLinkProps) {
  const BackLink = React.useContext(UiBackLinkContext)
  if (BackLink) return <BackLink href={href} label={label} className={className} />
  return (
    <UiLink href={href} className={className}>
      ← {label}
    </UiLink>
  )
}
