import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';

export const activationCodeBatches = pgTable('activation_code_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  batchNo: text('batch_no').notNull().unique(),
  channelTag: text('channel_tag').notNull(),
  prefix: text('prefix').notNull(),
  note: text('note'),
  totalCount: integer('total_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});