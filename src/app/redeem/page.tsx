"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RedeemSuccess {
  sub_token: string;
  expire_at: string;
}

interface RedeemError {
  error: string;
}

export default function RedeemPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RedeemSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data: RedeemSuccess | RedeemError = await res.json();

      if (!res.ok) {
        setError((data as RedeemError).error || "兑换失败");
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
          输入您的激活码以获取订阅链接
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="text"
            placeholder="请输入激活码"
            value={code}
            onChange={(e) => setCode(e.target.value.trim())}
            disabled={loading}
            required
          />
          <Button type="submit" disabled={loading || !code} className="w-full">
            {loading ? "兑换中..." : "兑换"}
          </Button>
        </form>

        {result && (
          <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950 space-y-2">
            <p className="text-green-700 dark:text-green-300 font-medium">
              兑换成功！
            </p>
            <p className="text-sm">
              <span className="font-medium">订阅链接：</span>
              <br />
              <code className="text-xs bg-green-100 dark:bg-green-900 p-1 rounded block mt-1">
                {result.sub_token}
              </code>
            </p>
            <p className="text-sm">
              <span className="font-medium">到期时间：</span>
              {new Date(result.expire_at).toLocaleString("zh-CN")}
            </p>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950">
            <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
          </div>
        )}
      </div>
    </main>
  );
}