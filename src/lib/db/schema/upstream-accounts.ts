import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const upstreamAccounts = pgTable('upstream_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').notNull().default('jms'),
  skuCode: text('sku_code').notNull(),
  rawSubUrl: text('raw_sub_url').notNull(),
  upstreamExpireAt: timestamp('upstream_expire_at', { withTimezone: true }),
  status: text('status', { enum: ['idle', 'assigned', 'expired', 'disabled'] }).notNull().default('idle'),
  assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  assignedAt: timestamp('assigned_at', { withTimezone: true }),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_upstream_accounts_status').on(table.status),
  index('idx_upstream_accounts_sku_code').on(table.skuCode),
]);