import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  role: text('role', { enum: ['admin', 'super_admin'] }).notNull().default('admin'),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  totpSecret: text('totp_secret'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});