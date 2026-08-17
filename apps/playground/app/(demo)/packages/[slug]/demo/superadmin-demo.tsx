'use client'

import * as React from 'react'
import type { PlatformUserRecord } from '@braedonsaunders/superadmin'
import {
  PlatformUsersAdmin,
  type PlatformUsersActions,
} from '@braedonsaunders/superadmin/react'

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

export function SuperadminDemo() {
  const [users, setUsers] = React.useState(seedUsers)

  const actions = React.useMemo<PlatformUsersActions>(() => ({
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

  return (
    <PlatformUsersAdmin
      users={users}
      currentUserId="operator"
      tenants={demoTenants}
      defaultTenantId="workspace-main"
      actions={actions}
      title="Platform users"
      description="A live package demo of installation-wide identity administration."
    />
  )
}
