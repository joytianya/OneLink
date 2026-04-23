import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, subscriptions, subscriptionEntitlements, redemptionLogs } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// Raw SQL 返回 snake_case 字段名，定义专门的类型接口
interface RawActivationCode {
  id: string;
  code: string;
  batch_id: string | null;
  plan_id: string;
  status: string;
  used_by_user_id: string | null;
  used_at: Date | null;
  created_at: Date;
  note: string | null;
}

interface RawPlan {
  id: string;
  code: string;
  name: string;
  period_days: number;
  priority: number;
  active: boolean;
  created_at: Date;
}

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

    // 获取客户端信息用于审计
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // 使用事务确保操作原子性
    const result = await db.transaction(async (tx) => {
      // 1. 使用 FOR UPDATE 锁定激活码行，防止并发重复兑换
      const activationCodeResult = await tx.execute(
        sql`SELECT * FROM activation_codes WHERE code = ${code} FOR UPDATE`
      );

      if (activationCodeResult.length === 0) {
        throw new Error('ACTIVATION_CODE_NOT_FOUND');
      }

      const ac = activationCodeResult[0] as unknown as RawActivationCode;

      if (ac.status !== 'unused') {
        throw new Error('ACTIVATION_CODE_USED_OR_DISABLED');
      }

      // 2. 获取关联的 plan 信息并检查 active 状态
      const planResult = await tx.execute(
        sql`SELECT * FROM plans WHERE id = ${ac.plan_id} FOR UPDATE`
      );

      if (planResult.length === 0) {
        throw new Error('PLAN_NOT_FOUND');
      }

      const p = planResult[0] as unknown as RawPlan;

      if (!p.active) {
        throw new Error('PLAN_NOT_ACTIVE');
      }

      // 3. 创建临时用户
      const tempEmail = `temp-${randomUUID()}@redeem.local`;
      const newUser = await tx.insert(users).values({
        email: tempEmail,
        status: 'active',
      }).returning();

      // 4. 使用 UTC 时间计算 expire_at
      const now = new Date();
      const expireAt = new Date(now.getTime() + p.period_days * 24 * 60 * 60 * 1000);

      // 5. 生成 sub_token
      const subToken = randomUUID();

      // 6. 创建订阅记录
      await tx.insert(subscriptions).values({
        userId: newUser[0].id,
        subToken,
        currentPlanId: ac.plan_id,
        expireAt,
        status: 'active',
      });

      // 7. 写入权益表（codeId UNIQUE 约束提供数据库层面的防重复）
      await tx.insert(subscriptionEntitlements).values({
        userId: newUser[0].id,
        codeId: ac.id,
        planId: ac.plan_id,
        startAt: now,
        endAt: expireAt,
        status: 'active',
      });

      // 8. 写入审计日志
      await tx.insert(redemptionLogs).values({
        userId: newUser[0].id,
        codeId: ac.id,
        planId: ac.plan_id,
        ip: clientIp,
        userAgent,
      });

      // 9. 更新激活码状态为 used
      await tx.execute(
        sql`UPDATE activation_codes SET status = 'used', used_by_user_id = ${newUser[0].id}, used_at = ${now} WHERE id = ${ac.id}`
      );

      return { subToken, expireAt };
    });

    return NextResponse.json({
      success: true,
      sub_token: result.subToken,
      expire_at: result.expireAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof Error) {
      switch (error.message) {
        case 'ACTIVATION_CODE_NOT_FOUND':
          return NextResponse.json(
            { success: false, error: '激活码不存在' },
            { status: 400 }
          );
        case 'ACTIVATION_CODE_USED_OR_DISABLED':
          return NextResponse.json(
            { success: false, error: '激活码已被使用或已禁用' },
            { status: 400 }
          );
        case 'PLAN_NOT_FOUND':
          return NextResponse.json(
            { success: false, error: '激活码关联的套餐不存在' },
            { status: 500 }
          );
        case 'PLAN_NOT_ACTIVE':
          return NextResponse.json(
            { success: false, error: '激活码关联的套餐已停售' },
            { status: 400 }
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