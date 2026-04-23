/**
 * 兑换服务 - 处理激活码兑换的核心业务逻辑
 * 使用事务确保操作原子性
 */

import { db } from '../db';
import { activationCodes, users, subscriptions, plans, redemptionLogs } from '../db/schema';
import { eq, and } from 'drizzle-orm';

// 兑换请求
export interface RedeemRequest {
  email: string;
  code: string;
}

// 兑换结果
export interface RedeemResult {
  success: boolean;
  error?: RedeemError;
  data?: {
    userId: string;
    subscriptionId: string;
    planId: string;
    planName: string;
    expireAt: Date;
    isNewUser: boolean;
  };
}

// 兑换错误类型
export type RedeemError =
  | 'INVALID_INPUT'
  | 'INVALID_CODE'
  | 'CODE_ALREADY_USED'
  | 'CODE_DISABLED'
  | 'NO_UPSTREAM_CAPACITY'
  | 'USER_SUSPENDED'
  | 'SUBSCRIPTION_SUSPENDED'
  | 'SYSTEM_ERROR';

/**
 * 执行兑换事务
 * @param request - 兑换请求
 * @returns 兑换结果
 */
export async function executeRedeem(request: RedeemRequest): Promise<RedeemResult> {
  // 1. 输入校验
  const email = request.email?.trim().toLowerCase();
  const code = request.code?.trim();

  if (!email || !email.includes('@')) {
    return { success: false, error: 'INVALID_INPUT' };
  }

  if (!code || code.length < 6) {
    return { success: false, error: 'INVALID_INPUT' };
  }

  try {
    // 2. 使用事务确保操作原子性
    const result = await db.transaction(async (tx) => {
      // 2.1 查询激活码（在事务内锁定）
      const activationCode = await tx
        .select()
        .from(activationCodes)
        .where(eq(activationCodes.code, code))
        .limit(1);

      if (activationCode.length === 0) {
        throw new Error('INVALID_CODE');
      }

      const ac = activationCode[0];

      // 2.2 检查激活码状态
      if (ac.status === 'used') {
        throw new Error('CODE_ALREADY_USED');
      }

      if (ac.status === 'disabled') {
        throw new Error('CODE_DISABLED');
      }

      // 2.3 查询计划信息
      const plan = await tx
        .select()
        .from(plans)
        .where(eq(plans.id, ac.planId))
        .limit(1);

      if (plan.length === 0) {
        throw new Error('SYSTEM_ERROR');
      }

      const planInfo = plan[0];

      // 2.4 查询或创建用户
      let user = await tx
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      let isNewUser = false;

      if (user.length === 0) {
        // 创建新用户
        const [newUser] = await tx
          .insert(users)
          .values({
            email,
            status: 'active',
          })
          .returning();

        user = [newUser];
        isNewUser = true;
      }

      const userInfo = user[0];

      // 2.5 检查用户状态
      if (userInfo.status === 'suspended') {
        throw new Error('USER_SUSPENDED');
      }

      // 2.6 查询或更新订阅
      const subscription = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userInfo.id))
        .limit(1);

      let subscriptionInfo: typeof subscriptions.$inferSelect;

      if (subscription.length === 0) {
        // 创建新订阅
        const expireAt = new Date(Date.now() + planInfo.periodDays * 24 * 60 * 60 * 1000);

        const [newSub] = await tx
          .insert(subscriptions)
          .values({
            userId: userInfo.id,
            subToken: `sub_${userInfo.id}_${Date.now()}`,
            currentPlanId: planInfo.id,
            expireAt,
            status: 'active',
          })
          .returning();

        subscriptionInfo = newSub;
      } else {
        // 续期现有订阅
        const existingSub = subscription[0];

        if (existingSub.status === 'suspended') {
          throw new Error('SUBSCRIPTION_SUSPENDED');
        }

        // 计算新的到期时间（基于当前到期时间或现在）
        const baseTime = existingSub.expireAt && existingSub.expireAt > new Date()
          ? existingSub.expireAt
          : new Date();

        const newExpireAt = new Date(baseTime.getTime() + planInfo.periodDays * 24 * 60 * 60 * 1000);

        const [updatedSub] = await tx
          .update(subscriptions)
          .set({
            currentPlanId: planInfo.id,
            expireAt: newExpireAt,
            status: 'active',
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.id, existingSub.id))
          .returning();

        subscriptionInfo = updatedSub;
      }

      // 2.7 标记激活码已使用（乐观锁：仅当 status 为 unused 时才更新）
      const updatedCodes = await tx
        .update(activationCodes)
        .set({
          status: 'used',
          usedByUserId: userInfo.id,
          usedAt: new Date(),
        })
        .where(and(
          eq(activationCodes.id, ac.id),
          eq(activationCodes.status, 'unused')
        ))
        .returning();

      // 乐观锁检查：如果更新失败，说明激活码已被其他事务使用
      if (updatedCodes.length === 0) {
        throw new Error('CODE_ALREADY_USED');
      }

      // 2.8 记录兑换日志
      await tx.insert(redemptionLogs).values({
        userId: userInfo.id,
        codeId: ac.id,
        planId: planInfo.id,
        redeemedAt: new Date(),
      });

      return {
        userId: userInfo.id,
        subscriptionId: subscriptionInfo.id,
        planId: planInfo.id,
        planName: planInfo.name,
        expireAt: subscriptionInfo.expireAt!,
        isNewUser,
      };
    });

    return { success: true, data: result };
  } catch (err) {
    // 业务错误
    if (err instanceof Error) {
      const businessErrors = ['INVALID_CODE', 'CODE_ALREADY_USED', 'CODE_DISABLED', 'USER_SUSPENDED', 'SUBSCRIPTION_SUSPENDED'];
      if (businessErrors.includes(err.message)) {
        return { success: false, error: err.message as RedeemError };
      }
    }

    // 系统错误
    console.error('Redeem error:', err);
    return { success: false, error: 'SYSTEM_ERROR' };
  }
}
