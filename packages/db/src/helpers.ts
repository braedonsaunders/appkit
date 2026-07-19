import { sql } from 'drizzle-orm'
import { numeric, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/** Primary key. `gen_random_uuid()` is built-in (pgcrypto); swap the default for
 *  a `uuid_generate_v7()` function if you want time-ordered, index-friendly ids. */
export const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`)

/** Every tenant-owned row carries this; RLS policies key off it. */
export const tenantRef = () => uuid('tenant_id').notNull()

/** Money in a currency. 4 decimals covers all ISO minor units. */
export const money = (name: string) => numeric(name, { precision: 19, scale: 4 })

/** FX rates need more precision than money. */
export const fxRate = (name: string) => numeric(name, { precision: 19, scale: 10 })

/** ISO 4217 alpha code, e.g. 'CAD'. */
export const currencyCode = (name = 'currency_code') => text(name)

/** Standard created/updated audit columns. */
export const auditColumns = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
}
