/**
 * 兑换服务 - 处理激活码兑换的核心业务逻辑
 */

import { db } from '../db';
import { activationCodes, users, subscriptions, plans, redemptionLogs, subscriptionEntitlements } from '../db/schema';
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
    // 2. 查询激活码
    const activationCode = await db
      .select()
      .from(activationCodes)
      .where(eq(activationCodes.code, code))
      .limit(1);

    if (activationCode.length === 0) {
      return { success: false, error: 'INVALID_CODE' };
    }

    const ac = activationCode[0];

    // 3. 检查激活码状态
    if (ac.status === 'used') {
      return { success: false, error: 'CODE_ALREADY_USED' };
    }

    if (ac.status === 'disabled') {
      return { success: false, error: 'CODE_DISABLED' };
    }

    // 4. 查询计划信息
    const plan = await db
      .select()
      .from(plans)
      .where(eq(plans.id, ac.planId))
      .limit(1);

    if (plan.length === 0) {
      return { success: false, error: 'SYSTEM_ERROR' };
    }

    const planInfo = plan[0];

    // 5. 查询或创建用户
    let user = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let isNewUser = false;

    if (user.length === 0) {
      // 创建新用户
      const [newUser] = await db
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

    // 6. 检查用户状态
    if (userInfo.status === 'suspended') {
      return { success: false, error: 'USER_SUSPENDED' };
    }

    // 7. 查询或更新订阅
    let subscription = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userInfo.id))
      .limit(1);

    let subscriptionInfo: typeof subscriptions.$inferSelect;

    if (subscription.length === 0) {
      // 创建新订阅
      const expireAt = new Date(Date.now() + planInfo.periodDays * 24 * 60 * 60 * 1000);

      const [newSub] = await db
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
        return { success: false, error: 'SUBSCRIPTION_SUSPENDED' };
      }

      // 计算新的到期时间（基于当前到期时间或现在）
      const baseTime = existingSub.expireAt && existingSub.expireAt > new Date()
        ? existingSub.expireAt
        : new Date();

      const newExpireAt = new Date(baseTime.getTime() + planInfo.periodDays * 24 * 60 * 60 * 1000);

      const [updatedSub] = await db
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

    // 8. 标记激活码已使用
    await db
      .update(activationCodes)
      .set({
        status: 'used',
        usedByUserId: userInfo.id,
        usedAt: new Date(),
      })
      .where(eq(activationCodes.id, ac.id));

    // 9. 记录兑换日志
    await db.insert(redemptionLogs).values({
      userId: userInfo.id,
      codeId: ac.id,
      planId: planInfo.id,
      redeemedAt: new Date(),
    });

    return {
      success: true,
      data: {
        userId: userInfo.id,
        subscriptionId: subscriptionInfo.id,
        planId: planInfo.id,
        planName: planInfo.name,
        expireAt: subscriptionInfo.expireAt!,
        isNewUser,
      },
    };
  } catch (err) {
    // 系统错误
    console.error('Redeem error:', err);
    return { success: false, error: 'SYSTEM_ERROR' };
  }
}