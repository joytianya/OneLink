import { pgTable, uuid, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';

/**
 * 风控尝试表 - 记录兑换失败、校验失败、阻断、成功结果
 * 与 redemption_logs 分层：本表记录所有尝试，redemption_logs 只记录成功兑换
 */
export const redeemRiskAttempts = pgTable('redeem_risk_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  // HMAC-SHA256 哈希后的标识符，避免存储明文敏感信息
  ipHash: text('ip_hash'),
  emailHash: text('email_hash'),
  // 结果类型
  outcome: text('outcome', {
    enum: ['success', 'business_failed', 'challenge_required', 'challenge_failed', 'blocked', 'invalid_input']
  }).notNull(),
  // 具体失败原因（内部记录，不对外暴露）
  reason: text('reason'),
  // 是否需要 Turnstile 挑战
  turnstileRequired: boolean('turnstile_required').notNull().default(false),
  // Turnstile 是否通过
  turnstilePassed: boolean('turnstile_passed').notNull().default(false),
  // User Agent 信息
  userAgent: text('user_agent'),
  // 创建时间
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // IP 维度查询索引
  index('idx_redeem_risk_attempts_ip_hash').on(table.ipHash),
  // 邮箱维度查询索引
  index('idx_redeem_risk_attempts_email_hash').on(table.emailHash),
  // 时间窗口查询索引
  index('idx_redeem_risk_attempts_created_at').on(table.createdAt),
  // 组合索引：按 outcome 过滤
  index('idx_redeem_risk_attempts_outcome').on(table.outcome),
]);