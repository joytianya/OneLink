/**
 * 兑换风控服务
 * 实现双阈值策略：
 * - 邮箱维度：3次/15min → Turnstile，6次/60min → 30min block
 * - IP 维度：8次/15min → Turnstile，20次/60min → 30min block
 */

import { db } from '../db';
import { redeemRiskAttempts } from '../db/schema/redeem-risk-attempts';
import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import { createHmac } from 'crypto';
import { verifyTurnstile, TurnstileVerifyResult } from './turnstile';

// HMAC 密钥配置
export function getRateLimitHmacKey(): string {
  return process.env.RATE_LIMIT_HMAC_KEY || 'default-hmac-key-change-in-production';
}

// 阈值策略配置
export const RATE_LIMIT_POLICY = {
  // 邮箱维度阈值
  email: {
    softThreshold: 3, // 触发 Turnstile 挑战
    softWindowMinutes: 15,
    hardThreshold: 6, // 触发硬限流
    hardWindowMinutes: 60,
    blockMinutes: 30, // 限流时长
  },
  // IP 维度阈值
  ip: {
    softThreshold: 8,
    softWindowMinutes: 15,
    hardThreshold: 20,
    hardWindowMinutes: 60,
    blockMinutes: 30,
  },
};

// 风控判定结果
export interface RiskEvaluation {
  decision: 'ALLOW' | 'CHALLENGE' | 'BLOCKED';
  reason?: string;
  shouldRecordBlock?: boolean;
}

// HMAC-SHA256 哈希
export function hmacHash(value: string): string {
  return createHmac('sha256', getRateLimitHmacKey())
    .update(value)
    .digest('hex');
}

// 规范化邮箱
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * 查询指定维度和时间窗口内的失败计数
 * @param bucketType - 维度类型 'ip' 或 'email'
 * @param bucketHash - 维度哈希值
 * @param windowMinutes - 时间窗口（分钟）
 * @returns 失败次数
 */
async function getFailCount(
  bucketType: 'ip' | 'email',
  bucketHash: string,
  windowMinutes: number
): Promise<number> {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  const hashColumn = bucketType === 'ip' ? redeemRiskAttempts.ipHash : redeemRiskAttempts.emailHash;

  // 只统计攻击面相关的失败：business_failed, invalid_input, challenge_failed
  const attackOutcomes = ['business_failed', 'invalid_input', 'challenge_failed'];

  const result = await db
    .select({ count: count() })
    .from(redeemRiskAttempts)
    .where(
      and(
        eq(hashColumn, bucketHash),
        sql`${redeemRiskAttempts.outcome} IN (${attackOutcomes.map(o => `'${o}'`).join(',')})`,
        gte(redeemRiskAttempts.createdAt, windowStart)
      )
    );

  return result[0]?.count || 0;
}

/**
 * 检查是否处于硬限流状态
 * @param bucketType - 维度类型 'ip' 或 'email'
 * @param bucketHash - 维度哈希值
 * @param blockMinutes - 限流时长（分钟）
 * @returns 是否处于限流中
 */
async function isBlocked(bucketType: 'ip' | 'email', bucketHash: string, blockMinutes: number): Promise<boolean> {
  // 检查最近是否有 blocked 状态记录
  const blockStart = new Date(Date.now() - blockMinutes * 60 * 1000);

  const hashColumn = bucketType === 'ip' ? redeemRiskAttempts.ipHash : redeemRiskAttempts.emailHash;

  const result = await db
    .select()
    .from(redeemRiskAttempts)
    .where(
      and(
        eq(hashColumn, bucketHash),
        eq(redeemRiskAttempts.outcome, 'blocked'),
        gte(redeemRiskAttempts.createdAt, blockStart)
      )
    )
    .limit(1)
    .orderBy(desc(redeemRiskAttempts.createdAt));

  return result.length > 0;
}

