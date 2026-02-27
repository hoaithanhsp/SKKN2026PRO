import React, { useState } from 'react';
import { BookOpen, FileText, CheckCircle2, Circle } from 'lucide-react';
import { Button } from './Button';

interface ConfigFormProps {
  onStart: (topic: string, hasEssay: boolean) => void;
  isLoading: boolean;
}

export const ConfigForm: React.FC<ConfigFormProps> = ({ onStart, isLoading }) => {
  const [topic, setTopic] = useState('');
  const [hasEssay, setHasEssay] = useState(false); // Default Scenario 2 (No Essay)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (topic.trim()) {
      onStart(topic, hasEssay);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-8 text-white">
        <h2 className="text-3xl font-bold flex items-center gap-3">
          <BookOpen className="w-8 h-8" />
          Tạo Đề Luyện Thi
        </h2>
        <p className="mt-2 text-blue-100">Cấu trúc chuẩn Bộ Giáo Dục 2025</p>
      </div>

      <form onSubmit={handleSubmit} className="p-8 space-y-8">
        {/* Topic Input */}
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wider">
            Chủ đề ôn tập
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Ví dụ: Hàm số, Tích phân, Khối đa diện..."
            className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all text-lg"
            required
            disabled={isLoading}
          />
        </div>

        {/* Mode Selection */}
        <div className="space-y-4">
          <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wider">
            Cấu trúc đề thi
          </label>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Scenario 2: No Essay */}
            <div 
              onClick={() => !isLoading && setHasEssay(false)}
              className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${!hasEssay ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <div className="flex items-start gap-3">
                { !hasEssay ? <CheckCircle2 className="w-6 h-6 text-blue-600 flex-shrink-0" /> : <Circle className="w-6 h-6 text-slate-300 flex-shrink-0" /> }
                <div>
                  <h3 className="font-bold text-slate-900">Không Tự Luận</h3>
                  <p className="text-sm text-slate-500 mt-1">Trắc nghiệm 100%.</p>
                  <ul className="mt-2 text-xs text-slate-600 space-y-1">
                    <li>• P1: 12 câu (3đ)</li>
                    <li>• P2: 4 câu Đ/S (4đ)</li>
                    <li>• P3: 6 câu ngắn (3đ)</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Scenario 1: With Essay */}
            <div 
              onClick={() => !isLoading && setHasEssay(true)}
              className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${hasEssay ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <div className="flex items-start gap-3">
                { hasEssay ? <CheckCircle2 className="w-6 h-6 text-blue-600 flex-shrink-0" /> : <Circle className="w-6 h-6 text-slate-300 flex-shrink-0" /> }
                <div>
                  <h3 className="font-bold text-slate-900">Có Tự Luận</h3>
                  <p className="text-sm text-slate-500 mt-1">Kết hợp viết bài.</p>
                  <ul className="mt-2 text-xs text-slate-600 space-y-1">
                    <li>• P1: 12 câu (3đ)</li>
                    <li>• P2: 4 câu Đ/S (2đ)</li>
                    <li>• P3: 4 câu ngắn (2đ)</li>
                    <li>• P4: 3 câu TL (3đ)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Button type="submit" className="w-full py-4 text-lg" isLoading={isLoading}>
          {isLoading ? 'Đang khởi tạo...' : 'Bắt đầu làm bài'}
        </Button>
      </form>
    </div>
  );
};