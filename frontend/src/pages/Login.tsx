import { useState } from 'react';
import axios from 'axios';
import { Lock, LogIn, User, Zap } from 'lucide-react';
import { API_BASE, AUTH_STORAGE_KEY, AUTH_TOKEN_KEY } from '../lib/api';

type LoginProps = {
  onLoginSuccess: () => void;
};

export default function Login({ onLoginSuccess }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await axios.post<{
        success: boolean;
        data?: { token: string; user: { username: string; name: string; role: string } };
        message?: string;
      }>(`${API_BASE}/api/auth/login`, {
        username: username.trim(),
        password,
      });

      if (response.data.success) {
        localStorage.setItem(AUTH_STORAGE_KEY, 'true');
        if (response.data.data?.token) {
          localStorage.setItem(AUTH_TOKEN_KEY, response.data.data.token);
        }
        onLoginSuccess();
      } else {
        setError(response.data.message ?? 'Giriş başarısız.');
      }
    } catch (err) {
      const message =
        axios.isAxiosError(err) && err.response?.data?.message
          ? String(err.response.data.message)
          : 'Sunucuya bağlanılamadı. Backend çalışıyor mu?';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    /* body overflow kilitli olduğu için kaydırma bu kapsayıcıda yapılır */
    <div className="h-full min-h-full bg-slate-950 flex justify-center p-4 relative overflow-y-auto overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/40 via-slate-950 to-slate-950" />
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-indigo-600/10 blur-3xl rounded-full" />

      <div className="relative my-auto w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-600/30 mb-4">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wide">Akgün Teknik</h1>
          <p className="text-slate-400 text-sm mt-1">ERP Yönetim Paneli — Güvenli Giriş</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8"
        >
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              Kullanıcı Adı
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="akgunteknik"
                className="w-full pl-10 pr-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-white placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              Şifre
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••"
                className="w-full pl-10 pr-4 py-3 bg-slate-950/60 border border-slate-700 rounded-xl text-white placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-indigo-600/25 transition-all"
          >
            <LogIn className="w-5 h-5" />
            {submitting ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-6">
          Yetkisiz erişim yasaktır · Dükkan içi kullanım
        </p>
      </div>
    </div>
  );
}
