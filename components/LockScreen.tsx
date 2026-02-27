import React, { useState } from 'react';
import { Lock, ArrowRight, ShieldCheck, User } from 'lucide-react';
import { Button } from './Button';
import { accounts } from '../data/accounts';

interface LockScreenProps {
  onLogin: (username: string) => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setIsLoading(true);
    setError('');

    // Fake loading delay for realism
    setTimeout(() => {
      const account = accounts.find(
        (acc) => acc.username === username && acc.password === password
      );

      if (account) {
        onLogin(account.username);
      } else {
        setError('Tên đăng nhập hoặc mật khẩu không đúng. Vui lòng thử lại.');
        setIsLoading(false);
      }
    }, 800);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-sky-100 overflow-hidden animate-fadeIn">
        <div className="bg-sky-600 p-8 text-center">
          <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">SKKN 2026 PRO</h1>
          <p className="text-sky-100 text-sm mt-1">Đăng nhập để sử dụng ứng dụng</p>
        </div>

        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username field */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Tên đăng nhập
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User size={18} className="text-gray-400" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-sky-500 focus:border-sky-500 transition-colors text-base"
                  placeholder="Nhập tên đăng nhập"
                  autoFocus
                />
              </div>
            </div>

            {/* Password field */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Mật khẩu
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock size={18} className="text-gray-400" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-sky-500 focus:border-sky-500 transition-colors text-base tracking-widest"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 font-medium animate-pulse">
                {error}
              </p>
            )}

            <p className="text-xs text-gray-400 flex items-center gap-1">
              <ShieldCheck size={12} />
              Kết nối an toàn được mã hóa
            </p>

            <Button
              type="submit"
              className="w-full py-3 text-lg shadow-sky-500/30"
              isLoading={isLoading}
              disabled={!username || !password}
            >
              {isLoading ? 'Đang xác thực...' : 'Đăng nhập'}
            </Button>
          </form>
        </div>

        <div className="bg-gray-50 p-4 text-center border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Phiên bản: v8.0.3 (Education Enterprise)
          </p>
        </div>
      </div>
    </div>
  );
};