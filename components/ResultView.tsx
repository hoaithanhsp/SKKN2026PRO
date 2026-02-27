import React from 'react';
import { Exam, UserAnswers, QuestionType, Question } from '../types';
import { CheckCircle, XCircle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface ResultViewProps {
  exam: Exam;
  userAnswers: UserAnswers;
  onRetry: () => void;
}

export const ResultView: React.FC<ResultViewProps> = ({ exam, userAnswers, onRetry }) => {
  const [expandedQ, setExpandedQ] = React.useState<string | null>(null);

  // --- SCORING LOGIC ENGINE ---
  let totalScore = 0;
  const maxScore = 10;
  
  const partScores: number[] = [];

  exam.parts.forEach((part) => {
    let pScore = 0;
    
    // Scoring logic based on Part Type
    if (part.questions.length > 0) {
      const type = part.questions[0].type;
      
      if (type === QuestionType.MULTIPLE_CHOICE) {
        // Part 1: 0.25 per correct answer regardless of essay/no-essay
        const scorePerQ = 0.25;
        part.questions.forEach(q => {
          if (userAnswers[q.id] === q.correctChoiceId) {
            pScore += scorePerQ;
          }
        });
      } 
      else if (type === QuestionType.TRUE_FALSE) {
        // Part 2: Complex Logic
        // Scenario 1 (With Essay): Max 0.5/question. 
        // Logic: 1 correct->0.1, 2->0.2, 3->0.3, 4->0.5 (Progressive but capped at 0.5)
        // Wait, the prompt implies "Thang lũy tiến" for Essay mode is standard. Usually 0.1, 0.25, 0.5, 1.0. 
        // BUT max part score is 2.0 with 4 questions. So max 0.5 per Q.
        // Let's adapt proportional logic for max 0.5: 1->0.1, 2->0.2, 3->0.3, 4->0.5.
        
        // Scenario 2 (No Essay): Max 1.0/question.
        // Logic: 1 correct->0.1, 2->0.25, 3->0.5, 4->1.0 (Standard Progressive)
        
        part.questions.forEach(q => {
          const userQAns = (userAnswers[q.id] as Record<string, boolean>) || {};
          let correctCount = 0;
          q.statements?.forEach(s => {
            if (userQAns[s.id] === s.isCorrect) correctCount++;
          });

          if (exam.hasEssay) {
            // Scenario 1: Max 0.5 per question
            if (correctCount === 1) pScore += 0.1;
            else if (correctCount === 2) pScore += 0.2;
            else if (correctCount === 3) pScore += 0.3;
            else if (correctCount === 4) pScore += 0.5;
          } else {
            // Scenario 2: Max 1.0 per question (Standard Progressive)
            if (correctCount === 1) pScore += 0.1;
            else if (correctCount === 2) pScore += 0.25;
            else if (correctCount === 3) pScore += 0.5;
            else if (correctCount === 4) pScore += 1.0;
          }
        });
      } 
      else if (type === QuestionType.SHORT_ANSWER) {
        // Part 3: 0.5 per correct answer
        const scorePerQ = 0.5;
        part.questions.forEach(q => {
          // Normalize string for comparison (trim, lowercase)
          const uAns = (userAnswers[q.id] as string)?.trim().toLowerCase().replace(',', '.');
          const cAns = q.correctAnswer?.trim().toLowerCase().replace(',', '.');
          if (uAns && cAns && uAns === cAns) {
            pScore += scorePerQ;
          }
        });
      }
      else if (type === QuestionType.ESSAY) {
         // Part 4: Manual grading (assume 0 for auto-grade, show max potential)
         // We do not add to totalScore for auto-grading, just display info
         pScore = 0; 
      }
    }
    partScores.push(pScore);
    totalScore += pScore;
  });

  // Round to 2 decimals
  totalScore = Math.round(totalScore * 100) / 100;

  const toggleExpand = (id: string) => {
    setExpandedQ(expandedQ === id ? null : id);
  };

  return (
    <div className="max-w-4xl mx-auto pb-12 px-4">
      {/* Score Card */}
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden mb-8 border border-slate-100">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-8 text-center text-white">
          <p className="text-slate-400 font-medium uppercase tracking-widest text-sm mb-2">Tổng Điểm Trắc Nghiệm</p>
          <div className="text-6xl font-black mb-2 tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 to-yellow-500">
            {totalScore} <span className="text-2xl text-slate-500 font-normal">/ {exam.hasEssay ? '7.0' : '10.0'}</span>
          </div>
          {exam.hasEssay && <p className="text-sm text-yellow-200/80 italic">+ 3.0 điểm phần Tự Luận (chấm tay)</p>}
        </div>
        <div className="grid grid-cols-3 divide-x divide-slate-100 bg-slate-50">
           {partScores.map((score, idx) => {
             // Skip displaying essay part in this grid if it's 0/not graded
             if (exam.parts[idx].questions[0]?.type === QuestionType.ESSAY) return null;
             return (
              <div key={idx} className="p-4 text-center">
                <p className="text-xs text-slate-500 uppercase font-bold mb-1">Phần {idx + 1}</p>
                <p className="font-mono text-xl text-slate-800">{score.toFixed(2)}</p>
              </div>
             )
           })}
        </div>
      </div>

      <div className="space-y-6">
        {exam.parts.map((part, pIdx) => (
          <div key={part.id}>
            <h3 className="font-bold text-xl text-slate-800 mb-4 px-2 border-l-4 border-blue-500">
              Phần {pIdx + 1}: {part.title}
            </h3>
            
            <div className="space-y-4">
              {part.questions.map((q, qIdx) => {
                const isEssay = q.type === QuestionType.ESSAY;
                let isCorrect = false;
                
                // Determine Correctness for UI badge
                if (q.type === QuestionType.MULTIPLE_CHOICE) {
                  isCorrect = userAnswers[q.id] === q.correctChoiceId;
                } else if (q.type === QuestionType.SHORT_ANSWER) {
                  const u = (userAnswers[q.id] as string)?.trim().toLowerCase().replace(',','.');
                  const c = q.correctAnswer?.trim().toLowerCase().replace(',','.');
                  isCorrect = u === c;
                } else if (q.type === QuestionType.TRUE_FALSE) {
                   // Partially correct usually, simplified for badge to "All correct"
                   const userQAns = (userAnswers[q.id] as Record<string, boolean>) || {};
                   isCorrect = q.statements?.every(s => userQAns[s.id] === s.isCorrect) || false;
                }

                return (
                  <div key={q.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div 
                      onClick={() => toggleExpand(q.id)}
                      className="p-4 cursor-pointer hover:bg-slate-50 transition-colors flex justify-between items-start gap-4"
                    >
                      <div className="flex gap-3">
                        <div className={`mt-1 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isCorrect || isEssay ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                          {isEssay ? <span className="text-xs font-bold">TL</span> : (isCorrect ? <CheckCircle size={16} /> : <XCircle size={16} />)}
                        </div>
                        <h4 className="font-medium text-slate-700 text-sm md:text-base line-clamp-2">
                          <span className="font-bold mr-1">Câu {qIdx + 1}:</span> {q.text}
                        </h4>
                      </div>
                      {expandedQ === q.id ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
                    </div>

                    {expandedQ === q.id && (
                      <div className="p-4 bg-slate-50 border-t border-slate-100 text-sm">
                        {/* Detail Answer View based on Type */}
                        {q.type === QuestionType.MULTIPLE_CHOICE && (
                          <div className="grid grid-cols-1 gap-2 mb-3">
                             {q.choices?.map(c => (
                               <div key={c.id} className={`p-2 rounded border flex justify-between ${
                                 c.id === q.correctChoiceId ? 'bg-green-100 border-green-300 text-green-900' : 
                                 (userAnswers[q.id] === c.id ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200')
                               }`}>
                                 <span><span className="font-bold">{c.id}.</span> {c.text}</span>
                                 {c.id === q.correctChoiceId && <CheckCircle size={16} className="text-green-600"/>}
                               </div>
                             ))}
                          </div>
                        )}

                        {q.type === QuestionType.TRUE_FALSE && (
                          <div className="space-y-2 mb-3">
                             {q.statements?.map(s => {
                               const uVal = (userAnswers[q.id] as Record<string, boolean>)?.[s.id];
                               const match = uVal === s.isCorrect;
                               return (
                                 <div key={s.id} className="flex justify-between items-center p-2 bg-white rounded border border-slate-200">
                                   <span className="flex-1 mr-4">{s.text}</span>
                                   <div className="flex gap-4 text-xs font-mono">
                                     <span className={match ? 'text-green-600 font-bold' : 'text-red-500 line-through'}>
                                       Bạn: {uVal ? 'Đ' : 'S'}
                                     </span>
                                     <span className="text-blue-600 font-bold">
                                       Đúng: {s.isCorrect ? 'Đ' : 'S'}
                                     </span>
                                   </div>
                                 </div>
                               )
                             })}
                          </div>
                        )}

                        {(q.type === QuestionType.SHORT_ANSWER) && (
                           <div className="mb-3">
                             <p className="mb-1 text-slate-500">Đáp án của bạn: <span className="font-mono font-bold text-slate-800">{(userAnswers[q.id] as string) || '(Trống)'}</span></p>
                             <p className="text-green-700">Đáp án đúng: <span className="font-mono font-bold">{q.correctAnswer}</span></p>
                           </div>
                        )}

                        {q.type === QuestionType.ESSAY && (
                          <div className="mb-3">
                             <p className="text-slate-500 italic mb-2">Hệ thống không chấm điểm phần này.</p>
                             <p className="font-bold text-slate-700">Gợi ý đáp án / Hướng dẫn giải:</p>
                             <div className="p-3 bg-white border border-slate-200 rounded mt-1 text-slate-800">
                                {q.explanation || "Không có gợi ý chi tiết."}
                             </div>
                          </div>
                        )}

                        {q.explanation && q.type !== QuestionType.ESSAY && (
                          <div className="mt-4 p-3 bg-blue-50/50 rounded border border-blue-100">
                            <span className="font-bold text-blue-800 block mb-1">Giải thích:</span>
                            <p className="text-slate-700">{q.explanation}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 flex justify-center">
        <Button onClick={onRetry} variant="secondary" className="px-8 py-3 text-lg flex items-center gap-2">
          <RefreshCw size={20} /> Tạo đề mới
        </Button>
      </div>
    </div>
  );
};