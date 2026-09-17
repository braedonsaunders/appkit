'use client'

import * as React from 'react'
import { Tabs } from '@braedonsaunders/appkit-ui'
import type { PlatformTenantRecord, PlatformUserRecord } from '@braedonsaunders/appkit-superadmin'
import { createPlatformNav } from '@braedonsaunders/appkit-superadmin'
import {
  DatabaseMaintenanceAdmin,
  DeliveryLogAdmin,
  PlatformHub,
  PlatformMenu,
  PlatformTenantsAdmin,
  PlatformUsersAdmin,
  ProviderSettingsForm,
  type DeliveryLogRecord,
  type PlatformTenantsActions,
  type PlatformUsersActions,
} from '@braedonsaunders/appkit-superadmin/react'

const now = new Date('2026-07-28T12:00:00.000Z')
const demoTenants = [
  { id: 'workspace-main', name: 'Main workspace' },
  { id: 'workspace-field', name: 'Field operations' },
]

const seedUsers: PlatformUserRecord[] = [
  {
    id: 'operator',
    name: 'Jordan Lee',
    email: 'jordan@example.com',
    image: null,
    emailVerified: true,
    isActive: true,
    isSuperAdmin: true,
    hasCredential: true,
    activeSessionCount: 2,
    lastSeenAt: now,
    createdAt: new Date('2025-02-10T12:00:00.000Z'),
    updatedAt: now,
  },
  {
    id: 'support',
    name: 'Morgan Chen',
    email: 'morgan@example.com',
    image: null,
    emailVerified: true,
    isActive: true,
    isSuperAdmin: false,
    hasCredential: true,
    activeSessionCount: 1,
    lastSeenAt: new Date('2026-07-28T10:15:00.000Z'),
    createdAt: new Date('2025-08-21T12:00:00.000Z'),
    updatedAt: now,
  },
  {
    id: 'former',
    name: 'Taylor Singh',
    email: 'taylor@example.com',
    image: null,
    emailVerified: false,
    isActive: false,
    isSuperAdmin: false,
    hasCredential: false,
    activeSessionCount: 0,
    lastSeenAt: new Date('2026-05-12T09:30:00.000Z'),
    createdAt: new Date('2026-01-08T12:00:00.000Z'),
    updatedAt: now,
  },
]

const seedTenants: PlatformTenantRecord[] = [
  {
    id: 'workspace-main',
    name: 'Main workspace',
    slug: 'main',
    status: 'active',
    memberCount: 2,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: now,
  },
  {
    id: 'workspace-field',
    name: 'Field operations',
    slug: 'field',
    status: 'active',
    memberCount: 1,
    createdAt: new Date('2025-06-01T00:00:00.000Z'),
    updatedAt: now,
  },
]

const seedLogs: DeliveryLogRecord[] = [
  {
    id: 'mail-1',
    createdAt: now,
    tenantName: 'Main workspace',
    recipient: 'jordan@example.com',
    subject: 'Welcome',
    status: 'sent',
    provider: 'resend',
    category: 'auth',
  },
  {
    id: 'mail-2',
    createdAt: now,
    tenantName: 'Field operations',
    recipient: 'ops@example.com',
    subject: 'Digest failed',
    status: 'failed',
    provider: 'resend',
    errorMessage: '550 mailbox unavailable',
  },
]

const nav = createPlatformNav()

