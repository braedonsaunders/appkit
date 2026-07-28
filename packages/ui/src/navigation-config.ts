/**
 * Framework-neutral tenant navigation configuration.
 *
 * Applications own their route registry and persistence. AppKit owns the
 * stable-key layout contract, reconciliation when new modules ship, and the
 * visibility/order projection consumed by shells and editors.
 */
export type NavigationRegistryItem = {
  /** Stable across releases and persisted by tenants. */
  key: string
  label: string
  description?: string
  iconKey?: string
  /**
   * Required destinations remain visible. Use this for the product home and
   * the screen that lets an administrator restore navigation.
   */
  required?: boolean
}

export type NavigationItemConfig = {
  key: string
  hidden?: boolean
}

export type TenantNavigationConfig = {
  version: 1
  items: NavigationItemConfig[]
  /**
   * Registry keys available when the config was saved. A key missing from this
   * stamp is newly shipped and is appended automatically. A known key omitted
   * from `items` remains omitted.
   */
  knownItemKeys?: string[]
}

export type ResolvedNavigationItem<T extends NavigationRegistryItem = NavigationRegistryItem> =
  T & { hidden: boolean }

export function buildDefaultNavigationConfig(
  registry: readonly NavigationRegistryItem[],
): TenantNavigationConfig {
  return {
    version: 1,
    items: registry.map((item) => ({ key: item.key })),
  }
}

/**
 * Reconcile saved tenant state with the current application registry.
 *
 * This preserves tenant order, drops stale/duplicate entries, restores
 * required destinations, and appends modules shipped after the last save.
 */
export function reconcileNavigationConfig(
  config: TenantNavigationConfig | null | undefined,
  registry: readonly NavigationRegistryItem[],
): TenantNavigationConfig {
  if (!config) return buildDefaultNavigationConfig(registry)

  const registryByKey = new Map(registry.map((item) => [item.key, item]))
  const known = new Set(config.knownItemKeys ?? [])
  const seen = new Set<string>()
  const items: NavigationItemConfig[] = []

  for (const item of config.items) {
    const registryItem = registryByKey.get(item.key)
    if (!registryItem || seen.has(item.key)) continue
    seen.add(item.key)
    items.push({
      key: item.key,
      ...(item.hidden && !registryItem.required ? { hidden: true } : {}),
    })
  }

  for (const registryItem of registry) {
    if (seen.has(registryItem.key)) continue
    if (!registryItem.required && known.has(registryItem.key)) continue
    seen.add(registryItem.key)
    items.push({ key: registryItem.key })
  }

  return {
    version: 1,
    items,
    ...(config.knownItemKeys ? { knownItemKeys: [...config.knownItemKeys] } : {}),
  }
}

export function stampKnownNavigationItems(
  config: TenantNavigationConfig,
  registry: readonly NavigationRegistryItem[],
): TenantNavigationConfig {
  return {
    ...reconcileNavigationConfig(config, registry),
    knownItemKeys: registry.map((item) => item.key),
  }
}

export function resolveNavigationItems<T extends NavigationRegistryItem>(
  registry: readonly T[],
  config?: TenantNavigationConfig | null,
): ResolvedNavigationItem<T>[] {
  const registryByKey = new Map(registry.map((item) => [item.key, item]))
  return reconcileNavigationConfig(config, registry).items.flatMap((saved) => {
    const item = registryByKey.get(saved.key)
    if (!item) return []
    return [{ ...item, hidden: Boolean(saved.hidden && !item.required) }]
  })
}

export function isTenantNavigationConfig(value: unknown): value is TenantNavigationConfig {
  if (!value || typeof value !== 'object') return false
  const config = value as Partial<TenantNavigationConfig>
  if (config.version !== 1 || !Array.isArray(config.items)) return false
  if (
    config.knownItemKeys !== undefined &&
    (!Array.isArray(config.knownItemKeys) ||
      config.knownItemKeys.some((key) => typeof key !== 'string'))
  ) {
    return false
  }
  return config.items.every(
    (item) =>
      Boolean(item) &&
      typeof item === 'object' &&
      typeof item.key === 'string' &&
      (item.hidden === undefined || typeof item.hidden === 'boolean'),
  )
}
