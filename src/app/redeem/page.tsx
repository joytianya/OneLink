"use client";

import { useState } from "react";
import { Turnstile } from "next-turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RedeemSuccess {
  success: true;
  data: {
    planName: string;
    subToken: string;
    expireAt: string;
    isNewUser: boolean;
  };
}

interface RedeemError {
  error: string;
  message: string;
}

export default function RedeemPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RedeemSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [challengeRequired, setChallengeRequired] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setChallengeRequired(false);

    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, turnstileToken }),
      });

      const data: RedeemSuccess | RedeemError = await res.json();

      if (!res.ok) {
        const errorData = data as RedeemError;
        setError(errorData.message || "兑换失败");
        // Check if challenge required - need to refresh Turnstile
        if (errorData.error === "CHALLENGE_REQUIRED") {
          setChallengeRequired(true);
          setTurnstileToken(null);
        }
      } else {
        setResult(data as RedeemSuccess);
      }
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-bold text-center">激活码兑换</h1>
        <p className="text-sm text-muted-foreground text-center">
          输入邮箱和激活码以获取订阅
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">邮箱</label>
            <Input
              type="email"
              placeholder="请输入邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
              disabled={loading}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">激活码</label>
            <Input
              type="text"
              placeholder="请输入激活码"
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              disabled={loading}
              required
            />
          </div>

          {/* Turnstile Widget */}
          <div className="flex justify-center">
            <Turnstile
              siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""}
              onVerify={(token: string) => {
                setTurnstileToken(token);
                setChallengeRequired(false);
              }}
              onError={() => {
                setTurnstileToken(null);
                setError("人机验证失败，请重试");
              }}
              onExpire={() => {
                setTurnstileToken(null);
              }}
              theme="light"
              size="normal"
            />
          </div>

          <Button
            type="submit"
            disabled={loading || !email || !code}
            className="w-full"
          >
            {loading ? "兑换中..." : "兑换"}
          </Button>
        </form>

        {result && (
          <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950 space-y-2">
            <p className="text-green-700 dark:text-green-300 font-medium">
              兑换成功！
            </p>
            <p className="text-sm">
              <span className="font-medium">套餐：</span>
              {result.data.planName}
            </p>
            <div className="space-y-2">
              <span className="text-sm font-medium">订阅链接 / Token：</span>
              <Input
                readOnly
                value={result.data.subToken}
                className="font-mono text-xs"
              />
              {(result.data.subToken.startsWith("http://") ||
                result.data.subToken.startsWith("https://")) && (
                <a
                  href={result.data.subToken}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 underline-offset-2 hover:underline"
                >
                  打开订阅链接
                </a>
              )}
            </div>
            <p className="text-sm">
              <span className="font-medium">到期时间：</span>
              {new Date(result.data.expireAt).toLocaleString("zh-CN")}
            </p>
            {result.data.isNewUser && (
              <p className="text-sm text-green-600 dark:text-green-400">
                新用户注册成功！
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950 space-y-2">
            <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
            {challengeRequired && (
              <p className="text-xs text-red-600 dark:text-red-400">
                请完成上方人机验证后重试
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