/**
 * 风控评估：根据 IP 和邮箱判断是否允许、需要挑战、或阻断
 * @param ip - 客户端 IP
 * @param email - 用户邮箱
 * @returns 风控判定结果
 */
export async function evaluateRisk(ip: string, email: string): Promise<RiskEvaluation> {
  const ipHash = hmacHash(ip);
  const emailHash = hmacHash(normalizeEmail(email));

  // 1. 检查现有封禁状态
  const ipBlocked = await isBlocked('ip', ipHash, RATE_LIMIT_POLICY.ip.blockMinutes);
  if (ipBlocked) {
    return { decision: 'BLOCKED', reason: 'IP block is active', shouldRecordBlock: false };
  }

  const emailBlocked = await isBlocked('email', emailHash, RATE_LIMIT_POLICY.email.blockMinutes);
  if (emailBlocked) {
    return { decision: 'BLOCKED', reason: 'Email block is active', shouldRecordBlock: false };
  }

  // 2. 硬阈值命中时立即阻断，由调用方落一条 blocked 记录
  const ipHardCount = await getFailCount('ip', ipHash, RATE_LIMIT_POLICY.ip.hardWindowMinutes);
  if (ipHardCount >= RATE_LIMIT_POLICY.ip.hardThreshold) {
    return { decision: 'BLOCKED', reason: 'IP hard threshold exceeded', shouldRecordBlock: true };
  }

  // 3. 硬阈值命中时立即阻断，由调用方落一条 blocked 记录
  const emailHardCount = await getFailCount('email', emailHash, RATE_LIMIT_POLICY.email.hardWindowMinutes);
  if (emailHardCount >= RATE_LIMIT_POLICY.email.hardThreshold) {
    return { decision: 'BLOCKED', reason: 'Email hard threshold exceeded', shouldRecordBlock: true };
  }

  // 4. 检查是否需要 Turnstile 挑战
  const ipSoftCount = await getFailCount('ip', ipHash, RATE_LIMIT_POLICY.ip.softWindowMinutes);
  const emailSoftCount = await getFailCount('email', emailHash, RATE_LIMIT_POLICY.email.softWindowMinutes);

  if (ipSoftCount >= RATE_LIMIT_POLICY.ip.softThreshold || emailSoftCount >= RATE_LIMIT_POLICY.email.softThreshold) {
    return { decision: 'CHALLENGE', reason: 'Threshold exceeded' };
  }

  return { decision: 'ALLOW' };
}

/**
 * 执行 Turnstile 校验
 * @param token - 客户端提交的 token
 * @param ip - 客户端 IP
 */
export async function performTurnstileChallenge(
  token: string | undefined | null,
  ip: string
): Promise<TurnstileVerifyResult> {
  if (!token) {
    return {
      success: false,
      error: 'Token is required',
    };
  }

  return verifyTurnstile(token, ip);
}

/**
 * 记录风控尝试
 */
export type AttemptOutcome = 'success' | 'business_failed' | 'challenge_required' | 'challenge_failed' | 'blocked' | 'invalid_input';

export async function recordAttempt(
  ip: string,
  email: string,
  outcome: AttemptOutcome,
  reason?: string,
  userAgent?: string,
  turnstileRequired = false,
  turnstilePassed = false
): Promise<void> {
  const ipHash = hmacHash(ip);
  const emailHash = hmacHash(normalizeEmail(email));

  await db.insert(redeemRiskAttempts).values({
    ipHash,
    emailHash,
    outcome,
    reason,
    turnstileRequired,
    turnstilePassed,
    userAgent,
  });
}

/**
 * 成功兑换后清理风控状态（重置计数窗口）
 * 注意：不删除历史记录，只标记为 success
 */
export async function clearRiskState(ip: string, email: string): Promise<void> {
  // 记录成功，作为未来判定的参考
  await recordAttempt(ip, email, 'success', 'Redemption successful', undefined, false, false);
}