export function SuperadminDemo() {
  const [tab, setTab] = React.useState('overview')
  const [users, setUsers] = React.useState(seedUsers)
  const [tenants, setTenants] = React.useState(seedTenants)
  const [pathname, setPathname] = React.useState('/platform')

  const userActions = React.useMemo<PlatformUsersActions>(() => ({
    async createUser(input) {
      setUsers((current) => [
        ...current,
        {
          id: `demo-${current.length + 1}`,
          name: input.name,
          email: input.email,
          image: null,
          emailVerified: false,
          isActive: true,
          isSuperAdmin: input.isSuperAdmin ?? false,
          hasCredential: true,
          activeSessionCount: 0,
          lastSeenAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])
      return { ok: true, message: 'Demo user created.' }
    },
    async updateUser(userId, input) {
      setUsers((current) => current.map((user) => (
        user.id === userId ? { ...user, ...input, updatedAt: new Date() } : user
      )))
      return { ok: true, message: 'Demo user updated.' }
    },
    async setPassword(userId) {
      setUsers((current) => current.map((user) => (
        user.id === userId ? { ...user, hasCredential: true, updatedAt: new Date() } : user
      )))
      return { ok: true, message: 'Demo password replaced.' }
    },
    async revokeUserSessions(userId) {
      setUsers((current) => current.map((user) => (
        user.id === userId ? { ...user, activeSessionCount: 0, updatedAt: new Date() } : user
      )))
      return { ok: true, message: 'Demo sessions revoked.' }
    },
  }), [])

  const tenantActions = React.useMemo<PlatformTenantsActions>(() => ({
    async createTenant(input) {
      setTenants((current) => [
        ...current,
        {
          id: `tenant-${current.length + 1}`,
          name: input.name,
          slug: input.slug,
          status: 'active',
          memberCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])
      return { ok: true, message: `${input.name} created.` }
    },
    async setTenantStatus(tenantId, status) {
      setTenants((current) => current.map((tenant) => (
        tenant.id === tenantId ? { ...tenant, status, updatedAt: new Date() } : tenant
      )))
      return { ok: true }
    },
    async addMember() {
      return { ok: true, message: 'Demo member added.' }
    },
    async setMemberStatus() {
      return { ok: true }
    },
    async removeMember() {
      return { ok: true }
    },
  }), [])

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <PlatformMenu pathname={pathname} />
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value)
          setPathname(value === 'overview' ? '/platform' : `/platform/${value}`)
        }}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'users', label: 'Users' },
          { value: 'tenants', label: 'Tenants' },
          { value: 'email', label: 'Email' },
          { value: 'log', label: 'Email log' },
          { value: 'database', label: 'Database' },
        ]}
      />
      {tab === 'overview' ? <PlatformHub tiles={nav.tiles} /> : null}
      {tab === 'users' ? (
        <PlatformUsersAdmin
          users={users}
          currentUserId="operator"
          tenants={demoTenants}
          defaultTenantId="workspace-main"
          actions={userActions}
          title="Platform users"
          description="A live package demo of installation-wide identity administration."
        />
      ) : null}
      {tab === 'tenants' ? (
        <PlatformTenantsAdmin
          tenants={tenants}
          members={{}}
          currentTenantId="workspace-main"
          actions={tenantActions}
        />
      ) : null}
      {tab === 'email' ? (
        <ProviderSettingsForm
          kind="email"
          scope="platform"
          specs={[
            { value: 'resend', label: 'Resend', hasSecret: true, secretLabel: 'API key', keyHint: 're_…', secretRequired: true, fields: [] },
            { value: 'smtp', label: 'SMTP', hasSecret: true, secretLabel: 'Password', keyHint: 'optional', secretRequired: false, fields: [
              { key: 'smtpHost', kind: 'text', label: 'Host', required: true },
            ] },
          ]}
          initial={{ enabled: true, provider: 'resend', hasKey: true, mode: 'tenant_optional', fromName: 'AppKit', fromEmail: 'ops@example.com' }}
          onSubmit={async () => ({ ok: true, message: 'Demo settings saved.' })}
        />
      ) : null}
      {tab === 'log' ? <DeliveryLogAdmin kind="email" rows={seedLogs} /> : null}
      {tab === 'database' ? (
        <DatabaseMaintenanceAdmin
          tables={[
            { table: 'email_log', label: 'Email log', prettySize: '12 MB', rows: 18420, retentionDays: 365 },
            { table: 'audit_log', label: 'Audit log', prettySize: '80 MB', rows: 210_004, retentionDays: 730 },
          ]}
          lastRun={{
            ok: true,
            at: now,
            trigger: 'scheduled',
            durationMs: 1820,
            perTable: [
              { table: 'email_log', deleted: 12, retentionDays: 365, analyzed: true },
              { table: 'audit_log', deleted: 0, retentionDays: 730, analyzed: true },
            ],
          }}
          onSave={async () => ({ ok: true, message: 'Demo retention saved.' })}
          onRun={async () => ({ ok: true, message: 'Demo maintenance queued.' })}
        />
      ) : null}
    </div>
  )
}
