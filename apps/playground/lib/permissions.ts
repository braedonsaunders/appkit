/** The app's permission catalogue — the single vocabulary for roles + API keys. */
export const PERMISSION_CATALOGUE = ['team.read', 'team.manage'] as const
export type Permission = (typeof PERMISSION_CATALOGUE)[number]
