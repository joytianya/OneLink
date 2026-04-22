import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { activationCodes } from './activation-codes';
import { plans } from './plans';

export const subscriptionEntitlements = pgTable('subscription_entitlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  codeId: uuid('code_id').notNull().unique().references(() => activationCodes.id, { onDelete: 'restrict' }),
  planId: uuid('plan_id').notNull().references(() => plans.id),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true }).notNull(),
  status: text('status', { enum: ['active', 'expired', 'revoked'] }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_entitlements_user_id').on(table.userId),
  index('idx_entitlements_status').on(table.status),
  index('idx_entitlements_end_at').on(table.endAt),
]);