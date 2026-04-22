import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { plans } from './plans';
import { upstreamAccounts } from './upstream-accounts';

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  subToken: text('sub_token').notNull().unique(),
  currentPlanId: uuid('current_plan_id').references(() => plans.id),
  currentUpstreamAccountId: uuid('current_upstream_account_id').references(() => upstreamAccounts.id, { onDelete: 'set null' }),
  nextUpstreamAccountId: uuid('next_upstream_account_id').references(() => upstreamAccounts.id, { onDelete: 'set null' }),
  expireAt: timestamp('expire_at', { withTimezone: true }),
  status: text('status', { enum: ['active', 'expired', 'suspended'] }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_subscriptions_sub_token').on(table.subToken),
  index('idx_subscriptions_status').on(table.status),
  index('idx_subscriptions_expire_at').on(table.expireAt),
]);