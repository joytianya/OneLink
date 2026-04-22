import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { activationCodeBatches } from './activation-code-batches';
import { plans } from './plans';
import { users } from './users';

export const activationCodes = pgTable('activation_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  batchId: uuid('batch_id').references(() => activationCodeBatches.id, { onDelete: 'set null' }),
  planId: uuid('plan_id').notNull().references(() => plans.id),
  status: text('status', { enum: ['unused', 'used', 'disabled'] }).notNull().default('unused'),
  usedByUserId: uuid('used_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  note: text('note'),
}, (table) => [
  index('idx_activation_codes_status').on(table.status),
  index('idx_activation_codes_batch_id').on(table.batchId),
]);