/**
 * 兑换 API 路由
 * POST /api/redeem
 */

import { NextRequest, NextResponse } from 'next/server';
import { executeRedeemWithRateLimit } from '@/lib/rate-limit/redeem';
import { RedeemError } from '@/lib/redeem/service';

// 对外统一的错误响应
const ERROR_RESPONSES: Record<RedeemError | 'RATE_LIMITED' | 'CHALLENGE_REQUIRED', { status: number; message: string }> = {
  // 风控错误
  RATE_LIMITED: {
    status: 429,
    message: '请求过于频繁，请稍后再试',
  },
  CHALLENGE_REQUIRED: {
    status: 403,
    message: '请求存在风险，请完成人机验证后重试',
  },
  // 业务错误（统一收口，不暴露激活码状态）
  INVALID_INPUT: {
    status: 400,
    message: '兑换失败，请核对信息后重试',
  },
  INVALID_CODE: {
    status: 400,
    message: '兑换失败，请核对信息后重试',
  },
  CODE_ALREADY_USED: {
    status: 400,
    message: '兑换失败，请核对信息后重试',
  },
  CODE_DISABLED: {
    status: 400,
    message: '兑换失败，请核对信息后重试',
  },
  NO_UPSTREAM_CAPACITY: {
    status: 503,
    message: '服务暂时不可用，请稍后再试',
  },
  USER_SUSPENDED: {
    status: 403,
    message: '账户已被暂停，请联系客服',
  },
  SUBSCRIPTION_SUSPENDED: {
    status: 403,
    message: '订阅已被暂停，请联系客服',
  },
  SYSTEM_ERROR: {
    status: 500,
    message: '系统错误，请稍后再试',
  },
};

/**
 * 提取客户端 IP
 * 优先使用 Cloudflare 传递的头
 */
function extractClientIP(request: NextRequest): string {
  // Cloudflare 连接 IP
  const cfIP = request.headers.get('cf-connecting-ip');
  if (cfIP) return cfIP;

  // X-Forwarded-For（取第一个）
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const firstIP = xff.split(',')[0].trim();
    return firstIP;
  }

  // X-Real-IP
  const realIP = request.headers.get('x-real-ip');
  if (realIP) return realIP;

  // 回退到未知
  return 'unknown';
}

export async function POST(request: NextRequest) {
  try {
    // 解析请求体
    const body = await request.json();

    const email = body.email?.toString();
    const code = body.code?.toString();
    const turnstileToken = body.turnstileToken?.toString();

    // 基础校验
    if (!email || !code) {
      return NextResponse.json(
        { error: 'INVALID_INPUT', message: ERROR_RESPONSES.INVALID_INPUT.message },
        { status: 400 }
      );
    }

    // 提取客户端信息
    const ip = extractClientIP(request);
    const userAgent = request.headers.get('user-agent') || undefined;

    // 执行带风控的兑换
    const result = await executeRedeemWithRateLimit(ip, email, code, turnstileToken, userAgent);

    // 风控拦截
    if (!result.allowed && result.error) {
      const errorInfo = ERROR_RESPONSES[result.error];
      return NextResponse.json(
        { error: result.error, message: errorInfo.message },
        { status: errorInfo.status }
      );
    }

    // 兑换结果
    if (result.redeemResult?.success && result.redeemResult.data) {
      return NextResponse.json({
        success: true,
        data: {
          planName: result.redeemResult.data.planName,
          subToken: result.redeemResult.data.subToken,
          expireAt: result.redeemResult.data.expireAt.toISOString(),
          isNewUser: result.redeemResult.data.isNewUser,
        },
      });
    }

    // 兑换失败
    if (result.redeemResult?.error) {
      const errorInfo = ERROR_RESPONSES[result.redeemResult.error];
      return NextResponse.json(
        { error: result.redeemResult.error, message: errorInfo.message },
        { status: errorInfo.status }
      );
    }

    // 未预期的结果
    return NextResponse.json(
      { error: 'SYSTEM_ERROR', message: ERROR_RESPONSES.SYSTEM_ERROR.message },
      { status: 500 }
    );
  } catch (err) {
    console.error('Redeem API error:', err);
    return NextResponse.json(
      { error: 'SYSTEM_ERROR', message: ERROR_RESPONSES.SYSTEM_ERROR.message },
      { status: 500 }
    );
  }
}
