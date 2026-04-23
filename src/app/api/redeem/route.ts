import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { activationCodes, plans, users, subscriptions } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json({
        success: false,
        error: '请输入激活码',
      }, { status: 400 });
    }

    const trimmedCode = code.trim();

    // 使用事务包裹所有数据库操作，确保原子性
    const result = await db.transaction(async (tx) => {
      // 使用 FOR UPDATE 锁定激活码行，防止并发竞态
      const [lockedCode] = await tx.execute(sql`
        SELECT id, code, plan_id, status, used_by_user_id, used_at, created_at, note, batch_id
        FROM activation_codes
        WHERE code = ${trimmedCode}
        FOR UPDATE
      `);

      if (!lockedCode) {
        return { error: '激活码无效或已失效' };
      }

      // 检查激活码状态（统一错误消息，不泄露具体状态）
      if (lockedCode.status !== 'unused') {
        return { error: '激活码无效或已失效' };
      }

      // 获取关联的计划
      const plan = await tx.query.plans.findFirst({
        where: eq(plans.id, lockedCode.plan_id as string),
      });

      if (!plan) {
        return { error: '激活码无效或已失效' };
      }

      // 创建临时用户
      const tempEmail = `user_${randomUUID()}@temp.onelink.local`;
      const [newUser] = await tx.insert(users).values({
        email: tempEmail,
        status: 'active',
      }).returning();

      // 生成订阅 token 和计算到期时间
      const subToken = randomUUID();
      const expireAt = new Date();
      expireAt.setDate(expireAt.getDate() + plan.periodDays);

      // 创建订阅
      await tx.insert(subscriptions).values({
        userId: newUser.id,
        subToken,
        currentPlanId: plan.id,
        expireAt,
        status: 'active',
      });

      // 更新激活码状态
      await tx.update(activationCodes)
        .set({
          status: 'used',
          usedByUserId: newUser.id,
          usedAt: new Date(),
        })
        .where(eq(activationCodes.id, lockedCode.id as string));

      return {
        success: true,
        sub_token: subToken,
        expire_at: expireAt.toISOString(),
        plan_name: plan.name,
      };
    });

    if (result.error) {
      return NextResponse.json({
        success: false,
        error: result.error,
      }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Redeem API error:', error);
    return NextResponse.json({
      success: false,
      error: '服务器错误，请稍后重试',
    }, { status: 500 });
  }
}