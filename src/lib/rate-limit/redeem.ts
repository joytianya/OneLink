/**
 * 兑换限流编排
 * 整合风控预检、Turnstile 校验、结果回写
 */

import {
  evaluateRisk,
  performTurnstileChallenge,
  recordAttempt,
  clearRiskState,
  RiskEvaluation,
} from '../security/redeem-risk-service';
import { executeRedeem, RedeemResult, RedeemError } from '../redeem/service';

// 统一的对外错误码
export type RateLimitError = 'RATE_LIMITED' | 'CHALLENGE_REQUIRED';

// 限流编排结果
export interface RateLimitResult {
  allowed: boolean;
  error?: RateLimitError;
  redeemResult?: RedeemResult;
}

/**
 * 攻击面相关错误 - 需计入风控失败
 */
const ATTACK_SURFACE_ERRORS: RedeemError[] = ['INVALID_INPUT', 'INVALID_CODE', 'CODE_ALREADY_USED'];

/**
 * 非攻击面错误 - 不计入风控失败
 */
const NON_ATTACK_ERRORS: RedeemError[] = [
  'NO_UPSTREAM_CAPACITY',
  'USER_SUSPENDED',
  'SUBSCRIPTION_SUSPENDED',
  'SYSTEM_ERROR',
  'CODE_DISABLED',
];

/**
 * 执行带风控的兑换流程
 * @param ip - 客户端 IP
 * @param email - 用户邮箱
 * @param code - 激活码
 * @param turnstileToken - Turnstile token（可选）
 * @param userAgent - User Agent
 */
export async function executeRedeemWithRateLimit(
  ip: string,
  email: string,
  code: string,
  turnstileToken?: string,
  userAgent?: string
): Promise<RateLimitResult> {
  // 1. 风控预检
  const riskEval: RiskEvaluation = await evaluateRisk(ip, email);

  // 2. 硬限流直接拦截
  if (riskEval.decision === 'BLOCKED') {
    await recordAttempt(ip, email, 'blocked', riskEval.reason, userAgent, false, false);
    return {
      allowed: false,
      error: 'RATE_LIMITED',
    };
  }

  // 3. 软阈值需要 Turnstile 挑战
  if (riskEval.decision === 'CHALLENGE') {
    const turnstileResult = await performTurnstileChallenge(turnstileToken, ip);

    if (!turnstileResult.success) {
      await recordAttempt(
        ip,
        email,
        'challenge_failed',
        turnstileResult.error,
        userAgent,
        true,
        false
      );
      return {
        allowed: false,
        error: 'CHALLENGE_REQUIRED',
      };
    }

    // Turnstile 通过，继续执行兑换
    await recordAttempt(ip, email, 'challenge_required', 'Turnstile passed', userAgent, true, true);
  }

  // 4. 执行兑换事务
  const redeemResult = await executeRedeem({ email, code });

  // 5. 结果回写风控状态
  if (redeemResult.success) {
    // 成功：清理风控状态
    await clearRiskState(ip, email);
  } else if (redeemResult.error && ATTACK_SURFACE_ERRORS.includes(redeemResult.error)) {
    // 攻击面失败：计入风控
    await recordAttempt(ip, email, 'business_failed', redeemResult.error, userAgent, false, false);
  }
  // 非攻击面错误不计入风控

  return {
    allowed: true,
    redeemResult,
  };
}

/**
 * 判断兑换错误是否属于攻击面
 */
export function isAttackSurfaceError(error: RedeemError): boolean {
  return ATTACK_SURFACE_ERRORS.includes(error);
}