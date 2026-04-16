'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Leaf, Loader2, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (data.success) {
        router.replace('/');
        router.refresh();
      } else {
        setError('Incorrect password. Please try again.');
        setPassword('');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">

        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-tea-700 mb-4 shadow-warm-md">
            <Leaf className="w-7 h-7 text-tea-200" />
          </div>
          <h1 className="font-serif text-3xl text-tea-800 tracking-wide">TSOT</h1>
          <p className="text-stone-400 text-sm mt-1">Order Manager · Internal Tools</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-warm-md border border-tea-100 px-6 py-8">
          <h2 className="font-semibold text-tea-800 text-lg mb-6 text-center">Sign In</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1.5" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="Enter access password"
                autoComplete="current-password"
                className="w-full rounded-xl border border-tea-200 bg-stone-50 px-4 text-base text-stone-800
                           placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-tea-400
                           focus:border-tea-400 transition-colors"
                style={{ minHeight: '48px', fontSize: '16px' }}
                disabled={loading}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-tea-700 text-white
                         font-semibold text-base transition-all hover:bg-tea-800 active:scale-[0.98]
                         disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ minHeight: '48px' }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-stone-300 mt-6">
          The Secret of Tea · Internal Use Only
        </p>
      </div>
    </div>
  );
}
