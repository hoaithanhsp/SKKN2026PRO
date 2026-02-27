import React, { useState } from 'react';
import { Exam, QuestionType, UserAnswers, ExamPart, Question } from '../types';
import { Button } from './Button';
import { Check, Edit3, HelpCircle, AlertCircle } from 'lucide-react';

interface ExamViewProps {
  exam: Exam;
  onSubmit: (answers: UserAnswers) => void;
}

export const ExamView: React.FC<ExamViewProps> = ({ exam, onSubmit }) => {
  const [answers, setAnswers] = useState<UserAnswers>({});
  const [currentPartIndex, setCurrentPartIndex] = useState(0);

  const handleMultipleChoice = (qId: string, choiceId: string) => {
    setAnswers(prev => ({ ...prev, [qId]: choiceId }));
  };

  const handleTrueFalse = (qId: string, statementId: string, value: boolean) => {
    setAnswers(prev => {
      const currentQAnswer = (prev[qId] as Record<string, boolean>) || {};
      return {
        ...prev,
        [qId]: { ...currentQAnswer, [statementId]: value }
      };
    });
  };

  const handleShortAnswer = (qId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [qId]: value }));
  };

  const currentPart = exam.parts[currentPartIndex];

  const renderQuestion = (q: Question, index: number) => {
    switch (q.type) {
      case QuestionType.MULTIPLE_CHOICE:
        return (
          <div key={q.id} className="mb-8 p-6 bg-white rounded-xl border border-slate-100 shadow-sm">
            <h4 className="font-semibold text-lg text-slate-800 mb-4 flex gap-3">
              <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm h-fit mt-1">Câu {index + 1}</span>
              {q.text}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {q.choices?.map(c => (
                <button
                  key={c.id}
                  onClick={() => handleMultipleChoice(q.id, c.id)}
                  className={`p-3 text-left rounded-lg border transition-all ${
                    answers[q.id] === c.id 
                      ? 'border-blue-500 bg-blue-50 text-blue-800 ring-1 ring-blue-500' 
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="font-bold mr-2">{c.id}.</span> {c.text}
                </button>
              ))}
            </div>
          </div>
        );

      case QuestionType.TRUE_FALSE:
        return (
          <div key={q.id} className="mb-8 p-6 bg-white rounded-xl border border-slate-100 shadow-sm">
             <h4 className="font-semibold text-lg text-slate-800 mb-4 flex gap-3">
              <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-sm h-fit mt-1">Câu {index + 1}</span>
              {q.text}
            </h4>
            <div className="bg-slate-50 rounded-lg overflow-hidden border border-slate-200">
              <div className="grid grid-cols-12 bg-slate-100 border-b border-slate-200 text-sm font-semibold text-slate-600 py-2 px-4">
                <div className="col-span-8">Mệnh đề</div>
                <div className="col-span-2 text-center">Đúng</div>
                <div className="col-span-2 text-center">Sai</div>
              </div>
              {q.statements?.map(s => {
                const currentAns = (answers[q.id] as Record<string, boolean>)?.[s.id];
                return (
                  <div key={s.id} className="grid grid-cols-12 border-b border-slate-200 last:border-0 py-3 px-4 hover:bg-white transition-colors items-center">
                    <div className="col-span-8 pr-4 text-slate-700">
                      <span className="font-bold mr-2">{s.id})</span> {s.text}
                    </div>
                    <div className="col-span-2 flex justify-center">
                      <input 
                        type="radio" 
                        name={`${q.id}-${s.id}`}
                        className="w-5 h-5 text-blue-600 focus:ring-blue-500"
                        checked={currentAns === true}
                        onChange={() => handleTrueFalse(q.id, s.id, true)}
                      />
                    </div>
                    <div className="col-span-2 flex justify-center">
                      <input 
                        type="radio" 
                        name={`${q.id}-${s.id}`}
                        className="w-5 h-5 text-red-500 focus:ring-red-500"
                        checked={currentAns === false}
                        onChange={() => handleTrueFalse(q.id, s.id, false)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );

      case QuestionType.SHORT_ANSWER:
        return (
          <div key={q.id} className="mb-6 p-6 bg-white rounded-xl border border-slate-100 shadow-sm">
            <h4 className="font-semibold text-lg text-slate-800 mb-4 flex gap-3">
              <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded text-sm h-fit mt-1">Câu {index + 1}</span>
              {q.text}
            </h4>
            <div className="max-w-xs">
              <label className="block text-sm text-slate-500 mb-1">Đáp án của bạn:</label>
              <input
                type="text"
                placeholder="Nhập số hoặc phân số..."
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                value={(answers[q.id] as string) || ''}
                onChange={(e) => handleShortAnswer(q.id, e.target.value)}
              />
            </div>
          </div>
        );

        case QuestionType.ESSAY:
          return (
            <div key={q.id} className="mb-6 p-6 bg-white rounded-xl border border-slate-100 shadow-sm">
              <h4 className="font-semibold text-lg text-slate-800 mb-4 flex gap-3">
                <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-sm h-fit mt-1">Câu {index + 1}</span>
                {q.text}
              </h4>
              <div className="w-full">
                <textarea 
                  disabled
                  placeholder="Phần tự luận: Vui lòng làm ra giấy. Ứng dụng sẽ hiển thị đáp án gợi ý sau khi nộp bài."
                  className="w-full h-32 p-4 bg-slate-50 text-slate-500 border border-slate-200 rounded-lg resize-none cursor-not-allowed"
                />
                <p className="text-sm text-slate-500 mt-2 italic flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Hệ thống không chấm điểm tự động phần này.
                </p>
              </div>
            </div>
          );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-24">
      {/* Header Sticky */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-200 p-4 mb-6 shadow-sm">
        <div className="flex justify-between items-center max-w-4xl mx-auto">
          <div>
            <h2 className="font-bold text-slate-800">{exam.title}</h2>
            <p className="text-sm text-slate-500">{exam.topic}</p>
          </div>
          <div className="flex gap-2">
            {exam.parts.map((p, idx) => (
              <button
                key={p.id}
                onClick={() => setCurrentPartIndex(idx)}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  currentPartIndex === idx 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Phần {idx + 1}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4">
        <div className="mb-6 bg-blue-50 border border-blue-100 p-4 rounded-lg">
          <h3 className="font-bold text-blue-900 mb-1">{currentPart.title}</h3>
          <p className="text-blue-700 text-sm">{currentPart.description}</p>
        </div>

        {currentPart.questions.map((q, idx) => renderQuestion(q, idx))}
      </div>

      {/* Footer Actions */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <Button 
            variant="outline"
            disabled={currentPartIndex === 0}
            onClick={() => setCurrentPartIndex(p => p - 1)}
          >
            Quay lại
          </Button>
          
          {currentPartIndex < exam.parts.length - 1 ? (
            <Button 
              onClick={() => setCurrentPartIndex(p => p + 1)}
            >
              Tiếp theo
            </Button>
          ) : (
            <Button 
              variant="primary"
              className="bg-green-600 hover:bg-green-700 shadow-green-500/30"
              onClick={() => onSubmit(answers)}
            >
              Nộp Bài & Xem Điểm
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};