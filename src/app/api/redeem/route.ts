import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { activationCodes, plans, users, subscriptions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { success: false, error: '激活码不能为空' },
        { status: 400 }
      );
    }

    // 使用事务确保操作原子性
    const result = await db.transaction(async (tx) => {
      // 1. 验证激活码存在且状态为 unused（在事务内锁定）
      const activationCode = await tx
        .select()
        .from(activationCodes)
        .where(eq(activationCodes.code, code))
        .limit(1);

      if (activationCode.length === 0) {
        throw new Error('ACTIVATION_CODE_NOT_FOUND');
      }

      const ac = activationCode[0];

      if (ac.status !== 'unused') {
        throw new Error('ACTIVATION_CODE_USED_OR_DISABLED');
      }

      // 2. 获取关联的 plan 信息
      const plan = await tx
        .select()
        .from(plans)
        .where(eq(plans.id, ac.planId))
        .limit(1);

      if (plan.length === 0) {
        throw new Error('PLAN_NOT_FOUND');
      }

      const p = plan[0];

      // 3. 创建临时用户（使用生成的临时邮箱）
      const tempEmail = `temp-${randomUUID()}@redeem.local`;
      const newUser = await tx.insert(users).values({
        email: tempEmail,
        status: 'active',
      }).returning();

      // 4. 生成 sub_token 并计算 expire_at
      const subToken = randomUUID();
      const expireAt = new Date();
      expireAt.setDate(expireAt.getDate() + p.periodDays);

      // 5. 创建订阅记录
      await tx.insert(subscriptions).values({
        userId: newUser[0].id,
        subToken,
        currentPlanId: ac.planId,
        expireAt,
        status: 'active',
      });

      // 6. 更新激活码状态为 used
      await tx.update(activationCodes)
        .set({
          status: 'used',
          usedByUserId: newUser[0].id,
          usedAt: new Date(),
        })
        .where(eq(activationCodes.id, ac.id));

      return { subToken, expireAt };
    });

    // 7. 返回订阅信息
    return NextResponse.json({
      success: true,
      sub_token: result.subToken,
      expire_at: result.expireAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'ACTIVATION_CODE_NOT_FOUND') {
        return NextResponse.json(
          { success: false, error: '激活码不存在' },
          { status: 400 }
        );
      }
      if (error.message === 'ACTIVATION_CODE_USED_OR_DISABLED') {
        return NextResponse.json(
          { success: false, error: '激活码已被使用或已禁用' },
          { status: 400 }
        );
      }
      if (error.message === 'PLAN_NOT_FOUND') {
        return NextResponse.json(
          { success: false, error: '激活码关联的套餐不存在' },
          { status: 500 }
        );
      }
    }
    console.error('Redemption error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}