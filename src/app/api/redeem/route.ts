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
      return NextResponse.json({
        success: false,
        error: '请输入激活码',
      }, { status: 400 });
    }

    // 查找激活码
    const activationCode = await db.query.activationCodes.findFirst({
      where: eq(activationCodes.code, code.trim()),
    });

    if (!activationCode) {
      return NextResponse.json({
        success: false,
        error: '激活码不存在',
      }, { status: 404 });
    }

    // 检查激活码状态
    if (activationCode.status === 'used') {
      return NextResponse.json({
        success: false,
        error: '激活码已被使用',
      }, { status: 400 });
    }

    if (activationCode.status === 'disabled') {
      return NextResponse.json({
        success: false,
        error: '激活码已失效',
      }, { status: 400 });
    }

    // 获取关联的计划
    const plan = await db.query.plans.findFirst({
      where: eq(plans.id, activationCode.planId),
    });

    if (!plan) {
      return NextResponse.json({
        success: false,
        error: '关联计划不存在',
      }, { status: 500 });
    }

    // 创建临时用户（使用 UUID 作为邮箱）
    const tempEmail = `user_${randomUUID()}@temp.onelink.local`;
    const [newUser] = await db.insert(users).values({
      email: tempEmail,
      status: 'active',
    }).returning();

    // 生成订阅 token
    const subToken = randomUUID();
    const expireAt = new Date();
    expireAt.setDate(expireAt.getDate() + plan.periodDays);

    // 创建订阅
    await db.insert(subscriptions).values({
      userId: newUser.id,
      subToken,
      currentPlanId: plan.id,
      expireAt,
      status: 'active',
    });

    // 更新激活码状态
    await db.update(activationCodes)
      .set({
        status: 'used',
        usedByUserId: newUser.id,
        usedAt: new Date(),
      })
      .where(eq(activationCodes.id, activationCode.id));

    return NextResponse.json({
      success: true,
      sub_token: subToken,
      expire_at: expireAt.toISOString(),
      plan_name: plan.name,
    });
  } catch (error) {
    console.error('Redeem API error:', error);
    return NextResponse.json({
      success: false,
      error: '服务器错误，请稍后重试',
    }, { status: 500 });
  }
}