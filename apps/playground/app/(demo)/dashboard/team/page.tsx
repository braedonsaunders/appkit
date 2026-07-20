import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { memberships, roleAssignments, roles, users } from '@appkit/db'
import { can } from '@appkit/tenant'
import {
  Avatar,
  Badge,
  EmptyState,
  FilterChips,
  ListPageLayout,
  Pagination,
  PageHeader,
  SearchInput,
  SortableTh,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  parseListParams,
  pickString,
  type FilterOption,
  type ListSearchParams,
} from '@appkit/ui'
import { Users } from 'lucide-react'
import { getDemoEnvironment } from '../../../../lib/server/demo-context'
import { InviteMemberButton } from './invite-member-button'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Team — appkit' }

const BASE_PATH = '/dashboard/team'
const TEAM_SORTS = ['name', 'email', 'since'] as const
type TeamSort = (typeof TEAM_SORTS)[number]

type TeamRow = {
  id: string
  name: string
  email: string
  roles: string[]
  since: string
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<ListSearchParams>
}) {
  const { ctx } = await getDemoEnvironment()
  const currentParams = await searchParams
  const list = parseListParams(currentParams, {
    sort: 'name',
    dir: 'asc',
    perPage: 10,
    allowedSorts: TEAM_SORTS,
  })
  const roleFilter = pickString(currentParams.role)

  const data = await ctx.db(async (db) => {
    const filters: SQL[] = []
    if (list.q) {
      const escaped = list.q.replace(/[\\%_]/g, '\\$&')
      const pattern = `%${escaped}%`
      filters.push(or(ilike(memberships.displayName, pattern), ilike(users.email, pattern))!)
    }
    if (roleFilter) {
      const matchingRoles = await db
        .select({ membershipId: roleAssignments.membershipId })
        .from(roleAssignments)
        .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
        .where(eq(roles.key, roleFilter))
      const ids = matchingRoles.map((row) => row.membershipId)
      filters.push(ids.length > 0 ? inArray(memberships.id, ids) : sql`false`)
    }
    const where = filters.length > 0 ? and(...filters) : undefined

    const totals = await db
      .select({ value: count() })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(where)

    const direction = list.dir === 'asc' ? asc : desc
    const sortColumn =
      list.sort === 'email'
        ? users.email
        : list.sort === 'since'
          ? memberships.createdAt
          : memberships.displayName
    const members = await db
      .select({
        id: memberships.id,
        name: memberships.displayName,
        email: users.email,
        createdAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(where)
      .orderBy(direction(sortColumn), asc(memberships.id))
      .limit(list.perPage)
      .offset((list.page - 1) * list.perPage)

    const memberIds = members.map((member) => member.id)
    const assignments =
      memberIds.length > 0
        ? await db
            .select({ membershipId: roleAssignments.membershipId, roleName: roles.name })
            .from(roleAssignments)
            .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
            .where(inArray(roleAssignments.membershipId, memberIds))
            .orderBy(asc(roles.name))
        : []
    const roleCounts = await db
      .select({ value: roles.key, label: roles.name, count: count(roleAssignments.membershipId) })
      .from(roles)
      .leftJoin(roleAssignments, eq(roleAssignments.roleId, roles.id))
      .groupBy(roles.id)
      .orderBy(asc(roles.name))

    const rolesByMembership = new Map<string, string[]>()
    for (const assignment of assignments) {
      const names = rolesByMembership.get(assignment.membershipId) ?? []
      names.push(assignment.roleName)
      rolesByMembership.set(assignment.membershipId, names)
    }

    return {
      total: totals[0]?.value ?? 0,
      rows: members.map<TeamRow>((member) => ({
        id: member.id,
        name: member.name,
        email: member.email,
        roles: rolesByMembership.get(member.id) ?? [],
        since: member.createdAt.toISOString().slice(0, 10),
      })),
      roleOptions: roleCounts.map<FilterOption>((role) => ({
        value: role.value,
        label: role.label,
        count: role.count,
      })),
    }
  })

  return (
    <ListPageLayout
      header={
        <>
          <PageHeader
            title="Team"
            description="Live from Postgres, RLS-scoped to your tenant. Search, filters, sorting, and pagination live in the URL."
            actions={can(ctx, 'team.manage') ? <InviteMemberButton /> : undefined}
          />
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput placeholder="Search name or email…" searchLabel="Search team" />
            <FilterChips
              basePath={BASE_PATH}
              currentParams={currentParams}
              paramKey="role"
              label="Role"
              options={data.roleOptions}
            />
          </div>
        </>
      }
    >
      <TeamTable rows={data.rows} currentParams={currentParams} sort={list.sort} dir={list.dir} />
      <Pagination
        basePath={BASE_PATH}
        currentParams={currentParams}
        total={data.total}
        page={list.page}
        perPage={list.perPage}
      />
    </ListPageLayout>
  )
}

function TeamTable({
  rows,
  currentParams,
  sort,
  dir,
}: {
  rows: TeamRow[]
  currentParams: ListSearchParams
  sort: TeamSort
  dir: 'asc' | 'desc'
}) {
  const sortProps = { basePath: BASE_PATH, currentParams, dir }
  return (
    <Table>
      <TableHeader>
        <TableRow noAnimate>
          <SortableTh {...sortProps} column="name" active={sort === 'name'}>
            Member
          </SortableTh>
          <SortableTh {...sortProps} column="email" active={sort === 'email'}>
            Email
          </SortableTh>
          <TableHead>Roles</TableHead>
          <SortableTh {...sortProps} column="since" active={sort === 'since'}>
            Member since
          </SortableTh>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length > 0 ? (
          rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar name={row.name} size={32} />
                  <div className="min-w-0">
                    <div className="truncate font-medium text-fg">{row.name}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-fg-muted">{row.email}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {row.roles.length > 0 ? (
                    row.roles.map((role) => (
                      <Badge key={role} variant={role === 'Admin' ? 'default' : 'secondary'}>
                        {role}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-fg-subtle">—</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-fg-muted tabular-nums">{row.since}</TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow noAnimate>
            <TableCell colSpan={4}>
              <EmptyState
                icon={<Users />}
                title="No members found"
                description="Try a different search or role filter."
                className="border-0 bg-transparent py-10 shadow-none"
              />
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
