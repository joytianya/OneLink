'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function RedeemPage() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    sub_token?: string;
    expire_at?: string;
    plan_name?: string;
    error?: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();
      setResult(data);
    } catch {
      setResult({ success: false, error: '网络错误，请稍后重试' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">激活码兑换</h1>
          <p className="text-gray-600 mt-2">输入您的激活码获取订阅</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="code" className="block text-sm font-medium mb-2">
              激活码
            </label>
            <Input
              id="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="请输入激活码"
              disabled={loading}
              required
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={loading || !code.trim()}
          >
            {loading ? '处理中...' : '兑换'}
          </Button>
        </form>

        {result && (
          <div
            className={`p-4 rounded-lg ${
              result.success
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}
          >
            {result.success ? (
              <div className="space-y-3">
                <p className="text-green-700 font-medium">兑换成功！</p>
                {result.plan_name && (
                  <p className="text-sm text-gray-600">
                    订阅计划：{result.plan_name}
                  </p>
                )}
                <div className="space-y-2">
                  <p className="text-sm font-medium">订阅 Token：</p>
                  <p className="text-sm bg-white p-2 rounded border break-all">
                    {result.sub_token}
                  </p>
                </div>
                {result.expire_at && (
                  <p className="text-sm text-gray-600">
                    有效期至：{new Date(result.expire_at).toLocaleDateString('zh-CN')}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-red-700">{result.error}</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}