import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  activationCodes,
  users,
  subscriptions,
  plans,
  redemptionLogs,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code || typeof code !== "string" || code.trim() === "") {
      return NextResponse.json({ error: "激活码不能为空" }, { status: 400 });
    }

    const trimmedCode = code.trim();

    // 1. Find activation code
    const activationCodeResult = await db
      .select()
      .from(activationCodes)
      .where(eq(activationCodes.code, trimmedCode))
      .limit(1);

    if (activationCodeResult.length === 0) {
      return NextResponse.json({ error: "激活码无效" }, { status: 400 });
    }

    const activationCode = activationCodeResult[0];

    if (activationCode.status === "used") {
      return NextResponse.json({ error: "激活码已被使用" }, { status: 400 });
    }

    if (activationCode.status === "disabled") {
      return NextResponse.json({ error: "激活码已禁用" }, { status: 400 });
    }

    // 2. Get plan info
    const planResult = await db
      .select()
      .from(plans)
      .where(eq(plans.id, activationCode.planId))
      .limit(1);

    if (planResult.length === 0) {
      return NextResponse.json({ error: "关联套餐不存在" }, { status: 500 });
    }

    const plan = planResult[0];

    // 3. Create user
    const userId = randomUUID();
    const email = `user-${userId}@onelink.local`;

    await db.insert(users).values({
      id: userId,
      email,
      status: "active",
    });

    // 4. Create subscription with sub_token
    const subToken = `sub_${randomUUID().replace(/-/g, "")}`;
    const expireAt = new Date(
      Date.now() + plan.periodDays * 24 * 60 * 60 * 1000
    );

    await db.insert(subscriptions).values({
      userId,
      subToken,
      currentPlanId: plan.id,
      expireAt,
      status: "active",
    });

    // 5. Mark activation code as used
    await db
      .update(activationCodes)
      .set({
        status: "used",
        usedByUserId: userId,
        usedAt: new Date(),
      })
      .where(eq(activationCodes.id, activationCode.id));

    // 6. Log redemption
    await db.insert(redemptionLogs).values({
      codeId: activationCode.id,
      userId,
      planId: plan.id,
      redeemedAt: new Date(),
    });

    return NextResponse.json({
      sub_token: subToken,
      expire_at: expireAt.toISOString(),
    });
  } catch (error) {
    console.error("Redeem error:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}