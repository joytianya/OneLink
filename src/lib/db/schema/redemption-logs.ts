import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { activationCodes } from './activation-codes';
import { plans } from './plans';

export const redemptionLogs = pgTable('redemption_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  codeId: uuid('code_id').notNull().references(() => activationCodes.id, { onDelete: 'restrict' }),
  planId: uuid('plan_id').notNull().references(() => plans.id),
  redeemedAt: timestamp('redeemed_at', { withTimezone: true }).notNull().defaultNow(),
  ip: text('ip'),
  userAgent: text('user_agent'),
}, (table) => [
  index('idx_redemption_logs_user_id').on(table.userId),
  index('idx_redemption_logs_code_id').on(table.codeId),
]);