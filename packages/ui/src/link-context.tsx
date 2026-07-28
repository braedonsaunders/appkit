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

/** How every navigation primitive renders one entry. */
export type LinkRender = (props: {
  href: string
  children: React.ReactNode
  className: string
  title?: string
  ariaCurrent?: 'page' | 'true'
  role?: string
  dataWalkthrough?: string
}) => React.ReactNode

/**
 * The fallback every navigation primitive uses when the app passes no
 * `linkRender`. It resolves through `UiLink`, so a `UiLinkProvider` at the root
 * is enough to make the whole shell route client-side. A raw `<a>` here would
 * full-reload the document on every click, which tears down the router and
 * skips page transitions entirely.
 */
export const defaultLinkRender: LinkRender = ({
  href,
  children,
  className,
  title,
  ariaCurrent,
  role,
  dataWalkthrough,
}) => (
  <UiLink
    href={href}
    className={className}
    title={title}
    aria-current={ariaCurrent}
    role={role}
    data-walkthrough={dataWalkthrough}
  >
    {children}
  </UiLink>
)

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
