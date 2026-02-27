import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { UserInfo, GenerationStep, GenerationState, SKKNTemplate, SolutionsState, WizardStep } from './types';
import { STEPS_INFO, SOLUTION_MODE_PROMPT, FALLBACK_MODELS, HIGHER_ED_LEVELS, HIGHER_ED_SYSTEM_INSTRUCTION } from './constants';
import { initializeGeminiChat, sendMessageStream, getFriendlyErrorMessage, parseApiError, getChatHistory, setChatHistory } from './services/geminiService';
import { apiKeyManager } from './services/apiKeyManager';
import { getSubjectInfo } from './data/subjectsData';
import { OUTLINE_GUIDE, INTRO_GUIDE, THEORY_GUIDE, REALITY_GUIDE, RESULT_GUIDE, CONCLUSION_GUIDE, APPENDIX_GUIDE, NATURAL_WRITING_TECHNIQUES } from './data/skknKnowledgeBase';
import { SKKNForm } from './components/SKKNForm';
import { TemplateUploadStep } from './components/TemplateUploadStep';
import { DocumentPreview } from './components/DocumentPreview';
import { Button } from './components/Button';
import { ApiKeyModal } from './components/ApiKeyModal';
import { Download, ChevronRight, Wand2, FileText, CheckCircle, RefreshCw, Settings, AlertTriangle, Save, Trash2 } from 'lucide-react';

import { LockScreen } from './components/LockScreen';

// Helper: Truncate text dài cho AI prompt - giữ phần đầu (nội dung chính) và thông báo lược bớt
const MAX_REF_DOCS_FOR_PROMPT = 80000; // ~80K ký tự tối đa cho tài liệu tham khảo trong prompt

const truncateForPrompt = (text: string, maxChars: number = MAX_REF_DOCS_FOR_PROMPT): string => {
  if (!text || text.length <= maxChars) return text;

  const truncated = text.substring(0, maxChars);
  const removedChars = text.length - maxChars;
  const estimatedPages = Math.round(removedChars / 2500); // ~2500 ký tự/trang A4

  return truncated + `\n\n[... ĐÃ LƯỢC BỚT ${removedChars.toLocaleString()} KÝ TỰ (~${estimatedPages} trang) DO QUÁ DÀI. Nội dung phía trên đã đủ để tham khảo các ý chính ...]`;
};

// SessionStorage key cho tài liệu tham khảo lớn
const SESSION_REF_DOCS_KEY = 'skkn_ref_docs';
const SESSION_REF_NAMES_KEY = 'skkn_ref_file_names';

// LocalStorage key cho lưu/khôi phục phiên làm việc
const SESSION_SAVE_KEY = 'skkn_session_data';

// Interface cho session data
interface SessionData {
  userInfo: Omit<UserInfo, 'referenceDocuments'> & { hasReferenceDocuments: boolean };
  state: {
    step: GenerationStep;
    messages: Array<{ role: string; text: string }>;
    fullDocument: string;
  };
  solutionsState: SolutionsState;
  appendixDocument: string;
  outlineFeedback: string;
  chatHistory: any[];
  savedAt: string;
}

const App: React.FC = () => {
  // Lock Screen State
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Wizard Step State (Template-First flow)
  const [wizardStep, setWizardStep] = useState<WizardStep>(WizardStep.UPLOAD_TEMPLATE);
  const [templateFileName, setTemplateFileName] = useState('');
  const [templateSectionsCount, setTemplateSectionsCount] = useState(0);

  // Session Restore State
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [pendingSessionData, setPendingSessionData] = useState<SessionData | null>(null);
  const [sessionSavedAt, setSessionSavedAt] = useState<string | null>(null);

  // API Key State
  const [apiKey, setApiKey] = useState('');
  const [showApiModal, setShowApiModal] = useState(false);
  const [selectedModel, setSelectedModel] = useState(FALLBACK_MODELS[0]);

  // Check LocalStorage on Mount
  useEffect(() => {
    const authState = localStorage.getItem('skkn_app_unlocked');
    if (authState === 'true') {
      setIsUnlocked(true);
    }

    // Load API key từ localStorage hoặc .env
    const savedKey = localStorage.getItem('gemini_api_key');
    const savedModel = localStorage.getItem('selected_model');

    if (savedKey) {
      setApiKey(savedKey);
    } else {
      // Thử lấy key từ biến môi trường (.env)
      const envKeys = (import.meta.env.VITE_GEMINI_API_KEYS || '').split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0);
      if (envKeys.length > 0) {
        const firstEnvKey = envKeys[0];
        setApiKey(firstEnvKey);
        localStorage.setItem('gemini_api_key', firstEnvKey);
        console.log('🔑 Tự động sử dụng API key từ biến môi trường');
      } else {
        // Không có key nào → hiển thị modal bắt buộc nhập
        setShowApiModal(true);
      }
    }

    if (savedModel && FALLBACK_MODELS.includes(savedModel)) {
      setSelectedModel(savedModel);
    }

    // Kiểm tra phiên làm việc đã lưu
    try {
      const savedSession = localStorage.getItem(SESSION_SAVE_KEY);
      if (savedSession) {
        const sessionData: SessionData = JSON.parse(savedSession);
        // Chỉ hiện modal khôi phục nếu phiên có tiến trình (step > INPUT_FORM)
        if (sessionData.state && sessionData.state.step > GenerationStep.INPUT_FORM) {
          setPendingSessionData(sessionData);
          setShowRestoreModal(true);
        }
      }
    } catch (e) {
      console.warn('Không thể đọc phiên đã lưu:', e);
      localStorage.removeItem(SESSION_SAVE_KEY);
    }

    setCheckingAuth(false);
  }, []);

  const handleSaveApiKey = (key: string, model: string) => {
    localStorage.setItem('gemini_api_key', key);
    localStorage.setItem('selected_model', model);
    setApiKey(key);
    setSelectedModel(model);
    setShowApiModal(false);

    // 🆕 Nếu đang có lỗi (ví dụ: hết quota), clear error và reinitialize chat với key mới
    if (state.error) {
      setState(prev => ({ ...prev, error: null }));
      // Reinitialize chat session với key mới
      initializeGeminiChat(key, model);
    }
  };

  const handleLogin = (username: string) => {
    localStorage.setItem('skkn_app_unlocked', 'true');
    localStorage.setItem('skkn_logged_user', username);
    setIsUnlocked(true);
  };

  const [userInfo, setUserInfo] = useState<UserInfo>({
    topic: '',
    subject: '',
    level: '',
    grade: '',
    school: '',
    location: '',
    facilities: '',
    textbook: '',
    researchSubjects: '',
    timeframe: '',
    applyAI: '',
    focus: '',
    referenceDocuments: '',
    skknTemplate: '',
    specialRequirements: '',
    pageLimit: '', // Số trang giới hạn (để trống = không giới hạn)
    includePracticalExamples: false, // Thêm ví dụ thực tế
    includeStatistics: false, // Bổ sung bảng biểu thống kê
    requirementsConfirmed: false, // Đã xác nhận yêu cầu
    numSolutions: 3, // Mặc định viết 3 giải pháp
    customTemplate: undefined // Cấu trúc mẫu SKKN tùy chỉnh (đã trích xuất)
  });

  // Khôi phục referenceDocuments từ sessionStorage khi mount
  useEffect(() => {
    try {
      const savedRefDocs = sessionStorage.getItem(SESSION_REF_DOCS_KEY);
      if (savedRefDocs && !userInfo.referenceDocuments) {
        setUserInfo(prev => ({ ...prev, referenceDocuments: savedRefDocs }));
        console.log(`📄 Đã khôi phục tài liệu tham khảo từ session (${(savedRefDocs.length / 1024).toFixed(1)}KB)`);
      }
    } catch (e) {
      console.warn('Không thể khôi phục tài liệu tham khảo:', e);
    }
  }, []);

  // Lưu referenceDocuments vào sessionStorage khi thay đổi
  useEffect(() => {
    try {
      if (userInfo.referenceDocuments) {
        sessionStorage.setItem(SESSION_REF_DOCS_KEY, userInfo.referenceDocuments);
      } else {
        sessionStorage.removeItem(SESSION_REF_DOCS_KEY);
      }
    } catch (e) {
      console.warn('Text quá lớn cho sessionStorage, bỏ qua persistence:', e);
    }
  }, [userInfo.referenceDocuments]);

  const [state, setState] = useState<GenerationState>({
    step: GenerationStep.INPUT_FORM,
    messages: [],
    fullDocument: '',
    isStreaming: false,
    error: null
  });

  const [outlineFeedback, setOutlineFeedback] = useState("");

  // Phụ lục riêng biệt
  const [appendixDocument, setAppendixDocument] = useState('');
  const [isAppendixLoading, setIsAppendixLoading] = useState(false);

  // State quản lý từng giải pháp riêng biệt
  const [solutionsState, setSolutionsState] = useState<SolutionsState>({
    solution1: null,
    solution2: null,
    solution3: null,
    solution4: null,
    solution5: null,
  });

  // ═══════════════════════════════════════════════════════════
  // CUSTOM TEMPLATE DYNAMIC STEPS LOGIC
  // ═══════════════════════════════════════════════════════════
  const customTemplateData = useMemo(() => {
    try {
      return userInfo.customTemplate ? JSON.parse(userInfo.customTemplate) as SKKNTemplate : null;
    } catch { return null; }
  }, [userInfo.customTemplate]);

  const validCustomSections = useMemo(() => {
    if (!customTemplateData || !customTemplateData.sections) return [];

    // Thuật toán gộp mục an toàn tối đa: 
    // - Lấy mục Level 1 NẾU nó KHÔNG có mục con (thuộc mọi level cao hơn nó).
    // - Lấy mục Level >= 2, nhưng sẽ BỎ QUA TẤT CẢ mục con bên trong nó (để tránh băm quá nát như tiểu mục a,b,c).
    // Thuật toán này sẽ chạy đúng ngay cả khi AI đánh nhầm Level của II.1 thành Level 3 thay vì Level 2.
    const result = [];
    const sections = customTemplateData.sections;

    for (let i = 0; i < sections.length; i++) {
      const current = sections[i];

      let hasChild = false;
      if (i + 1 < sections.length && sections[i + 1].level > current.level) {
        hasChild = true;
      }

      if (current.level === 1) {
        if (!hasChild) {
          result.push(current);
        }
      } else {
        // Push mục hiện tại (>= 2)
        result.push(current);

        // Bỏ qua tất cả các mục con của nó
        let nextIdx = i + 1;
        while (nextIdx < sections.length && sections[nextIdx].level > current.level) {
          nextIdx++;
        }
        i = nextIdx - 1; // Sẽ được i++ bởi vòng lặp for
      }
    }

    return result.length > 0 ? result : sections;
  }, [customTemplateData]);

  const isCustomFlow = validCustomSections.length > 0;

  const currentStepsInfo = useMemo(() => {
    if (!isCustomFlow) return STEPS_INFO;

    const info: Record<number, { label: string, description: string }> = {
      0: { label: "Thông tin", description: "Thiết lập thông tin cơ bản" },
      1: { label: "Lập Dàn Ý", description: "Xây dựng khung sườn cho SKKN" },
    };

    validCustomSections.forEach((section: any, idx: number) => {
      info[2 + idx] = {
        label: section.title.length > 25 ? section.title.substring(0, 25) + '...' : section.title,
        description: `Viết mục: ${section.title}`
      };
    });

    const appendixStep = 2 + validCustomSections.length;
    const completedStep = appendixStep + 1;
    info[appendixStep] = { label: "Tạo Phụ lục", description: "Tài liệu phụ lục" };
    info[completedStep] = { label: "Hoàn tất", description: "Đã xong" };

    return info;
  }, [isCustomFlow, validCustomSections]);

  const COMPLETED_STEP_ID = isCustomFlow ? 2 + validCustomSections.length + 1 : GenerationStep.COMPLETED;


  // ═══════════════════════════════════════════════════════════
  // SESSION PERSISTENCE: Tự động lưu phiên vào localStorage
  // ═══════════════════════════════════════════════════════════

  // Hàm lưu phiên
  const saveSession = useCallback(() => {
    // Chỉ lưu khi đã bắt đầu làm việc (không lưu khi đang ở form nhập)
    if (state.step <= GenerationStep.INPUT_FORM || state.isStreaming) return;

    try {
      const sessionData: SessionData = {
        userInfo: {
          ...userInfo,
          referenceDocuments: '', // Không lưu ref docs (quá lớn, đã có sessionStorage)
          hasReferenceDocuments: !!userInfo.referenceDocuments,
        } as any,
        state: {
          step: state.step,
          messages: state.messages,
          fullDocument: state.fullDocument,
        },
        solutionsState,
        appendixDocument,
        outlineFeedback,
        chatHistory: getChatHistory(),
        savedAt: new Date().toISOString(),
      };

      localStorage.setItem(SESSION_SAVE_KEY, JSON.stringify(sessionData));
      setSessionSavedAt(new Date().toLocaleTimeString('vi-VN'));
      console.log('💾 Đã lưu phiên làm việc:', sessionData.state.step);
    } catch (e) {
      console.warn('Không thể lưu phiên (có thể do dữ liệu quá lớn):', e);
    }
  }, [state.step, state.messages, state.fullDocument, state.isStreaming, userInfo, solutionsState, appendixDocument, outlineFeedback]);

  // Tự động lưu khi state thay đổi (debounce 2 giây)
  useEffect(() => {
    if (state.step <= GenerationStep.INPUT_FORM || state.isStreaming) return;

    const timer = setTimeout(() => {
      saveSession();
    }, 2000);

    return () => clearTimeout(timer);
  }, [state.step, state.fullDocument, solutionsState, appendixDocument, saveSession]);

  // Hàm khôi phục phiên
  const restoreSession = useCallback((sessionData: SessionData) => {
    try {
      // Khôi phục userInfo (trừ referenceDocuments)
      const { hasReferenceDocuments, ...savedUserInfo } = sessionData.userInfo as any;
      setUserInfo(prev => ({
        ...prev,
        ...savedUserInfo,
        referenceDocuments: prev.referenceDocuments || '', // Giữ ref docs từ sessionStorage
      }));

      // Khôi phục GenerationState
      setState({
        step: sessionData.state.step,
        messages: (sessionData.state.messages || []) as any,
        fullDocument: sessionData.state.fullDocument || '',
        isStreaming: false,
        error: null,
      });

      // Skip wizard upload step khi restore session
      setWizardStep(WizardStep.SETUP_INFO);

      // Khôi phục solutions
      if (sessionData.solutionsState) {
        setSolutionsState(sessionData.solutionsState);
      }

      // Khôi phục phụ lục
      if (sessionData.appendixDocument) {
        setAppendixDocument(sessionData.appendixDocument);
      }

      // Khôi phục outline feedback
      if (sessionData.outlineFeedback) {
        setOutlineFeedback(sessionData.outlineFeedback);
      }

      // Khôi phục chat history cho Gemini
      if (sessionData.chatHistory && sessionData.chatHistory.length > 0) {
        setChatHistory(sessionData.chatHistory);
      }

      // Initialize Gemini chat với API key
      const savedKey = localStorage.getItem('gemini_api_key');
      const savedModel = localStorage.getItem('selected_model');
      if (savedKey) {
        initializeGeminiChat(savedKey, savedModel || undefined);
        // Khôi phục history SAU khi init (vì init reset history)
        if (sessionData.chatHistory && sessionData.chatHistory.length > 0) {
          setChatHistory(sessionData.chatHistory);
        }
      }

      console.log('✅ Đã khôi phục phiên làm việc thành công!');
    } catch (e) {
      console.error('Lỗi khôi phục phiên:', e);
      setState(prev => ({ ...prev, error: 'Không thể khôi phục phiên làm việc. Vui lòng bắt đầu lại.' }));
    }
  }, []);

  // Hàm xóa phiên đã lưu
  const clearSavedSession = useCallback(() => {
    localStorage.removeItem(SESSION_SAVE_KEY);
    setSessionSavedAt(null);
    console.log('🗑 Đã xóa phiên làm việc đã lưu');
  }, []);

  // State cho popup review giải pháp
  const [showSolutionReview, setShowSolutionReview] = useState(false);
  const [currentSolutionNumber, setCurrentSolutionNumber] = useState(0);
  const [currentSolutionContent, setCurrentSolutionContent] = useState('');
  const [isRevisingSolution, setIsRevisingSolution] = useState(false);

  // Helper: Tính toán phân bổ trang cho từng phần SKKN
  const getPageAllocation = useCallback(() => {
    if (!userInfo.pageLimit || typeof userInfo.pageLimit !== 'number') return null;

    const pages = userInfo.pageLimit;
    const wordsPerPage = 350; // 1 trang A4 ≈ 350 từ (font 13pt, line spacing 1.5)
    const charsPerPage = 2500;
    const numSolutions = userInfo.numSolutions || 3;

    // Phân bổ: I&II (5%), III (5%), IV-GP (85%), V&VI (5%)
    const partI_II_pages = Math.max(1, Math.round(pages * 0.05));
    const partIII_pages = Math.max(1, Math.round(pages * 0.05));
    const partIV_pages = Math.max(numSolutions * 3, Math.round(pages * 0.85));
    const partV_VI_pages = Math.max(1, pages - partI_II_pages - partIII_pages - partIV_pages);
    const pagesPerSolution = Math.max(2, Math.floor(partIV_pages / numSolutions));

    return {
      totalPages: pages,
      wordsPerPage,
      charsPerPage,
      totalWords: pages * wordsPerPage,
      totalChars: pages * charsPerPage,
      numSolutions,
      partI_II: { pages: partI_II_pages, words: partI_II_pages * wordsPerPage, chars: partI_II_pages * charsPerPage },
      partIII: { pages: partIII_pages, words: partIII_pages * wordsPerPage, chars: partIII_pages * charsPerPage },
      partIV: { pages: partIV_pages, words: partIV_pages * wordsPerPage, chars: partIV_pages * charsPerPage },
      perSolution: { pages: pagesPerSolution, words: pagesPerSolution * wordsPerPage, chars: pagesPerSolution * charsPerPage },
      partV_VI: { pages: partV_VI_pages, words: partV_VI_pages * wordsPerPage, chars: partV_VI_pages * charsPerPage },
    };
  }, [userInfo.pageLimit, userInfo.numSolutions]);

  // Helper: Tạo prompt giới hạn số từ/trang cho MỘT phần cụ thể đang viết
  const getSectionPagePrompt = useCallback((sectionName: string, sectionKey: 'partI_II' | 'partIII' | 'perSolution' | 'partV_VI') => {
    const alloc = getPageAllocation();
    if (!alloc) return '';

    const section = alloc[sectionKey];
    return `
🚨 GIỚI HẠN SỐ TRANG CHO PHẦN NÀY(BẮT BUỘC):
📌 ${sectionName}: PHẢI viết khoảng ${section.pages} TRANG(≈ ${section.words.toLocaleString()} từ ≈ ${section.chars.toLocaleString()} ký tự)
⚠️ Trong tổng ${alloc.totalPages} trang SKKN, phần này chiếm ${section.pages} trang.
🚫 KHÔNG viết quá ${Math.ceil(section.pages * 1.15)} trang và KHÔNG viết dưới ${Math.max(1, Math.floor(section.pages * 0.85))} trang.
✅ Viết CÔ ĐỌNG, SÚC TÍCH nhưng ĐẦY ĐỦ NỘI DUNG.Ưu tiên bảng biểu để tiết kiệm không gian.
`;
  }, [getPageAllocation]);

  // Helper function để tạo prompt nhắc lại các yêu cầu đặc biệt
  const getPageLimitPrompt = useCallback(() => {
    // Kiểm tra xem người dùng đã xác nhận yêu cầu chưa
    if (!userInfo.requirementsConfirmed) return '';

    const requirements: string[] = [];

    // 1. Giới hạn số trang - TÍNH TOÁN CHI TIẾT
    const alloc = getPageAllocation();
    if (alloc) {
      requirements.push(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨🚨🚨 GIỚI HẠN SỐ TRANG - BẮT BUỘC TUYỆT ĐỐI 🚨🚨🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 TỔNG SỐ TRANG YÊU CẦU: ${alloc.totalPages} TRANG (không tính Dàn ý và Phụ lục)

📐 QUY ĐỔI CHUẨN (Font 13pt, Line spacing 1.5):
• 1 trang A4 ≈ ${alloc.wordsPerPage} từ ≈ ${alloc.charsPerPage} ký tự
• TỔNG CHO ${alloc.totalPages} TRANG: ≈ ${alloc.totalWords.toLocaleString()} từ ≈ ${alloc.totalChars.toLocaleString()} ký tự

📊 PHÂN BỔ CHI TIẾT TỪNG PHẦN:
┌──────────────────────────────────────────────────────────────────┐
│ PHẦN                │ SỐ TRANG  │ SỐ TỪ         │ SỐ KÝ TỰ       │
├──────────────────────────────────────────────────────────────────┤
│ Phần I & II         │ ${alloc.partI_II.pages} trang    │ ~${alloc.partI_II.words.toLocaleString()} từ      │ ~${alloc.partI_II.chars.toLocaleString()} ký tự     │
│ Phần III            │ ${alloc.partIII.pages} trang    │ ~${alloc.partIII.words.toLocaleString()} từ      │ ~${alloc.partIII.chars.toLocaleString()} ký tự     │
│ Phần IV(${alloc.numSolutions} GP)    │ ${alloc.partIV.pages} trang   │ ~${alloc.partIV.words.toLocaleString()} từ     │ ~${alloc.partIV.chars.toLocaleString()} ký tự    │
│  → Mỗi giải pháp   │ ${alloc.perSolution.pages} trang    │ ~${alloc.perSolution.words.toLocaleString()} từ      │ ~${alloc.perSolution.chars.toLocaleString()} ký tự     │
│ Phần V & VI + KL    │ ${alloc.partV_VI.pages} trang    │ ~${alloc.partV_VI.words.toLocaleString()} từ      │ ~${alloc.partV_VI.chars.toLocaleString()} ký tự     │
└──────────────────────────────────────────────────────────────────┘

⚠️ QUY TẮC KIỂM SOÁT SỐ TRANG NGHIÊM NGẶT:
1. TRƯỚC KHI VIẾT: Tính toán số từ cần viết cho phần HIỆN TẠI dựa trên bảng phân bổ.
2. TRONG KHI VIẾT: Đếm số từ đã viết, DỪNG NGAY khi đạt đủ số từ phân bổ.
3. SAU KHI VIẾT: Tự đánh giá số từ đã viết so với phân bổ. Nếu vượt > 15% → CẮT BỚT.
4. MỖI ĐOẠN VĂN: Tối đa 3-4 câu (≈ 60-80 từ)
5. MỖI MỤC NHỎ: Tối đa 5-7 đoạn văn
6. KHÔNG lặp lại ý, KHÔNG viết dư thừa
7. VÍ DỤ MINH HỌA: Chỉ 1-2 ví dụ ngắn gọn / giải pháp
8. BẢNG BIỂU: Giúp tiết kiệm không gian - ưu tiên sử dụng

🚫🚫🚫 CẢNH BÁO NGHIÊM NGẶT:
- NẾU VƯỢT QUÁ ${alloc.totalPages} TRANG (≈ ${alloc.totalWords.toLocaleString()} từ) → HOÀN TOÀN KHÔNG CHẤP NHẬN ĐƯỢC!
- NẾU VIẾT THIẾU DƯỚI ${Math.max(1, Math.floor(alloc.totalPages * 0.8))} TRANG → CŨNG KHÔNG ĐẠT YÊU CẦU!
- SỐ TRANG LÀ YÊU CẦU CỐT LÕI CỦA NGƯỜI DÙNG, PHẢI TUÂN THỦ 100%.
✅ MỤC TIÊU: Viết ĐÚNG số trang yêu cầu, CÔ ĐỌNG, SÚC TÍCH nhưng vẫn ĐẦY ĐỦ NỘI DUNG.`);
    }

    // 2. Thêm bài toán thực tế, ví dụ minh họa
    if (userInfo.includePracticalExamples) {
      requirements.push(`
📊 YÊU CẦU THÊM BÀI TOÁN THỰC TẾ, VÍ DỤ MINH HỌA:
- Mỗi giải pháp PHẢI có ít nhất 2 - 3 ví dụ thực tế cụ thể
  - Bài toán thực tế phải gắn với đời sống, công việc, nghề nghiệp
    - Ví dụ minh họa phải chi tiết, có thể áp dụng ngay
      - Ưu tiên các ví dụ từ SGK ${userInfo.textbook || "hiện hành"} `);
    }

    // 3. Bổ sung bảng biểu, số liệu thống kê
    if (userInfo.includeStatistics) {
      requirements.push(`
📈 YÊU CẦU BỔ SUNG BẢNG BIỂU, SỐ LIỆU THỐNG KÊ:
- Mỗi phần quan trọng PHẢI có bảng biểu hoặc số liệu minh họa
  - Sử dụng số liệu lẻ tự nhiên(42.3 %, 67.8 %) thay vì số tròn
    - Bảng số liệu phải rõ ràng, format Markdown chuẩn
      - Có biểu đồ gợi ý khi cần thiết
        - Số liệu phải logic và nhất quán trong toàn bài`);
    }

    // 4. Yêu cầu bổ sung khác
    if (userInfo.specialRequirements && userInfo.specialRequirements.trim()) {
      requirements.push(`
✏️ YÊU CẦU BỔ SUNG TỪ NGƯỜI DÙNG:
${userInfo.specialRequirements}
Hãy áp dụng CHÍNH XÁC các yêu cầu trên vào phần đang viết!`);
    }

    if (requirements.length === 0) return '';

    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ CÁC YÊU CẦU ĐẶC BIỆT ĐÃ XÁC NHẬN(BẮT BUỘC TUÂN THỦ NGHIÊM NGẶT):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${requirements.join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
  }, [userInfo.requirementsConfirmed, userInfo.pageLimit, userInfo.includePracticalExamples, userInfo.includeStatistics, userInfo.specialRequirements, userInfo.textbook, userInfo.numSolutions, getPageAllocation]);

  // Helper function để tạo prompt cấu trúc từ mẫu SKKN đã trích xuất
  const getCustomTemplatePrompt = useCallback(() => {
    if (!userInfo.customTemplate) return null;

    try {
      const template: SKKNTemplate = JSON.parse(userInfo.customTemplate);
      if (!template.sections || template.sections.length === 0) return null;

      // Tạo chuỗi hiển thị cấu trúc
      const structureText = template.sections.map(s => {
        const indent = '  '.repeat(s.level - 1);
        const prefix = s.level === 1 ? '📌' : s.level === 2 ? '•' : '○';
        return `${indent}${prefix} ${s.id}. ${s.title} `;
      }).join('\n');

      return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨🚨🚨 CẤU TRÚC MẪU SKKN TỪ ${template.name || 'Sở/Phòng GD'} (BẮT BUỘC TUYỆT ĐỐI) 🚨🚨🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ CẢNH BÁO: Đây là CẤU TRÚC DUY NHẤT được phép sử dụng.
🚫 TUYỆT ĐỐI KHÔNG sử dụng cấu trúc SKKN mặc định / chuẩn.
✅ BẮT BUỘC TẠO DÀN Ý VÀ NỘI DUNG THEO ĐÚNG CẤU TRÚC NÀY:

${structureText}

QUY TẮC BẮT BUỘC:
1. TẠO DÀN Ý theo ĐÚNG thứ tự và tên các phần / mục như trên
2. KHÔNG thay đổi tên các phần lớn(level 1)
3. CÁC MỤC CON có thể điều chỉnh nội dung cho phù hợp đề tài nhưng PHẢI giữ nguyên cấu trúc
4. Điền nội dung phù hợp với đề tài vào TỪNG MỤC
5. KHÔNG sử dụng cấu trúc "Phần I, II, III, IV, V, VI" mặc định nếu mẫu có cấu trúc khác
6. Số lượng giải pháp, tên các phần, thứ tự trình bày PHẢI theo mẫu này

[HẾT CẤU TRÚC MẪU - MỌI NỘI DUNG PHẢI TUÂN THỦ CẤU TRÚC TRÊN]
`;
    } catch (e) {
      console.error('Lỗi parse customTemplate:', e);
      return null;
    }
  }, [userInfo.customTemplate]);

  // Handle Input Changes
  const handleUserChange = (field: keyof UserInfo, value: string) => {
    setUserInfo(prev => {
      const updated = { ...prev, [field]: value };
      // Reset grade khi đổi cấp học giữa bậc phổ thông và bậc cao
      if (field === 'level') {
        const wasHigherEd = HIGHER_ED_LEVELS.includes(prev.level);
        const isHigherEd = HIGHER_ED_LEVELS.includes(value as string);
        if (wasHigherEd !== isHigherEd) {
          updated.grade = '';
        }
      }
      return updated;
    });
  };

  // Handle Manual Document Edit
  const handleDocumentUpdate = (newContent: string) => {
    setState(prev => ({ ...prev, fullDocument: newContent }));
  };

  // Handle Manual Outline Submission (Skip Generation)
  const handleManualOutlineSubmit = (content: string) => {
    if (!apiKey) {
      setShowApiModal(true);
      return;
    }

    // Initialize chat session silently so it's ready for next steps
    initializeGeminiChat(apiKey, selectedModel);

    setState(prev => ({
      ...prev,
      fullDocument: content,
      step: GenerationStep.OUTLINE, // Go to Outline step so user can Review/Confirm
      isStreaming: false,
      error: null
    }));
  };

  // Start the Generation Process
  const startGeneration = async () => {
    if (!apiKey) {
      setShowApiModal(true);
      return;
    }

    try {
      setState(prev => ({ ...prev, step: GenerationStep.OUTLINE, isStreaming: true, error: null }));

      initializeGeminiChat(apiKey, selectedModel);

      const isHigherEd = HIGHER_ED_LEVELS.includes(userInfo.level);
      const learnerTerm = isHigherEd ? 'sinh viên' : 'học sinh';
      const teacherTerm = isHigherEd ? 'giảng viên' : 'giáo viên';
      const schoolTerm = isHigherEd ? 'trường/học viện' : 'trường';
      const textbookTerm = isHigherEd ? 'giáo trình' : 'SGK';

      const initMessage = `
Bạn là chuyên gia giáo dục cấp quốc gia, có 20 + năm kinh nghiệm viết, thẩm định và chấm điểm Sáng kiến Kinh nghiệm(SKKN) đạt giải cấp Bộ, cấp tỉnh tại Việt Nam.
  ${isHigherEd ? `
⚠️ LƯU Ý QUAN TRỌNG: Đây là SKKN dành cho BẬC ${userInfo.level.toUpperCase()} - KHÔNG PHẢI PHỔ THÔNG.
Phải sử dụng thuật ngữ phù hợp: "sinh viên" thay "học sinh", "giảng viên" thay "giáo viên", "giáo trình" thay "SGK", v.v.
` : ''
        }
NHIỆM VỤ CỦA BẠN:
Lập DÀN Ý CHI TIẾT cho một đề tài SKKN dựa trên thông tin tôi cung cấp.Dàn ý phải đầy đủ, cụ thể, có độ sâu và đảm bảo 4 tiêu chí: Tính MỚI, Tính KHOA HỌC, Tính KHẢ THI, Tính HIỆU QUẢ.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 10 NGUYÊN TẮC VÀNG CHỐNG ĐẠO VĂN & NÂNG TẦM CHẤT LƯỢNG(BẮT BUỘC TUÂN THỦ NGHIÊM NGẶT):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ CẢNH BÁO: Bạn PHẢI tuân thủ 10 nguyên tắc sau để SKKN có tính "CON NGƯỜI", giọng điệu tự nhiên như một giáo viên thực sự đang viết sáng kiến của chính họ - là tâm huyết và sáng tạo của họ.

1️⃣ KHÔNG SAO CHÉP TRỰC TIẾP(Zero Copy - Paste):
   ❌ SAI: Copy nguyên văn định nghĩa từ Wikipedia, sách giáo khoa.
   ✅ ĐÚNG: Đọc hiểu ý tưởng → Tóm tắt theo tư duy riêng → Viết bằng ngôn ngữ và văn phong riêng biệt.

2️⃣ TƯ DUY VIẾT HOÀN TOÀN MỚI(Unique Thinking):
   ❌ SAI: "Giáo dục là quốc sách hàng đầu", "Thầy cô là người lái đò"(sáo rỗng).
   ✅ ĐÚNG: Viết câu có chiều sâu, phản ánh tư duy cá nhân của người viết.

3️⃣ XỬ LÝ LÝ THUYẾT GIÁO DỤC:
   Công thức: [Diễn giải lý thuyết theo cách mới] + [Ý nghĩa với giáo dục VN hiện tại] + [Liên hệ trực tiếp đề tài tại trường cụ thể].

4️⃣ XỬ LÝ VĂN BẢN PHÁP LUẬT:
   KHÔNG trích dẫn nguyên văn các Điều, Khoản.Hãy TÓM TẮT NỘI HÀM theo cách riêng.

5️⃣ TẠO SỐ LIỆU ĐỘC BẢN & HỢP LÝ:
- Dùng số lẻ tự nhiên(42.3 %, 68.7 %) thay vì số tròn(40 %, 50 %).
   - Tổng tỷ lệ phải = 100 %.Kết quả "Sau" tốt hơn "Trước" nhưng không tuyệt đối hóa.

6️⃣ GIẢI PHÁP CỤ THỂ HÓA:
   ❌ Tránh: "Đổi mới phương pháp dạy học"(chung chung).
   ✅ Phải: Đặt tên giải pháp ấn tượng và cụ thể(VD: "Thiết kế chuỗi hoạt động theo mô hình 5E kết hợp Padlet").

7️⃣ KỸ THUẬT PARAPHRASE 5 CẤP ĐỘ:
1. Thay đổi từ vựng(Học sinh → Người học, Giáo viên → Nhà giáo dục).
   2. Đổi cấu trúc câu chủ động ↔ bị động.
   3. Kết hợp 2 - 3 câu đơn thành câu phức.
   4. Thêm trạng từ / tính từ biểu cảm.
   5. Đảo ngữ nhấn mạnh.

8️⃣ CẤU TRÚC CÂU PHỨC HỢP:
   Ưu tiên câu ghép, câu phức có nhiều mệnh đề để thể hiện tư duy logic chặt chẽ.

9️⃣ NGÔN NGỮ CHUYÊN NGÀNH:
   Sử dụng từ khóa "đắt" giá: Hiện thực hóa, Tối ưu hóa, Cá nhân hóa, Tích hợp liên môn, Phẩm chất cốt lõi, Năng lực đặc thù, Tư duy đa chiều, Chuyển đổi số, Hệ sinh thái học tập...

🔟 TỰ KIỂM TRA:
   Trong quá trình viết, liên tục tự hỏi: "Đoạn này có quá giống văn mẫu không?".Nếu có → Viết lại ngay.

💡 GIỌNG ĐIỆU YÊU CẦU:
- Viết như một GIÁO VIÊN THỰC SỰ đang chia sẻ sáng kiến của chính mình.
- Thể hiện TÂM HUYẾT, TRĂN TRỞ với nghề và với học sinh.
- Dùng ngôn ngữ TỰ NHIÊN, CHÂN THÀNH, không máy móc hay khuôn mẫu.
- Xen kẽ những suy nghĩ cá nhân, những quan sát thực tế từ lớp học.

BẮT ĐẦU phản hồi bằng MENU NAVIGATION trạng thái Bước 2(Lập Dàn Ý - Đang thực hiện).

  ${isHigherEd ? HIGHER_ED_SYSTEM_INSTRUCTION : ''}

${OUTLINE_GUIDE}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THÔNG TIN ĐỀ TÀI:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Tên đề tài: ${userInfo.topic}
• Môn học / Lĩnh vực: ${userInfo.subject}${(() => {
          const info = getSubjectInfo(userInfo.subject); return info ? `
  → Nhóm: ${info.group}
  → Đặc trưng: ${info.description}
  → Hãy viết nội dung SKKN bám sát đặc thù lĩnh vực "${info.name}" thuộc nhóm "${info.group}"` : '';
        })()
        }
• Cấp học: ${userInfo.level}
• Khối lớp / Đối tượng: ${userInfo.grade}
• Tên ${schoolTerm}: ${userInfo.school}
• Địa điểm: ${userInfo.location}
• Điều kiện CSVC: ${userInfo.facilities}
• ${textbookTerm}: ${userInfo.textbook || "Không đề cập"}
• Đối tượng nghiên cứu: ${userInfo.researchSubjects || (isHigherEd ? "Sinh viên tại đơn vị" : "Học sinh tại đơn vị")}
• Thời gian thực hiện: ${userInfo.timeframe || "Năm học hiện tại"}
• Đặc thù / Công nghệ / AI: ${userInfo.applyAI ? userInfo.applyAI : ''} ${userInfo.focus ? `- ${userInfo.focus}` : ''}

${userInfo.referenceDocuments ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TÀI LIỆU THAM KHẢO (DO GIÁO VIÊN CUNG CẤP):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Dưới đây là nội dung các tài liệu tham khảo mà giáo viên đã tải lên. BẮT BUỘC phải bám sát vào nội dung này để viết SKKN phù hợp và chính xác:

${truncateForPrompt(userInfo.referenceDocuments)}

[HẾT TÀI LIỆU THAM KHẢO]
` : ''
        }

${userInfo.customTemplate ? getCustomTemplatePrompt() : (userInfo.skknTemplate ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨🚨🚨 MẪU YÊU CẦU SKKN TỪ SỞ/PHÒNG GD (BẮT BUỘC TUYỆT ĐỐI) 🚨🚨🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ CẢNH BÁO QUAN TRỌNG NHẤT: Giáo viên đã cung cấp MẪU YÊU CẦU SKKN chính thức bên dưới.

🚫 BẠN TUYỆT ĐỐI KHÔNG ĐƯỢC sử dụng bất kỳ cấu trúc SKKN mặc định/chuẩn nào.
✅ BẠN BẮT BUỘC PHẢI viết HOÀN TOÀN theo cấu trúc và mẫu này:

1. Tạo dàn ý và viết nội dung ĐÚNG CHÍNH XÁC theo cấu trúc, các mục, các phần trong mẫu này
2. Tuân theo ĐÚNG trình tự, tên gọi, cách đánh số các mục như trong mẫu
3. KHÔNG tự ý thay đổi tên mục, KHÔNG bỏ qua mục nào, KHÔNG thêm mục nếu mẫu không yêu cầu
4. KHÔNG sử dụng cấu trúc "Phần I, II, III, IV, V, VI" mặc định nếu mẫu có cấu trúc khác
5. Số lượng giải pháp, tên các phần lớn, thứ tự trình bày ĐỀU PHẢI theo mẫu này
6. Viết đúng theo format và quy cách mẫu đề ra

NỘI DUNG MẪU SKKN (ĐÂY LÀ CẤU TRÚC DUY NHẤT ĐƯỢC PHÉP SỬ DỤNG):
${userInfo.skknTemplate}

[HẾT MẪU SKKN - MỌI NỘI DUNG PHẢI TUÂN THỦ CẤU TRÚC TRÊN]
` : '')
        }

${userInfo.specialRequirements ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 YÊU CẦU ĐẶC BIỆT TỪ GIÁO VIÊN (BẮT BUỘC THỰC HIỆN):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ QUAN TRỌNG: Giáo viên đã đưa ra các yêu cầu đặc biệt sau.
BẠN BẮT BUỘC PHẢI TUÂN THỦ NGHIÊM NGẶT:

${userInfo.specialRequirements}

Hãy phân tích kỹ các yêu cầu trên và áp dụng CHÍNH XÁC vào toàn bộ bài viết.

📌 HƯỚNG DẪN XỬ LÝ GIỚI HẠN SỐ TRANG:
- Nếu yêu cầu "giới hạn X trang" → Số trang này tính từ PHẦN I & II đến hết PHẦN V, VI & KẾT LUẬN
- KHÔNG tính dàn ý vào giới hạn số trang
- KHÔNG tính Phụ lục vào giới hạn số trang (Phụ lục được tạo riêng, không giới hạn)
- Phân bổ số trang hợp lý cho NỘI DUNG CHÍNH (không tính Phụ lục):
  + Phần I & II: TỐI ĐA 4 trang (khoảng 10%)
  + Phần III (Thực trạng): TỐI ĐA 3 trang (khoảng 7-8%)
  + Phần IV (Giải pháp): khoảng 55-65% tổng số trang (phần quan trọng nhất)
  + Phần V, VI & Kết luận: khoảng 15-20% tổng số trang

Ví dụ: Nếu giới hạn 40 trang (KHÔNG tính Phụ lục):
  + Phần I & II: 3-4 trang (TỐI ĐA 4 trang)
  + Phần III: 2-3 trang (TỐI ĐA 3 trang)
  + Phần IV: 24-28 trang
  + Phần V, VI & Kết luận: 6-8 trang
  + Phụ lục: TÍNH RIÊNG (không giới hạn)

Các yêu cầu khác:
- Nếu yêu cầu "viết ngắn gọn phần lý thuyết" → Tóm tắt cô đọng phần cơ sở lý luận
- Nếu yêu cầu "thêm nhiều bài toán thực tế" → Bổ sung ví dụ toán thực tế phong phú
- Nếu yêu cầu "tập trung vào giải pháp" → Ưu tiên phần IV với nhiều chi tiết hơn

[HẾT YÊU CẦU ĐẶC BIỆT]
` : ''
        }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ YÊU CẦU ĐỊNH DẠNG OUTPUT(BẮT BUỘC):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. SAU MỖI CÂU: Phải xuống dòng(Enter 2 lần).
2. SAU MỖI ĐOẠN: Cách 1 dòng trống.
3. KHÔNG viết dính liền(wall of text).
4. Sử dụng gạch đầu dòng và tiêu đề rõ ràng.

  ${(userInfo.skknTemplate || userInfo.customTemplate) ? '' : (isHigherEd ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CẤU TRÚC SKKN BẬC CAO (TRUNG CẤP / CAO ĐẲNG / ĐẠI HỌC):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 MÔ TẢ SÁNG KIẾN

1. BỐI CẢNH VÀ LÝ DO NGHIÊN CỨU (3-4 trang)

   1.1. Bối cảnh giáo dục đại học Việt Nam hiện nay
        → Nghị quyết 29-NQ/TW về đổi mới căn bản, toàn diện giáo dục
        → Luật Giáo dục đại học 2018 (sửa đổi 2024)
        → Yêu cầu đổi mới phương pháp giảng dạy ${userInfo.subject} bậc ${userInfo.level}
        → Xu hướng chuyển đổi số, chuẩn đầu ra CDIO/ABET
        → Cách mạng công nghiệp 4.0 và yêu cầu nguồn nhân lực chất lượng cao
        
   1.2. Xuất phát từ thực tiễn giảng dạy
        → Thực trạng giảng dạy ${userInfo.subject} tại ${userInfo.school}
        → Đặc điểm ${userInfo.grade}: năng lực đầu vào, động lực học tập
        → Hạn chế của phương pháp giảng dạy truyền thống ở bậc ${userInfo.level}
        → Khoảng cách giữa đào tạo và nhu cầu thị trường lao động

2. TỔNG QUAN TÀI LIỆU & CƠ SỞ LÝ LUẬN (5-7 trang)

   2.1. Tổng quan nghiên cứu (Literature Review)
        → Các nghiên cứu trong nước liên quan (ít nhất 3-5 nghiên cứu)
        → Các nghiên cứu quốc tế liên quan (ít nhất 3-5 nghiên cứu)
        → Phân tích khoảng trống nghiên cứu (Research Gap)
        → Trích dẫn chuẩn APA: (Tác giả, Năm)
        
   2.2. Khung lý thuyết (Theoretical Framework)
        → Andragogy - Lý thuyết học tập người lớn (Knowles)
        → Experiential Learning - Học qua trải nghiệm (Kolb)
        → Constructive Alignment - Căn chỉnh kiến tạo (Biggs)
        → Bloom's Taxonomy bậc cao (Analyze, Evaluate, Create)
        → Outcome-based Education (OBE)
        [Phân tích sâu + Liên hệ đề tài tại ${userInfo.school}]
        
   2.3. Cơ sở pháp lý
        → Luật Giáo dục đại học 2018, sửa đổi bổ sung
        → Thông tư quy định về chuẩn chương trình đào tạo
        → Quy chế đào tạo trình độ ${userInfo.level}

3. PHÂN TÍCH HIỆN TRẠNG & ĐÁNH GIÁ NHU CẦU (5-6 trang)

   3.1. Hiện trạng tổng quan
        → Điều kiện CSVC tại ${userInfo.school} (${userInfo.facilities})
        → Đặc thù đào tạo ngành/chuyên ngành liên quan
        → Chuẩn đầu ra chương trình đào tạo hiện hành
        
   3.2. Khảo sát giảng viên
        → Bảng khảo sát giảng viên (n=X, sử dụng thang Likert 5 điểm)
        → Phương pháp giảng dạy hiện tại
        → Thuận lợi - Khó khăn trong giảng dạy bậc ${userInfo.level}
        → Cronbach's Alpha kiểm tra độ tin cậy
        
   3.3. Khảo sát sinh viên
        → Bảng khảo sát sinh viên ${userInfo.grade} (n=Y)  
        → Kết quả học tập trước khi áp dụng sáng kiến
        → Mức độ hài lòng, động lực học tập
        → Kỹ năng tự học, nghiên cứu
        → Nhu cầu đổi mới phương pháp
        
   → Phân tích nguyên nhân bằng mô hình Fishbone/SWOT

4. CÁC GIẢI PHÁP, BIỆN PHÁP THỰC HIỆN (12-18 trang - PHẦN QUAN TRỌNG NHẤT)

   ⚠️ MỖI GIẢI PHÁP PHẢI CÓ CƠ SỞ NGHIÊN CỨU KHOA HỌC RÕ RÀNG.

   GIẢI PHÁP 1: [Tên giải pháp - dựa trên nghiên cứu khoa học]
   
        1.1. Mục tiêu giải pháp (gắn với Chuẩn đầu ra / Learning Outcomes)
             → Mục tiêu về kiến thức chuyên ngành
             → Mục tiêu về năng lực nghề nghiệp
             → Mục tiêu về kỹ năng mềm, tư duy phản biện
             
        1.2. Cơ sở khoa học & Nghiên cứu liên quan
             → Trích dẫn 2-3 nghiên cứu hỗ trợ (APA)
             → Phân tích mô hình quốc tế tương tự
             → Điểm mới, sáng tạo so với nghiên cứu trước
             
        1.3. Thiết kế nghiên cứu & Quy trình
             → Thiết kế: thực nghiệm/bán thực nghiệm/nghiên cứu hành động
             → Nhóm thực nghiệm (n=?) và nhóm đối chứng (n=?)
             → Quy trình thực hiện chi tiết (5-7 bước)
             → Công cụ đánh giá: rubric, bài thi, khảo sát
             
        1.4. Ví dụ minh họa cụ thể
             → Bài giảng/học phần cụ thể trong giáo trình ${userInfo.textbook || "hiện hành"}
             → Hoạt động giảng dạy chi tiết
             → Sản phẩm sinh viên mẫu / Đồ án / Tiểu luận
             
        1.5. Điều kiện thực hiện & Hạn chế
             → Yêu cầu về CSVC (tận dụng ${userInfo.facilities})
             → Hạn chế của phương pháp (phản biện)
             → Điều kiện nhân rộng

   GIẢI PHÁP 2: [Tên giải pháp - dựa trên nghiên cứu khoa học]
        [Cấu trúc tương tự, triển khai đầy đủ 5 mục]

   GIẢI PHÁP 3: [Tên giải pháp - dựa trên nghiên cứu khoa học]
        [Cấu trúc tương tự, triển khai đầy đủ 5 mục]
   ${(userInfo.numSolutions || 3) > 3 ? `
   GIẢI PHÁP 4: [Tên giải pháp nâng cao - ứng dụng công nghệ]
        [Giải pháp tích hợp LMS, AI, Virtual Lab...]
   ${(userInfo.numSolutions || 3) > 4 ? `
   GIẢI PHÁP 5: [Tên giải pháp phát triển - hợp tác doanh nghiệp]
        [Giải pháp gắn kết đào tạo với thị trường lao động]
   ` : ''}
   ` : ''}
   → MỐI LIÊN HỆ HỆ THỐNG GIỮA CÁC GIẢI PHÁP

5. KẾT QUẢ NGHIÊN CỨU & ĐÁNH GIÁ (5-6 trang)

   5.1. Mục đích & Phương pháp đánh giá
        → Thiết kế thực nghiệm: Pre-test / Post-test
        → Công cụ thu thập dữ liệu: Bài thi, bảng hỏi Likert, phỏng vấn sâu
        
   5.2. Kết quả định lượng
        → Đối tượng: ${userInfo.researchSubjects || "Sinh viên tại đơn vị"}
        → Thời gian: ${userInfo.timeframe || "Năm học hiện tại"}
        → Bảng kết quả kèm phân tích thống kê (Mean, SD, t-value, p-value)
        → Effect size (Cohen's d)
        → Biểu đồ so sánh nhóm thực nghiệm vs đối chứng
        
   5.3. Kết quả định tính
        → Phỏng vấn sinh viên, giảng viên
        → Quan sát lớp học / giảng đường
        → Phân tích sản phẩm sinh viên
        → Ý kiến phản hồi từ chuyên gia, đồng nghiệp

6. ĐIỀU KIỆN NHÂN RỘNG & PHÁT TRIỂN (1-2 trang)

   → Điều kiện về CSVC, công nghệ
   → Điều kiện về năng lực giảng viên, bồi dưỡng
   → Phạm vi áp dụng: các trường ${userInfo.level} khác
   → Hướng nghiên cứu phát triển tiếp theo

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 KẾT LUẬN VÀ KHUYẾN NGHỊ (2-3 trang)

1. Kết luận
   → Tóm tắt đóng góp chính của sáng kiến
   → Tính mới và giá trị khoa học
   → Giá trị thực tiễn cho đào tạo bậc ${userInfo.level}

2. Khuyến nghị  
   → Với nhà trường / Ban giám hiệu
   → Với khoa / bộ môn
   → Với giảng viên
   → Với Bộ GD&ĐT / Hội đồng khoa học
   → Hướng nghiên cứu phát triển tiếp

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📚 TÀI LIỆU THAM KHẢO
   → Liệt kê 10-15 tài liệu theo chuẩn APA (gồm tiếng Việt và tiếng Anh)

📎 PHỤ LỤC
   → Phiếu khảo sát (Likert scale)
   → Đề cương bài giảng minh họa
   → Rubric đánh giá
   → Sản phẩm sinh viên
   → Kết quả phân tích thống kê chi tiết
` : `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CẤU TRÚC SKKN CHUẨN (ÁP DỤNG KHI KHÔNG CÓ MẪU RIÊNG):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 MÔ TẢ SÁNG KIẾN

1. HOÀN CẢNH NẢY SINH SÁNG KIẾN (3-4 trang)

   1.1. Xuất phát từ mục tiêu của giáo dục Việt Nam trong thời kì hiện nay
        → Nghị quyết 29-NQ/TW về đổi mới căn bản, toàn diện giáo dục
        → Chương trình GDPT 2018 - định hướng phát triển năng lực, phẩm chất
        → Yêu cầu đổi mới dạy học môn ${userInfo.subject}
        → Xu hướng chuyển đổi số trong giáo dục
        
   1.2. Xuất phát từ thực tiễn dạy - học hiện nay
        → Thực trạng dạy học môn ${userInfo.subject} tại ${userInfo.school}
        → Khó khăn, thách thức của học sinh ${userInfo.grade}
        → Hạn chế của phương pháp dạy học truyền thống
        → Nhu cầu cấp thiết đổi mới để nâng cao chất lượng

2. CƠ SỞ LÝ LUẬN CỦA VẤN ĐỀ (4-5 trang)

   2.1. Các khái niệm cơ bản liên quan đến đề tài
        → Định nghĩa, thuật ngữ then chốt (DIỄN GIẢI theo cách riêng, không copy)
        
   2.2. Cơ sở pháp lý (TÓM TẮT TINH THẦN, không trích nguyên văn)
        → Luật Giáo dục 2019
        → Thông tư hướng dẫn liên quan
        → Công văn chỉ đạo của Bộ/Sở GD&ĐT
        
   2.3. Cơ sở lý luận giáo dục (Chọn 2-3 lý thuyết PHÙ HỢP)
        → Lý thuyết kiến tạo (Piaget, Vygotsky)
        → Lý thuyết học tập qua trải nghiệm (Kolb)
        → Dạy học phát triển năng lực
        [Diễn giải LÍ THUYẾT + Liên hệ đề tài tại ${userInfo.school}]

3. THỰC TRẠNG VẤN ĐỀ CẦN NGHIÊN CỨU (5-6 trang)

   3.1. Thực trạng chung
        → Điều kiện CSVC tại ${userInfo.school} (${userInfo.facilities})
        → Đặc điểm địa phương ${userInfo.location}
        → Xu hướng dạy học hiện nay
        
   3.2. Thực trạng đối với giáo viên
        → Bảng khảo sát giáo viên (n=X)
        → Thuận lợi - Khó khăn trong giảng dạy
        → Phương pháp đang sử dụng
        
   3.3. Thực trạng đối với học sinh
        → Bảng khảo sát học sinh ${userInfo.grade} (n=Y)  
        → Kết quả học tập trước khi áp dụng sáng kiến
        → Thái độ, hứng thú với môn học
        → Những khó khăn học sinh gặp phải
        
   → Phân tích nguyên nhân (khách quan + chủ quan)

4. CÁC GIẢI PHÁP, BIỆN PHÁP THỰC HIỆN (12-15 trang - PHẦN QUAN TRỌNG NHẤT)

   ⚠️ CHỈ ĐỀ XUẤT 3 GIẢI PHÁP TRỌNG TÂM, ĐẶC SẮC NHẤT - làm hoàn thiện, chỉn chu từng giải pháp.

   GIẢI PHÁP 1: [Tên giải pháp cụ thể, ấn tượng]
   
        1.1. Mục tiêu của giải pháp
             → Mục tiêu về kiến thức
             → Mục tiêu về năng lực
             → Mục tiêu về phẩm chất
             
        1.2. Nội dung và cách thực hiện
             → Mô tả chi tiết bản chất giải pháp
             → Cơ sở khoa học của giải pháp
             → Điểm mới, sáng tạo
             
        1.3. Quy trình thực hiện (5-7 bước cụ thể)
             Bước 1: [Tên bước] - [Chi tiết cách làm]
             Bước 2: [Tên bước] - [Chi tiết cách làm]
             Bước 3: [Tên bước] - [Chi tiết cách làm]
             Bước 4: [Tên bước] - [Chi tiết cách làm]
             Bước 5: [Tên bước] - [Chi tiết cách làm]
             
        1.4. Ví dụ minh họa cụ thể
             → Bài học trong SGK ${userInfo.textbook || "hiện hành"}
             → Hoạt động chi tiết với thời lượng
             → Sản phẩm học sinh mẫu
             
        1.5. Điều kiện thực hiện & Lưu ý
             → Yêu cầu về CSVC (tận dụng ${userInfo.facilities})
             → Điều kiện thành công
             → Những lưu ý quan trọng

   GIẢI PHÁP 2: [Tên giải pháp cụ thể, ấn tượng]
        [Cấu trúc tương tự giải pháp 1, triển khai đầy đủ 5 mục]

   GIẢI PHÁP 3: [Tên giải pháp cụ thể, ấn tượng]
        [Cấu trúc tương tự giải pháp 1, triển khai đầy đủ 5 mục]
   ${(userInfo.numSolutions || 3) > 3 ? `
   GIẢI PHÁP 4: [Tên giải pháp mở rộng/nâng cao]
        [Giải pháp bổ trợ, ứng dụng công nghệ nâng cao]
   ${(userInfo.numSolutions || 3) > 4 ? `
   GIẢI PHÁP 5: [Tên giải pháp mở rộng/nâng cao]
        [Giải pháp phát triển, mở rộng đối tượng áp dụng]
   ` : ''}
   ` : ''}
   → MỐI LIÊN HỆ GIỮA CÁC GIẢI PHÁP (giải thích tính hệ thống, logic)

5. KẾT QUẢ ĐẠT ĐƯỢC (4-5 trang)

   5.1. Mục đích thực nghiệm
        → Kiểm chứng tính hiệu quả của sáng kiến
        → Đánh giá mức độ phù hợp với thực tiễn
        
   5.2. Nội dung thực nghiệm
        → Đối tượng: ${userInfo.researchSubjects || "Học sinh tại đơn vị"}
        → Thời gian: ${userInfo.timeframe || "Năm học hiện tại"}
        → Phạm vi áp dụng
        
   5.3. Tổ chức thực nghiệm
        → Bảng so sánh kết quả TRƯỚC - SAU (dùng số liệu lẻ: 42.3%, 67.8%)
        → Biểu đồ minh họa
        → Phân tích, nhận xét kết quả
        → Ý kiến phản hồi từ học sinh, đồng nghiệp

6. ĐIỀU KIỆN ĐỂ SÁNG KIẾN ĐƯỢC NHÂN RỘNG (1-2 trang)

   → Điều kiện về CSVC
   → Điều kiện về năng lực giáo viên
   → Điều kiện về đối tượng học sinh
   → Khả năng áp dụng tại các trường khác

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 KẾT LUẬN VÀ KHUYẾN NGHỊ (2-3 trang)

1. Kết luận
   → Tóm tắt những đóng góp chính của sáng kiến
   → Điểm mới, điểm sáng tạo
   → Giá trị thực tiễn

2. Khuyến nghị  
   → Với nhà trường
   → Với tổ chuyên môn
   → Với giáo viên
   → Với Phòng/Sở GD&ĐT
   → Hướng phát triển tiếp theo

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📚 TÀI LIỆU THAM KHẢO
   → Liệt kê 8-12 tài liệu theo chuẩn trích dẫn

📎 PHỤ LỤC
   → Phiếu khảo sát
   → Giáo án minh họa
   → Hình ảnh hoạt động
   → Sản phẩm học sinh
`)
        }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YÊU CẦU DÀN Ý(NGẮN GỌN - CHỈ ĐẦU MỤC):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ QUAN TRỌNG: Dàn ý phải NGẮN GỌN, chỉ liệt kê CÁC ĐẦU MỤC CHÍNH.
Nội dung chi tiết sẽ được triển khai ở các bước viết sau.

✓ ${userInfo.numSolutions || 3} GIẢI PHÁP - liệt kê TÊN giải pháp, không triển khai chi tiết
✓ Mỗi phần chỉ ghi tiêu đề mục và các ý chính(1 - 2 dòng mỗi ý)
✓ KHÔNG viết đoạn văn dài trong dàn ý
✓ KHÔNG triển khai chi tiết nội dung - chỉ gợi ý hướng đi
✓ Gợi ý danh sách phụ lục cần tạo(dựa trên các giải pháp)
✓ Phù hợp với đặc thù môn ${userInfo.subject} và cấp ${userInfo.level}
${isHigherEd ? `✓ SỬ DỤNG THUẬT NGỮ BẬC CAO: "sinh viên", "giảng viên", "giáo trình", "học phần", "chuẩn đầu ra"
✓ Giải pháp phải có CƠ SỞ NGHIÊN CỨU KHOA HỌC, trích dẫn APA
✓ Cấu trúc chặt chẽ hơn: có Literature Review, Thiết kế nghiên cứu, Phân tích thống kê` : ''
        }
✓ Có thể triển khai ngay ở các bước sau

${getPageLimitPrompt() ? `
${getPageLimitPrompt()}

📋 LƯU Ý KHI LẬP DÀN Ý VỚI GIỚI HẠN TRANG:
- Dàn ý phải TƯƠNG XỨNG với số trang cho phép
- Nếu ít trang (≤25): Giảm số mục con, mỗi giải pháp chỉ 3-4 ý chính
- Nếu trung bình (25-40): Số mục con vừa phải, mỗi giải pháp 5-6 ý chính
- Nếu nhiều trang (>40): Có thể mở rộng, mỗi giải pháp 6-8 ý chính
- Đảm bảo dàn ý phản ánh đúng quy mô nội dung sẽ viết
` : ''
        }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ĐỊNH DẠNG ĐẦU RA:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Trình bày theo cấu trúc phân cấp rõ ràng(Markdown):
1. TÊN PHẦN LỚN
1.1.Tên mục nhỏ
        • Ý chi tiết 1
        • Ý chi tiết 2


Sử dụng icon để dễ nhìn: ✓ → • ○ ▪ ■

QUAN TRỌNG:
1. HIỂN THỊ "📱 MENU NAVIGATION" ĐẦU TIÊN(Bước 2: Đang thực hiện).
2. Cuối dàn ý, hiển thị hộp thoại xác nhận:
┌─────────────────────────────────┐
│ ✅ Đồng ý dàn ý này ?            │
│ ✏️ Bạn có thể CHỈNH SỬA trực   │
│    tiếp bằng nút "Chỉnh sửa"    │
└─────────────────────────────────┘
`;

      let generatedText = "";
      await sendMessageStream(initMessage, (chunk) => {
        generatedText += chunk;
        setState(prev => ({
          ...prev,
          fullDocument: generatedText // Initial document is just the outline
        }));
      });

      setState(prev => ({ ...prev, isStreaming: false }));

    } catch (error: any) {
      // Thử xoay API key nếu lỗi quota/rate limit
      const errorType = parseApiError(error);
      if (errorType === 'QUOTA_EXCEEDED' || errorType === 'RATE_LIMIT') {
        const rotation = apiKeyManager.markKeyError(apiKey, errorType);
        if (rotation.success && rotation.newKey) {
          console.log(`🔄 Tự động xoay key: ${rotation.message} `);
          setApiKey(rotation.newKey);
          localStorage.setItem('gemini_api_key', rotation.newKey);
          initializeGeminiChat(rotation.newKey, selectedModel);
          // Tự động thử lại với key mới
          setState(prev => ({ ...prev, isStreaming: false, error: null }));
          setTimeout(() => startGeneration(), 500);
          return;
        }
      }
      setState(prev => ({ ...prev, isStreaming: false, error: error.message || "Failed to generate." }));
    }
  };

  // Regenerate Outline based on feedback
  const regenerateOutline = async () => {
    if (!outlineFeedback.trim()) return;

    try {
      setState(prev => ({ ...prev, isStreaming: true, error: null, fullDocument: '' }));

      const feedbackMessage = `
      BẮT ĐẦU phản hồi bằng MENU NAVIGATION trạng thái Bước 2(Lập Dàn Ý - Đang thực hiện).

      Dựa trên dàn ý đã lập, người dùng có yêu cầu chỉnh sửa sau:
"${outlineFeedback}"
      
      Hãy viết lại TOÀN BỘ Dàn ý chi tiết mới đã được cập nhật theo yêu cầu trên. 
      Vẫn đảm bảo cấu trúc chuẩn SKKN.
      
      Lưu ý các quy tắc định dạng:
- Xuống dòng sau mỗi câu.
      - Tách đoạn rõ ràng.
      
      Kết thúc phần dàn ý, hãy xuống dòng và hiển thị hộp thoại:
      ┌─────────────────────────────────┐
      │ ✅ Đồng ý dàn ý này ?            │
      │ ✏️ Bạn có thể CHỈNH SỬA trực   │
      │    tiếp bằng nút "Chỉnh sửa"    │
      └─────────────────────────────────┘
`;

      let generatedText = "";
      await sendMessageStream(feedbackMessage, (chunk) => {
        generatedText += chunk;
        setState(prev => ({
          ...prev,
          fullDocument: generatedText
        }));
      });

      setState(prev => ({ ...prev, isStreaming: false }));
      setOutlineFeedback(""); // Clear feedback after sending

    } catch (error: any) {
      setState(prev => ({ ...prev, isStreaming: false, error: error.message }));
    }
  };

  // Generate Next Section
  const generateNextSection = async () => {
    let currentStepPrompt = "";
    let nextStepEnum = GenerationStep.PART_I_II;
    let shouldAppend = true; // Mặc định append nội dung vào fullDocument

    // Logic for OUTLINE step specifically handles manual edits synchronization
    if (state.step === GenerationStep.OUTLINE) {
      if (isCustomFlow) {
        const firstSection = validCustomSections[0];
        currentStepPrompt = `
BẮT ĐẦU phản hồi bằng MENU NAVIGATION trạng thái Bước 3(Viết ${firstSection.title} - Đang thực hiện).

Đây là bản DÀN Ý CHÍNH THỨC mà tôi đã chốt:
---
  ${state.fullDocument}
---

  NHIỆM VỤ TIẾP THEO:
Hãy bắt tay vào viết chi tiết phần đầu tiên theo cấu trúc mẫu: ** ${firstSection.title}**.

⚠️ BÁM SÁT MẪU YÊU CẦU:
Phần này trong mẫu gốc được định nghĩa là: ${firstSection.suggestedContent || "Không có hướng dẫn phụ"}

${SOLUTION_MODE_PROMPT}

⚠️ LƯU Ý FORMAT:
- Viết từng câu xuống dòng riêng.
- Tách đoạn rõ ràng.
- Đảm bảo mạch lạc, ngôn ngữ học thuật.
- KHÔNG viết dính chữ.

  ${getPageLimitPrompt()}
`;
        nextStepEnum = 2; // Step 2 is the first dynamic section
      } else {
        // We inject the CURRENT fullDocument (which might have been edited by user) into the prompt
        // This ensures the AI uses the user's finalized outline.
        currentStepPrompt = `
        BẮT ĐẦU phản hồi bằng MENU NAVIGATION trạng thái Bước 3(Viết Phần I & II - Đang thực hiện).
        
        Đây là bản DÀN Ý CHÍNH THỨC mà tôi đã chốt(tôi có thể đã chỉnh sửa trực tiếp). 
        Hãy DÙNG CHÍNH XÁC NỘI DUNG NÀY để làm cơ sở triển khai các phần tiếp theo, không tự ý thay đổi cấu trúc của nó:

--- BẮT ĐẦU DÀN Ý CHÍNH THỨC-- -
  ${state.fullDocument}
--- KẾT THÚC DÀN Ý CHÍNH THỨC-- -

  NHIỆM VỤ TIẾP THEO:
        Hãy tiếp tục BƯỚC 3: Viết chi tiết PHẦN I(Đặt vấn đề) và PHẦN II(Cơ sở lý luận).

  ${INTRO_GUIDE}

${THEORY_GUIDE}
        
        ⚠️ LƯU Ý FORMAT:
- Viết từng câu xuống dòng riêng.
        - Tách đoạn rõ ràng.
        - Không viết dính chữ.
        - Menu Navigation: Đánh dấu Bước 2 đã xong(✅), Bước 3 đang làm(🔵).
        
        Viết sâu sắc, học thuật, đúng cấu trúc đã đề ra.Lưu ý bám sát thông tin về trường và địa phương đã cung cấp.

        ⚠️ NHẮC LẠI THÔNG TIN QUAN TRỌNG(BẮT BUỘC BÁM SÁT):
- Cấp học: ${userInfo.level}
- Khối lớp / Đối tượng: ${userInfo.grade}
- Môn học: ${userInfo.subject}
- Trường: ${userInfo.school}
- Địa phương: ${userInfo.location}
        🚫 TUYỆT ĐỐI KHÔNG dùng thông tin của cấp học khác(THPT, THCS...) nếu đề tài là cấp ${userInfo.level} !
  Mọi ví dụ, số liệu, thuật ngữ PHẢI phù hợp với cấp ${userInfo.level}, khối ${userInfo.grade}.

  ${getPageLimitPrompt()}
  ${getSectionPagePrompt('Phần I (Đặt vấn đề) + Phần II (Cơ sở lý luận)', 'partI_II')} `;

        nextStepEnum = GenerationStep.PART_I_II;
      }
    } else if (isCustomFlow && state.step >= 2) {
      const sectionIdx = state.step - 2;
      const appendixStep = 2 + validCustomSections.length;

      if (sectionIdx < validCustomSections.length - 1) {
        // Có phần tiếp theo
        const nextSection = validCustomSections[sectionIdx + 1];
        currentStepPrompt = `
BẮT ĐẦU phản hồi bằng MENU NAVIGATION trạng thái Bước ${state.step + 2} (Viết ${nextSection.title} - Đang thực hiện).

╔═══════════════════════════════════════════════════════════╗
║  THÔNG TIN ĐỀ TÀI (BẮT BUỘC BÁM SÁT)                 ║
╚═══════════════════════════════════════════════════════════╝
Đề tài: "${userInfo.topic}"
Môn: ${userInfo.subject} - Lớp: ${userInfo.grade} - Cấp: ${userInfo.level}
Trường: ${userInfo.school}, ${userInfo.location}
SGK: ${userInfo.textbook}
CSVC: ${userInfo.facilities}

Tiếp tục viết chi tiết nội dung phần tiếp theo của SKKN: **${nextSection.title}**.

(Hướng dẫn từ mẫu gốc: ${nextSection.suggestedContent || "Không có hướng dẫn phụ"})

${SOLUTION_MODE_PROMPT}

⚠️ SỐ LƯỢNG GIẢI PHÁP ĐÃ CHỌN: ${userInfo.numSolutions || 3} GIẢI PHÁP
Nếu phần này liên quan đến mô tả giải pháp/biện pháp, BẮT BUỘC phải viết ĐỦ ${userInfo.numSolutions || 3} giải pháp.
Mỗi giải pháp phải có NỘI DUNG VÀ QUY TRÌNH chi tiết, VÍ DỤ MINH HỌA cụ thể.

${state.fullDocument ? `DÀN Ý ĐÃ DUYỆT (BẮT BUỘC BÁM SÁT):
${state.fullDocument.substring(0, 2000)}

⚠️ Tên giải pháp, cấu trúc PHẢI TRÙNG KHỚP với dàn ý trên.` : ''}

${NATURAL_WRITING_TECHNIQUES}

⚠️ LƯU Ý FORMAT:
- Viết từng câu xuống dòng riêng.
- Tách đoạn rõ ràng.
- Liên kết logic với phần trước đó.
- KHÔNG viết dính chữ.

  ${getPageLimitPrompt()}
`;
        nextStepEnum = state.step + 1;
      } else if (sectionIdx === validCustomSections.length - 1) {
        // Xong section cuối -> Sang Completed
        currentStepPrompt = `
✅ SKKN ĐÃ HOÀN THÀNH!

Bạn đã viết xong toàn bộ nội dung chính của SKKN theo đúng cấu trúc mẫu.

📌 BÂY GIỜ BẠN CÓ THỂ:
1. Xuất file Word để chỉnh sửa chi tiết
2. Tạo PHỤ LỤC chi tiết bằng nút "TẠO PHỤ LỤC"
  `;
        nextStepEnum = appendixStep + 1; // Completed step
        shouldAppend = false;
      }
    } else {
      // Standard flow for other steps
      const nextStepMap: Record<number, { prompt: string, nextStep: GenerationStep, skipAppend?: boolean }> = {
        [GenerationStep.PART_I_II]: {
          prompt: `
              BẮT ĐẦU phản hồi bằng MENU NAVIGATION trạng thái Bước 4(Viết Phần III - Đang thực hiện).

  ${REALITY_GUIDE}

              Tiếp tục BƯỚC 3(tiếp): Viết chi tiết PHẦN III(Thực trạng vấn đề). 
              Nhớ tạo bảng số liệu khảo sát giả định logic phù hợp với đối tượng nghiên cứu là: ${userInfo.researchSubjects || "Học sinh"}.
              Phân tích nguyên nhân và thực trạng tại ${userInfo.school}, ${userInfo.location} và điều kiện CSVC thực tế: ${userInfo.facilities}.
              
              ⚠️ NHẮC LẠI: Đây là SKKN cấp ${userInfo.level}, khối ${userInfo.grade}, môn ${userInfo.subject}.
              Mọi nội dung, ví dụ, số liệu, đối tượng khảo sát PHẢI phù hợp với cấp ${userInfo.level}.
              🚫 TUYỆT ĐỐI KHÔNG nhầm sang THPT, THCS hoặc cấp học khác nếu đề tài không thuộc cấp đó!
              
              ⚠️ LƯU Ý FORMAT:
- Viết từng câu xuống dòng riêng.
              - Tách đoạn rõ ràng.
              - Bảng số liệu phải tuân thủ format Markdown chuẩn: | Tiêu đề | Số liệu |.
              
              🖼️ GỢI Ý HÌNH ẢNH MINH HỌA(BẮT BUỘC):
              Trong phần Thực trạng, hãy gợi ý 1 - 2 vị trí nên đặt hình ảnh minh họa với format:
              ** [🖼️ GỢI Ý HÌNH ẢNH: Mô tả chi tiết hình ảnh cần chụp / tạo - Đặt sau phần nào] **
  Ví dụ:
              ** [🖼️ GỢI Ý HÌNH ẢNH: Biểu đồ cột thể hiện tỉ lệ học sinh yếu / trung bình / khá / giỏi trước khi áp dụng sáng kiến - Đặt sau bảng khảo sát đầu năm] **
              ** [🖼️ GỢI Ý HÌNH ẢNH: Ảnh chụp thực tế lớp học / phòng thí nghiệm tại ${userInfo.school} - Đặt phần đặc điểm nhà trường] **

  ${getPageLimitPrompt()}
  ${getSectionPagePrompt('Phần III (Thực trạng vấn đề)', 'partIII')} `,
          nextStep: GenerationStep.PART_III
        },
        [GenerationStep.PART_III]: {
          // ULTRA MODE INJECTION FOR PART IV START
          prompt: `
              BẮT ĐẦU phản hồi bằng MENU NAVIGATION trạng thái Bước 5(Viết Phần IV - Đang thực hiện).

  ${SOLUTION_MODE_PROMPT}
      
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              🚀 THỰC THI NHIỆM VỤ(PHẦN IV - GIẢI PHÁP 1)
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              
              Thông tin đề tài: "${userInfo.topic}"
Môn: ${userInfo.subject} - Lớp: ${userInfo.grade} - Cấp: ${userInfo.level}
Trường: ${userInfo.school}, ${userInfo.location}
SGK: ${userInfo.textbook}
              Công nghệ / AI: ${userInfo.applyAI}
              CSVC hiện có: ${userInfo.facilities}
              Trọng tâm đề tài: ${userInfo.focus || 'Theo dàn ý đã duyệt'}
              
              ╔═══════════════════════════════════════════════════════╗
              ║  🚨 DÀN Ý ĐÃ DUYỆT - BẮT BUỘC BÁM SÁT 🚨          ║
              ╚═══════════════════════════════════════════════════════╝
              ${state.fullDocument ? `Dưới đây là DÀN Ý ĐÃ ĐƯỢC DUYỆT. Giải pháp 1 PHẢI viết ĐÚNG theo tên và nội dung đã ghi trong dàn ý:
              
${state.fullDocument.substring(0, 3000)}

⚠️ BẮT BUỘC:
- Tên giải pháp PHẢI TRÙNG KHỚP với tên giải pháp trong dàn ý trên.
- Nội dung giải pháp PHẢI xoay quanh đề tài "${userInfo.topic}" và phù hợp với môn ${userInfo.subject}, cấp ${userInfo.level}.
- TUYỆT ĐỐI KHÔNG viết giải pháp lạc đề hoặc không liên quan đến đề tài.
- Mọi ví dụ, bài học minh họa phải thuộc môn ${userInfo.subject}, khối ${userInfo.grade}.` : 'Chưa có dàn ý - viết theo đề tài.'}
              
              YÊU CẦU:
              Hãy viết chi tiết GIẢI PHÁP 1(Giải pháp trọng tâm nhất) tuân thủ nghiêm ngặt 10 NGUYÊN TẮC VÀNG.
              Giải pháp phải khả thi với điều kiện CSVC: ${userInfo.facilities}.
              
              QUAN TRỌNG: Tuân thủ "YÊU CẦU ĐỊNH DẠNG OUTPUT" vừa cung cấp:
1. Xuống dòng sau mỗi câu.
              2. Xuống 2 dòng sau mỗi đoạn.
              3. Sử dụng Format "KẾT THÚC GIẢI PHÁP" ở cuối.
              
              Lưu ý đặc biệt: Phải có VÍ DỤ MINH HỌA(Giáo án / Hoạt động) cụ thể theo SGK ${userInfo.textbook}.
              Menu Navigation: Đánh dấu Bước 5 đang làm(🔵).
              
              🖼️ GỢI Ý HÌNH ẢNH MINH HỌA(BắT BUỘC):
              Trong GIẢI PHÁP 1, hãy gợi ý 1 - 2 vị trí nên đặt hình ảnh minh họa với format:
              ** [🖼️ GỢI Ý HÌNH ẢNH: Mô tả chi tiết hình ảnh - Đặt sau phần nào] **
  Ví dụ gợi ý cho Giải pháp 1:
              ** [🖼️ GỢI Ý HÌNH ẢNH: Sơ đồ quy trình thực hiện giải pháp(5 - 7 bước) dạng flowchart - Đặt đầu mục Quy trình thực hiện] **
              ** [🖼️ GỢI Ý HÌNH ẢNH: Ảnh chụp học sinh thực hiện hoạt động / Ảnh miền họa hoạt động mẫu - Đặt trong phần Ví dụ minh họa] **

  ${getPageLimitPrompt()}
  ${getSectionPagePrompt('Giải pháp 1', 'perSolution')} `,
          nextStep: GenerationStep.PART_IV_SOL1
        },
        [GenerationStep.PART_IV_SOL1]: {
          // Sau khi viết xong GP1 → Chuyển sang REVIEW GP1 (KHÔNG viết GP2 ở đây)
          prompt: `✅ HOÀN THÀNH GIẢI PHÁP 1. Vui lòng xem xét và duyệt trước khi tiếp tục.`,
          nextStep: GenerationStep.PART_IV_SOL1_REVIEW, // Chuyển sang review GP1
          skipAppend: true // Không append vào fullDocument để tránh lặp nội dung
        },
        // GP1 Review → GP2
        [GenerationStep.PART_IV_SOL1_REVIEW]: {
          prompt: `
              BẮT ĐẦU phản hồi bằng MENU NAVIGATION trạng thái(Viết Giải pháp 2 - Đang thực hiện).

              Tiếp tục giữ vững vai trò CHUYÊN GIA GIÁO DỤC(ULTRA MODE).
              
              Nhiệm vụ: Viết chi tiết GIẢI PHÁP 2 cho đề tài: "${userInfo.topic}".
              Môn: ${userInfo.subject} - Lớp: ${userInfo.grade} - Cấp: ${userInfo.level}
              Trường: ${userInfo.school}, ${userInfo.location}
              
              ╔═══════════════════════════════════════════════════════╗
              ║  🚨 NHẮC LẠI DÀN Ý - BẮT BUỘC BÁM SÁT 🚨          ║
              ╚═══════════════════════════════════════════════════════╝
              ⚠️ BẮT BUỘC: Tên GIẢI PHÁP 2 PHẢI TRÙNG KHỚP với tên giải pháp 2 trong dàn ý đã duyệt ở trên.
              Nội dung PHẢI xoay quanh đề tài "${userInfo.topic}", phù hợp môn ${userInfo.subject}.
              TUYỆT ĐỐI KHÔNG viết lạc đề hoặc chuyển sang chủ đề khác.
              
              Yêu cầu:
1. Nội dung độc đáo, KHÔNG trùng lặp với Giải pháp 1.
2. Tận dụng tối đa CSVC: ${userInfo.facilities}.
3. BẮT BUỘC TUÂN THỦ FORMAT "YÊU CẦU ĐỊNH DẠNG OUTPUT":
- Xuống dòng sau mỗi câu.
                 - Xuống 2 dòng sau mỗi đoạn.
                 - Có khung "KẾT THÚC GIẢI PHÁP" ở cuối.
              4. Phải có VÍ DỤ MINH HỌA cụ thể theo SGK ${userInfo.textbook}.
              
              🖼️ GỢI Ý HÌNH ẢNH MINH HỌA(BẮT BUỘC):
              Trong GIẢI PHÁP 2, hãy gợi ý 1 - 2 vị trí nên đặt hình ảnh minh họa với format:
              ** [🖼️ GỢI Ý HÌNH ẢNH: Mô tả chi tiết hình ảnh - Đặt sau phần nào] **

  ${getPageLimitPrompt()}
  ${getSectionPagePrompt('Giải pháp 2', 'perSolution')} `,
          nextStep: GenerationStep.PART_IV_SOL2
        },
        // GP2 → GP2 Review (KHÔNG viết GP3 ở đây)
        [GenerationStep.PART_IV_SOL2]: {
          prompt: `✅ HOÀN THÀNH GIẢI PHÁP 2. Vui lòng xem xét và duyệt trước khi tiếp tục.`,
          nextStep: GenerationStep.PART_IV_SOL2_REVIEW,
          skipAppend: true // Không append vào fullDocument để tránh lặp nội dung
        },
        // GP2 Review → GP3 (Viết GP3 sau khi approve GP2)
        [GenerationStep.PART_IV_SOL2_REVIEW]: {
          prompt: `
              BẮT ĐẦU phản hồi bằng MENU NAVIGATION trạng thái(Viết Giải pháp 3 - Đang thực hiện).

              Tiếp tục giữ vững vai trò CHUYÊN GIA GIÁO DỤC(ULTRA MODE).
              
              Nhiệm vụ: Viết chi tiết GIẢI PHÁP 3 cho đề tài: "${userInfo.topic}".
              Môn: ${userInfo.subject} - Lớp: ${userInfo.grade} - Cấp: ${userInfo.level}
              Trường: ${userInfo.school}, ${userInfo.location}
              
              ╔═══════════════════════════════════════════════════════╗
              ║  🚨 NHẮC LẠI DÀN Ý - BẮT BUỘC BÁM SÁT 🚨          ║
              ╚═══════════════════════════════════════════════════════╝
              ⚠️ BẮT BUỘC: Tên GIẢI PHÁP 3 PHẢI TRÙNG KHỚP với tên giải pháp 3 trong dàn ý đã duyệt.
              Nội dung PHẢI xoay quanh đề tài "${userInfo.topic}", phù hợp môn ${userInfo.subject}.
              TUYỆT ĐỐI KHÔNG viết lạc đề hoặc chuyển sang chủ đề khác.
              
              Yêu cầu:
1. Nội dung độc đáo, KHÔNG trùng lặp với Giải pháp 1 và 2.
2. Tận dụng tối đa CSVC: ${userInfo.facilities}.
3. BẮT BUỘC TUÂN THỦ FORMAT "YÊU CẦU ĐỊNH DẠNG OUTPUT":
- Xuống dòng sau mỗi câu.
                 - Xuống 2 dòng sau mỗi đoạn.
                 - Có khung "KẾT THÚC GIẢI PHÁP" ở cuối.
              4. Phải có VÍ DỤ MINH HỌA cụ thể theo SGK ${userInfo.textbook}.
              
              🖼️ GỢI Ý HÌNH ẢNH MINH HỌA(BẮT BUỘC):
              Trong GIẢI PHÁP 3, hãy gợi ý 1 - 2 vị trí nên đặt hình ảnh minh họa.

  ${getPageLimitPrompt()}
  ${getSectionPagePrompt('Giải pháp 3', 'perSolution')} `,
          nextStep: GenerationStep.PART_IV_SOL3
        },
        // GP3 → GP3 Review (KHÔNG viết GP4 hoặc Phần V-VI ở đây)
        [GenerationStep.PART_IV_SOL3]: {
          prompt: `✅ HOÀN THÀNH GIẢI PHÁP 3. Vui lòng xem xét và duyệt trước khi tiếp tục.`,
          nextStep: GenerationStep.PART_IV_SOL3_REVIEW,
          skipAppend: true // Không append vào fullDocument để tránh lặp nội dung
        },
        // GP3 Review → GP4 hoặc PART_V_VI (Viết sau khi approve GP3)
        [GenerationStep.PART_IV_SOL3_REVIEW]: (userInfo.numSolutions || 3) > 3
          ? {
            prompt: `
                BẮT ĐẦU phản hồi bằng MENU NAVIGATION trạng thái(Viết Giải pháp 4 - Đang thực hiện).

                Tiếp tục giữ vững vai trò CHUYÊN GIA GIÁO DỤC(ULTRA MODE).
                
                Nhiệm vụ: Viết chi tiết GIẢI PHÁP 4(Mở rộng / Nâng cao) cho đề tài: "${userInfo.topic}".
                Môn: ${userInfo.subject} - Lớp: ${userInfo.grade} - Cấp: ${userInfo.level}
                
                ⚠️ BẮT BUỘC: Tên GIẢI PHÁP 4 PHẢI TRÙNG KHỚP với dàn ý đã duyệt.
                Nội dung PHẢI xoay quanh đề tài "${userInfo.topic}", phù hợp môn ${userInfo.subject}.
                
                ⚠️ LƯU Ý: Đây là giải pháp MỞ RỘNG và NÂNG CAO.
                Có thể là: Ứng dụng công nghệ / AI nâng cao, phát triển mở rộng đối tượng...
                
                Yêu cầu:
1. Nội dung độc đáo, KHÔNG trùng lặp với Giải pháp 1, 2, 3.
2. Tận dụng tối đa CSVC: ${userInfo.facilities}.
3. BẮT BUỘC TUÂN THỦ FORMAT.
                4. Phải có VÍ DỤ MINH HỌA cụ thể.

  ${getPageLimitPrompt()}
  ${getSectionPagePrompt('Giải pháp 4', 'perSolution')} `,
            nextStep: GenerationStep.PART_IV_SOL4
          }
          : {
            prompt: `
                BẮT ĐẦU phản hồi bằng MENU NAVIGATION trạng thái(Kết luận & Khuyến nghị - Đang thực hiện).

                Tiếp tục viết:

5. KẾT QUẢ ĐẠT ĐƯỢC(4 - 5 trang):
- 5.1.Mục đích thực nghiệm
  - 5.2.Nội dung thực nghiệm
    - 5.3.Tổ chức thực nghiệm(Bảng so sánh TRƯỚC - SAU với số liệu lẻ)

6. ĐIỀU KIỆN ĐỂ SÁNG KIẾN ĐƯỢC NHÂN RỘNG(1 - 2 trang)
                
                KẾT LUẬN VÀ KHUYẾN NGHỊ(2 - 3 trang)
                
                TÀI LIỆU THAM KHẢO(8 - 12 tài liệu)
                
                Đảm bảo số liệu phần Kết quả phải LOGIC.Sử dụng số liệu lẻ(42.3 %, 67.8 %).
                
                🖼️ GỢI Ý HÌNH ẢNH MINH HỌA.

  ${getPageLimitPrompt()}
  ${getSectionPagePrompt('Kết quả + Kết luận + Khuyến nghị + Tài liệu tham khảo', 'partV_VI')} `,
            nextStep: GenerationStep.PART_V_VI
          },
        // GP4 → GP4 Review (KHÔNG viết GP5 ở đây)
        [GenerationStep.PART_IV_SOL4]: {
          prompt: `✅ HOÀN THÀNH GIẢI PHÁP 4. Vui lòng xem xét và duyệt trước khi tiếp tục.`,
          nextStep: GenerationStep.PART_IV_SOL4_REVIEW,
          skipAppend: true // Không append vào fullDocument để tránh lặp nội dung
        },
        // GP4 Review → GP5 (Viết GP5 sau khi approve GP4)
        [GenerationStep.PART_IV_SOL4_REVIEW]: {
          prompt: `
              BẮT ĐẦU phản hồi bằng MENU NAVIGATION trạng thái(Viết Giải pháp 5 - Đang thực hiện).

              Tiếp tục giữ vững vai trò CHUYÊN GIA GIÁO DỤC(ULTRA MODE).
              
              Nhiệm vụ: Viết chi tiết GIẢI PHÁP 5(Mở rộng / Nâng cao cuối cùng) cho đề tài: "${userInfo.topic}".
              
              ⚠️ LƯU Ý: Đây là giải pháp MỞ RỘNG cuối cùng.
              
              Yêu cầu:
1. Nội dung độc đáo, KHÔNG trùng lặp với các giải pháp trước.
              2. Kết thúc bằng MỐI LIÊN HỆ GIỮA TẤT CẢ 5 GIẢI PHÁP(tính hệ thống, logic).
              3. BẮT BUỘC TUÂN THỦ FORMAT.

  ${getPageLimitPrompt()}
  ${getSectionPagePrompt('Giải pháp 5', 'perSolution')} `,
          nextStep: GenerationStep.PART_IV_SOL5
        },
        // GP5 → GP5 Review (KHÔNG viết Phần V-VI ở đây)
        [GenerationStep.PART_IV_SOL5]: {
          prompt: `✅ HOÀN THÀNH GIẢI PHÁP 5. Vui lòng xem xét và duyệt trước khi tiếp tục.`,
          nextStep: GenerationStep.PART_IV_SOL5_REVIEW,
          skipAppend: true // Không append vào fullDocument để tránh lặp nội dung
        },
        // GP5 Review → PART_V_VI (Viết Phần V-VI sau khi approve GP5)
        [GenerationStep.PART_IV_SOL5_REVIEW]: {
          prompt: `
              BẮT ĐẦU phản hồi bằng MENU NAVIGATION trạng thái(Kết luận & Khuyến nghị - Đang thực hiện).

  ${RESULT_GUIDE}

${CONCLUSION_GUIDE}

              Tiếp tục viết:

5. KẾT QUẢ ĐẠT ĐƯỢC(4 - 5 trang):
- 5.1.Mục đích thực nghiệm
  - 5.2.Nội dung thực nghiệm
    - 5.3.Tổ chức thực nghiệm(Bảng so sánh TRƯỚC - SAU với số liệu lẻ)

6. ĐIỀU KIỆN ĐỂ SÁNG KIẾN ĐƯỢC NHÂN RỘNG(1 - 2 trang)
              
              KẾT LUẬN VÀ KHUYẾN NGHỊ(2 - 3 trang)
              
              TÀI LIỆU THAM KHẢO(8 - 12 tài liệu)
              
              Đảm bảo số liệu phần Kết quả phải LOGIC.Sử dụng số liệu lẻ.
              
              🖼️ GỢI Ý HÌNH ẢNH MINH HỌA.

  ${getPageLimitPrompt()}
  ${getSectionPagePrompt('Kết quả + Kết luận + Khuyến nghị + Tài liệu tham khảo', 'partV_VI')} `,
          nextStep: GenerationStep.PART_V_VI
        },
        // PART_V_VI → COMPLETED
        [GenerationStep.PART_V_VI]: {
          prompt: `
              ✅ SKKN ĐÃ HOÀN THÀNH!
              
              Bạn đã viết xong toàn bộ nội dung chính của SKKN.
              Bao gồm: Đặt vấn đề, Cơ sở lý luận, Thực trạng, Giải pháp, Kết quả và Kết luận.
              
              📌 BÂY GIỜ BẠN CÓ THỂ:
1. Xuất file Word để chỉnh sửa chi tiết
2. Tạo PHỤ LỤC chi tiết bằng nút "TẠO PHỤ LỤC"
3. Kiểm tra lại nội dung và định dạng
              
              Chúc mừng bạn đã hoàn thành bản thảo SKKN!`,
          nextStep: GenerationStep.COMPLETED,
          skipAppend: true // Không append thông báo hoàn thành vào fullDocument
        }
      };
      const stepConfig = nextStepMap[state.step];
      if (!stepConfig) return;
      currentStepPrompt = stepConfig.prompt;
      nextStepEnum = stepConfig.nextStep;
      // Các bước chuyển tiếp (HOÀN THÀNH GP, COMPLETED) không append vào fullDocument
      shouldAppend = !stepConfig.skipAppend;
    }

    if (!currentStepPrompt) return;

    setState(prev => ({ ...prev, isStreaming: true, error: null, step: nextStepEnum }));

    try {
      let sectionText = "\n\n---\n\n"; // Separator
      await sendMessageStream(currentStepPrompt, (chunk) => {
        sectionText += chunk;
        if (shouldAppend) {
          setState(prev => ({
            ...prev,
            fullDocument: prev.fullDocument + chunk
          }));
        }
      });

      // Just set streaming to false, step was already set
      setState(prev => ({ ...prev, isStreaming: false }));

    } catch (error: any) {
      // Thử xoay API key nếu lỗi quota/rate limit
      const errorType = parseApiError(error);
      if (errorType === 'QUOTA_EXCEEDED' || errorType === 'RATE_LIMIT') {
        const rotation = apiKeyManager.markKeyError(apiKey, errorType);
        if (rotation.success && rotation.newKey) {
          console.log(`🔄 Tự động xoay key: ${rotation.message} `);
          setApiKey(rotation.newKey);
          localStorage.setItem('gemini_api_key', rotation.newKey);
          initializeGeminiChat(rotation.newKey, selectedModel);
          // Tự động thử lại với key mới
          setState(prev => ({ ...prev, isStreaming: false, error: null }));
          setTimeout(() => generateNextSection(), 500);
          return;
        }
      }
      setState(prev => ({ ...prev, isStreaming: false, error: error.message }));
    }
  };

  // Export to Word
  const exportToWord = async () => {
    try {
      const { exportMarkdownToDocx } = await import('./services/docxExporter');
      const filename = `SKKN_${userInfo.topic.substring(0, 30).replace(/[^a-zA-Z0-9\u00C0-\u1EF9]/g, '_')}.docx`;
      // Truyền headerFields để tạo phần đầu SKKN trong Word
      const templateHeaderFields = customTemplateData?.headerFields || {};
      await exportMarkdownToDocx(state.fullDocument, filename, templateHeaderFields, {
        topic: userInfo.topic,
        school: userInfo.school,
        location: userInfo.location,
        subject: userInfo.subject,
      });
    } catch (error: any) {
      console.error('Export error:', error);
      alert('Có lỗi khi xuất file. Vui lòng thử lại.');
    }
  };

  // ====== REVIEW SOLUTION HANDLERS ======

  // Xác định số giải pháp dựa trên step hiện tại
  const getSolutionNumberFromStep = (step: GenerationStep): number => {
    const stepToSolution: Record<number, number> = {
      [GenerationStep.PART_IV_SOL1_REVIEW]: 1,
      [GenerationStep.PART_IV_SOL2_REVIEW]: 2,
      [GenerationStep.PART_IV_SOL3_REVIEW]: 3,
      [GenerationStep.PART_IV_SOL4_REVIEW]: 4,
      [GenerationStep.PART_IV_SOL5_REVIEW]: 5,
    };
    return stepToSolution[step] || 0;
  };

  // Kiểm tra có phải step review không
  const isReviewStep = (step: GenerationStep): boolean => {
    return [
      GenerationStep.PART_IV_SOL1_REVIEW,
      GenerationStep.PART_IV_SOL2_REVIEW,
      GenerationStep.PART_IV_SOL3_REVIEW,
      GenerationStep.PART_IV_SOL4_REVIEW,
      GenerationStep.PART_IV_SOL5_REVIEW,
    ].includes(step);
  };

  // Duyệt giải pháp và tiếp tục
  const handleApproveSolution = () => {
    const solutionNum = getSolutionNumberFromStep(state.step);

    // Lưu giải pháp đã duyệt
    setSolutionsState(prev => ({
      ...prev,
      [`solution${solutionNum} `]: {
        content: currentSolutionContent,
        isApproved: true,
        revisionHistory: [],
      },
    }));

    // Đóng popup
    setShowSolutionReview(false);
    setCurrentSolutionContent('');

    // Chuyển sang bước tiếp theo - tiếp tục viết giải pháp tiếp hoặc Phần V-VI
    generateNextSection();
  };

  // Yêu cầu viết lại giải pháp
  const handleReviseSolution = async (feedback: string, referenceDoc?: string) => {
    if (!apiKey) {
      setShowApiModal(true);
      return;
    }

    setIsRevisingSolution(true);
    const solutionNum = getSolutionNumberFromStep(state.step);

    try {
      const revisionPrompt = `
        NHIỆM VỤ: VIẾT LẠI GIẢI PHÁP ${solutionNum} theo yêu cầu mới.
        
        ⚠️ YÊU CẦU SỬA TỪ NGƯỜI DÙNG:
        ${feedback}
        
        ${referenceDoc ? `
        📄 TÀI LIỆU THAM KHẢO MỚI:
        Dựa vào nội dung tài liệu sau để viết lại giải pháp:
        ---
        ${referenceDoc.substring(0, 5000)}
        ---
        ` : ''
        }
        
        ⚠️ NỘI DUNG CŨ(ĐỂ THAM KHẢO):
        ${currentSolutionContent.substring(0, 3000)}
        
        Hãy viết lại GIẢI PHÁP ${solutionNum} hoàn toàn mới, đảm bảo:
1. Tuân thủ YÊU CẦU SỬA từ người dùng
2. Tham khảo tài liệu mới nếu có
3. Giữ nguyên cấu trúc: Mục tiêu - Cơ sở - Quy trình - Ví dụ - Công cụ - Lưu ý
4. Format chuẩn SKKN
        
        ${getPageLimitPrompt()}
`;

      let revisedContent = "";
      await sendMessageStream(revisionPrompt, (chunk) => {
        revisedContent += chunk;
        setCurrentSolutionContent(revisedContent);
      });

      setIsRevisingSolution(false);
    } catch (error: any) {
      console.error('Revision error:', error);
      setIsRevisingSolution(false);
      alert('Có lỗi khi viết lại. Vui lòng thử lại.');
    }
  };

  // Xuất Word riêng cho 1 giải pháp
  const exportSolutionToWord = async () => {
    try {
      const { exportMarkdownToDocx } = await import('./services/docxExporter');
      const solutionNum = getSolutionNumberFromStep(state.step);
      const filename = `Giai_phap_${solutionNum}_${userInfo.topic.substring(0, 20).replace(/[^a-zA-Z0-9\u00C0-\u1EF9]/g, '_')}.docx`;
      await exportMarkdownToDocx(currentSolutionContent, filename);
    } catch (error: any) {
      console.error('Export solution error:', error);
      alert('Có lỗi khi xuất file. Vui lòng thử lại.');
    }
  };

  // Effect để hiện popup review khi đến step review
  useEffect(() => {
    if (isReviewStep(state.step) && !state.isStreaming) {
      // Lấy nội dung giải pháp vừa viết từ fullDocument
      const solutionNum = getSolutionNumberFromStep(state.step);

      // Tìm nội dung giải pháp trong document - cải thiện logic tìm kiếm
      const docContent = state.fullDocument;

      let solutionContent = '';

      // QUAN TRỌNG: Nội dung giải pháp chi tiết nằm trong phần:
      // "📋 MÔ TẢ SÁNG KIẾN" -> "4. CÁC GIẢI PHÁP, BIỆN PHÁP THỰC HIỆN"
      // KHÔNG phải trong phần Dàn ý (ngắn, chỉ chứa tiêu đề)

      // Bước 1: Tìm vị trí bắt đầu của phần "4. CÁC GIẢI PHÁP" sau "📋 MÔ TẢ SÁNG KIẾN"
      let sectionStartIdx = -1;

      // Tìm vị trí "📋 MÔ TẢ SÁNG KIẾN" (đây là tiêu đề của phần nội dung chính)
      const moTaSangKienIdx = docContent.indexOf('📋 MÔ TẢ SÁNG KIẾN');

      // Tìm vị trí "4. CÁC GIẢI PHÁP" hoặc các biến thể
      const giaiphapSectionPatterns = [
        /4\.\s*CÁC GIẢI PHÁP/i,
        /PHẦN\s*(IV|4)[:\s]*.*GIẢI PHÁP/i,
        /IV\.\s*CÁC GIẢI PHÁP/i,
        /4\.\s*GIẢI PHÁP/i,
      ];

      for (const pattern of giaiphapSectionPatterns) {
        const match = pattern.exec(docContent);
        if (match && match.index !== undefined) {
          // Nếu có "📋 MÔ TẢ SÁNG KIẾN", chỉ lấy phần sau nó
          if (moTaSangKienIdx !== -1 && match.index > moTaSangKienIdx) {
            sectionStartIdx = match.index;
            break;
          } else if (moTaSangKienIdx === -1) {
            // Không có "📋 MÔ TẢ SÁNG KIẾN", lấy vị trí đầu tiên tìm được
            sectionStartIdx = match.index;
            break;
          }
        }
      }

      let startIdx = -1;

      // Bước 2: Tìm GIẢI PHÁP X trong phạm vi phần "4. CÁC GIẢI PHÁP"
      // Ưu tiên tìm từ vị trí sectionStartIdx nếu có
      const searchFromIdx = sectionStartIdx !== -1 ? sectionStartIdx : 0;
      const searchContent = docContent.substring(searchFromIdx);

      // Pattern tìm GIẢI PHÁP có nội dung chi tiết (separator + tiêu đề)
      const detailPatterns = [
        // Pattern cho format chuẩn SKKN (có separator và icon)
        new RegExp(`━+\\s *\\n ?\\s *📋\\s * GIẢI PHÁP\\s * ${solutionNum} \\s * [-–: ]`, 'i'),
        new RegExp(`━+\\s *\\n ?\\s * GIẢI PHÁP\\s *\\[?${solutionNum}\\] ?\\s * [-–: ]`, 'i'),
        // Pattern với số mục 4.1, 4.2 (trong phần IV)
        new RegExp(`4\\.${solutionNum} [.: \\s] + GIẢI PHÁP\\s * ${solutionNum} `, 'i'),
        // Pattern GIẢI PHÁP với tên tiêu đề (có dấu : hoặc -)
        new RegExp(`GIẢI PHÁP\\s * ${solutionNum} \\s * [:–-]\\s * [^\\n]{ 10,} `, 'i'),
      ];

      // Thử từng pattern chi tiết trước
      for (const pattern of detailPatterns) {
        const match = pattern.exec(searchContent);
        if (match && match.index !== undefined) {
          startIdx = searchFromIdx + match.index;
          break;
        }
      }

      // Fallback: Tìm GIẢI PHÁP X với nội dung chi tiết (có ít nhất 1 mục con)
      if (startIdx === -1) {
        const solutionMarker = `GIẢI PHÁP ${solutionNum} `;
        let searchStart = searchFromIdx;

        while (true) {
          const idx = docContent.indexOf(solutionMarker, searchStart);
          if (idx === -1) break;

          // Kiểm tra 1500 ký tự tiếp theo xem có phải nội dung chi tiết không
          const nextChars = docContent.substring(idx, idx + 1500);

          // Nội dung chi tiết có các pattern này:
          // - "1. MỤC TIÊU" hoặc "1.1." hoặc "**1."
          // - "CƠ SỞ KHOA HỌC" hoặc "NỘI DUNG"
          // - "QUY TRÌNH THỰC HIỆN" hoặc "Bước 1:"
          // - "VÍ DỤ MINH HỌA" hoặc "ĐIỀU KIỆN"
          const hasDetailContent = nextChars.match(/(?:1\.\s*MỤC TIÊU|\*\*1\.|1\.1\.|CƠ SỞ KHOA HỌC|NỘI DUNG VÀ|QUY TRÌNH|Bước\s*1|VÍ DỤ MINH HỌA|ĐIỀU KIỆN THỰC HIỆN)/i);

          // Đảm bảo không phải trong dàn ý (dàn ý thường ngắn)
          // Nội dung chi tiết phải có >500 ký tự và có các mục con
          const isNotOutline = hasDetailContent && nextChars.length > 500;

          if (isNotOutline) {
            startIdx = idx;
            break;
          }
          searchStart = idx + 1;
        }
      }

      if (startIdx !== -1) {
        // Tìm điểm kết thúc
        // Ưu tiên tìm "KẾT THÚC GIẢI PHÁP"
        const endMarker = `KẾT THÚC GIẢI PHÁP`;
        let endIdx = docContent.indexOf(endMarker, startIdx);

        if (endIdx !== -1) {
          // Lấy hết dòng chứa "KẾT THÚC GIẢI PHÁP" và phần hướng dẫn copy
          const endBlock = docContent.indexOf('━━━━━━━━━━━━━━━━━━━━━', endIdx + 20);
          if (endBlock !== -1 && endBlock - endIdx < 500) {
            endIdx = endBlock;
          } else {
            const endOfLine = docContent.indexOf('\n\n', endIdx);
            endIdx = endOfLine !== -1 ? endOfLine + 1 : docContent.length;
          }
        } else {
          // Không tìm thấy end marker - tìm GIẢI PHÁP tiếp theo hoặc "5. KẾT QUẢ" hoặc separator
          const nextSolutionIdx = docContent.indexOf(`GIẢI PHÁP ${solutionNum + 1} `, startIdx + 100);
          const nextPartIdx = docContent.search(/(?:5\.\s*KẾT QUẢ|Phần\s*V|PHẦN\s*V)/i);
          const nextSeparator = docContent.indexOf('━━━━━━━━━━━', startIdx + 500);

          // Lấy vị trí gần nhất
          const possibleEnds = [nextSolutionIdx, nextPartIdx, nextSeparator, docContent.length]
            .filter(idx => idx > startIdx + 500);
          endIdx = Math.min(...possibleEnds);
        }

        solutionContent = docContent.substring(startIdx, endIdx).trim();
      }

      // Nếu vẫn không tìm được hoặc nội dung quá ngắn (có thể là dàn ý)
      // Không sử dụng fallback lấy phần cuối vì sẽ lấy nhầm dàn ý
      if (!solutionContent || solutionContent.length < 500) {
        // Thử tìm từ cuối document ngược lên, bỏ qua phần dàn ý
        const parts = docContent.split(/(?:━{10,}|---{3,})/);
        for (let i = parts.length - 1; i >= 0; i--) {
          const part = parts[i].trim();
          // Kiểm tra phần này có phải nội dung giải pháp chi tiết không
          if (part.includes(`GIẢI PHÁP ${solutionNum} `) &&
            part.length > 500 &&
            (part.includes('MỤC TIÊU') || part.includes('QUY TRÌNH') || part.includes('Bước 1'))) {
            solutionContent = part;
            break;
          }
        }
      }

      // Cuối cùng: nếu vẫn không có, hiển thị thông báo
      if (!solutionContent || solutionContent.length < 100) {
        solutionContent = `⚠️ Không tìm thấy nội dung chi tiết của GIẢI PHÁP ${solutionNum}.\n\nVui lòng kiểm tra lại hoặc yêu cầu AI viết lại giải pháp này.`;
      }

      // Khóa Modal Xem và Sửa giải pháp - Tự động duyệt và chuyển tiếp
      setSolutionsState(prev => ({
        ...prev,
        [`solution${solutionNum}`]: {
          content: solutionContent,
          isApproved: true,
          revisionHistory: [],
        },
      }));

      // Chuyển sang bước tiếp theo
      setTimeout(() => {
        generateNextSection();
      }, 100);
    }
  }, [state.step, state.isStreaming, state.fullDocument]);

  // Generate Appendix - Function riêng để tạo phụ lục
  const generateAppendix = async () => {
    if (!apiKey) {
      setShowApiModal(true);
      return;
    }

    setIsAppendixLoading(true);

    // Khởi tạo lại chat session với API key hiện tại (quan trọng khi user thay đổi API key)
    initializeGeminiChat(apiKey, selectedModel);

    try {
      const appendixPrompt = `
        BẮT ĐẦU phản hồi bằng MENU NAVIGATION trạng thái Bước 8(Tạo Phụ lục chi tiết - Đang thực hiện).

        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        📎 NHIỆM VỤ: TẠO ĐẦY ĐỦ CÁC TÀI LIỆU PHỤ LỤC
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        ⚠️ QUAN TRỌNG: Bạn PHẢI dựa vào NỘI DUNG SKKN ĐÃ VIẾT bên dưới để tạo phụ lục.
        Các phụ lục phải KHỚP với nội dung, số liệu, giải pháp đã đề cập trong SKKN.
        KHÔNG tạo phụ lục liên quan đến hình ảnh, video(vì không thể hiển thị).
        
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        📄 NỘI DUNG SKKN ĐÃ VIẾT(ĐỌC KỸ ĐỂ TẠO PHỤ LỤC PHÙ HỢP):
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        ${state.fullDocument}
        
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        📋 THÔNG TIN ĐỀ TÀI:
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Tên đề tài: ${userInfo.topic}
- Môn học: ${userInfo.subject}
- Cấp học: ${userInfo.level}
- Khối lớp: ${userInfo.grade}
- Trường: ${userInfo.school}
- Địa điểm: ${userInfo.location}
- CSVC: ${userInfo.facilities}
- SGK: ${userInfo.textbook || "Hiện hành"}
        
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        📎 YÊU CẦU TẠO PHỤ LỤC:
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${APPENDIX_GUIDE}
        
        Dựa trên NỘI DUNG SKKN ĐÃ VIẾT ở trên, hãy tạo ĐẦY ĐỦ, CHI TIẾT từng tài liệu phụ lục sau:

        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        📋 PHỤ LỤC 1: PHIẾU KHẢO SÁT ĐÁNH GIÁ MỨC ĐỘ HỨNG THÚ VÀ HIỆU QUẢ HỌC TẬP CỦA HỌC SINH
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        ** PHẦN A: PHIẾU KHẢO SÁT TRƯỚC KHI ÁP DỤNG SÁNG KIẾN **

  Tạo bảng khảo sát với format:
        | STT | Nội dung khảo sát | 1 | 2 | 3 | 4 | 5 |
        | -----| -------------------| ---| ---| ---| ---| ---|
        | 1 | [Nội dung câu hỏi về mức độ hứng thú với môn ${userInfo.subject}] | | | | | |
        | 2 | [Nội dung câu hỏi về khó khăn khi học] | | | | | |
        ...
        
        Ghi chú: 1 = Rất không đồng ý, 2 = Không đồng ý, 3 = Bình thường, 4 = Đồng ý, 5 = Rất đồng ý
        
        Nội dung câu hỏi(10 - 12 câu):
- Mức độ hứng thú với môn học
  - Cảm nhận về phương pháp dạy học hiện tại
    - Mức độ tham gia hoạt động học tập
      - Khả năng tự học, tự nghiên cứu
        - Mức độ khó khăn khi tiếp thu kiến thức
          - Hiệu quả ghi nhớ kiến thức
            - Kỹ năng vận dụng kiến thức vào thực tế

              ** PHẦN B: PHIẾU KHẢO SÁT SAU KHI ÁP DỤNG SÁNG KIẾN **

                Tạo bảng khảo sát tương tự với 12 - 15 câu hỏi về:
- Mức độ hứng thú sau khi áp dụng sáng kiến
  - Hiệu quả của phương pháp mới
    - Khả năng tiếp thu kiến thức
      - Sự cải thiện kết quả học tập
        - Mong muốn tiếp tục học theo phương pháp mới

        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        📋 PHỤ LỤC 2: PHIẾU KHẢO SÁT GIÁO VIÊN VỀ THỰC TRẠNG DẠY HỌC
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Viết phiếu khảo sát HOÀN CHỈNH với 10 - 15 câu hỏi
  - Dạng câu hỏi: Trắc nghiệm mức độ(Rất thường xuyên / Thường xuyên / Thỉnh thoảng / Hiếm khi / Không bao giờ)
    - Nội dung: Khảo sát thực trạng sử dụng phương pháp / công nghệ liên quan đến "${userInfo.topic}"
      - Format: Bảng Markdown chuẩn với đầy đủ các cột
        | STT | Nội dung | Rất thường xuyên | Thường xuyên | Thỉnh thoảng | Hiếm khi | Không bao giờ |
        | -----| ----------| ------------------| --------------| --------------| ----------| ---------------|
        
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        📋 PHỤ LỤC 3: GIÁO ÁN MINH HỌA(Theo Công văn 5512 / BGDĐT ngày 18 / 12 / 2020)
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        ** KHUNG KẾ HOẠCH BÀI DẠY **
  (Kèm theo Công văn số 5512 / BGDĐT - GDTrH ngày 18 tháng 12 năm 2020 của Bộ GDĐT)

Trường: ${userInfo.school}
Tổ: [Tổ chuyên môn]
        Họ và tên giáo viên: ……………………
        
        ** TÊN BÀI DẠY: [Chọn một bài cụ thể từ SGK ${userInfo.textbook || "hiện hành"} phù hợp với đề tài] **
  Môn học: ${userInfo.subject}; Lớp: ${userInfo.grade}
        Thời gian thực hiện: [Số tiết]

  ** I.MỤC TIÊU **

    1. Về kiến thức:
- Nêu cụ thể nội dung kiến thức học sinh cần học

2. Về năng lực:
- Năng lực chung: [Tự chủ và tự học, giao tiếp và hợp tác, giải quyết vấn đề]
  - Năng lực đặc thù: [Năng lực đặc thù môn ${userInfo.subject}]

3. Về phẩm chất:
- Trách nhiệm, chăm chỉ, trung thực trong học tập

  ** II.THIẾT BỊ DẠY HỌC VÀ HỌC LIỆU **
    - Giáo viên: [Liệt kê thiết bị, tài liệu GV chuẩn bị]
      - Học sinh: [Liệt kê những gì HS cần chuẩn bị]
        - Điều kiện CSVC: ${userInfo.facilities}
        
        ** III.TIẾN TRÌNH DẠY HỌC **
        
        ** 1. Hoạt động 1: Mở đầu / Khởi động(...phút) **
  a) Mục tiêu: Tạo hứng thú, xác định vấn đề / nhiệm vụ học tập
        b) Nội dung: [Mô tả cụ thể hoạt động]
        c) Sản phẩm: [Kết quả học sinh đạt được]
        d) Tổ chức thực hiện:
- Giao nhiệm vụ: [GV giao nhiệm vụ cụ thể]
  - Thực hiện: [HS thực hiện, GV theo dõi hỗ trợ]
    - Báo cáo, thảo luận: [HS báo cáo, GV tổ chức thảo luận]
      - Kết luận, nhận định: [GV kết luận, chuyển tiếp]

        ** 2. Hoạt động 2: Hình thành kiến thức mới(...phút) **
          a) Mục tiêu: Giúp HS chiếm lĩnh kiến thức mới
        b) Nội dung: [Mô tả cụ thể các nhiệm vụ học tập]
        c) Sản phẩm: [Kiến thức, kỹ năng HS cần đạt được]
        d) Tổ chức thực hiện:
- Giao nhiệm vụ: [Chi tiết]
  - Thực hiện: [Chi tiết - TÍCH HỢP CÔNG CỤ / PHƯƠNG PHÁP CỦA GIẢI PHÁP 1]
    - Báo cáo, thảo luận: [Chi tiết]
      - Kết luận, nhận định: [Chi tiết]

        ** 3. Hoạt động 3: Luyện tập(...phút) **
          a) Mục tiêu: Củng cố, vận dụng kiến thức đã học
        b) Nội dung: [Hệ thống câu hỏi, bài tập]
        c) Sản phẩm: [Đáp án, lời giải của HS]
        d) Tổ chức thực hiện: [Chi tiết các bước]

  ** 4. Hoạt động 4: Vận dụng(...phút) **
    a) Mục tiêu: Phát triển năng lực vận dụng vào thực tiễn
        b) Nội dung: [Nhiệm vụ / tình huống thực tiễn]
        c) Sản phẩm: [Báo cáo, sản phẩm của HS]
        d) Tổ chức thực hiện: [Giao về nhà hoặc thực hiện trên lớp]

        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        📋 PHỤ LỤC 4: PHIẾU HỌC TẬP / RUBRIC ĐÁNH GIÁ
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Phiếu học tập mẫu cho hoạt động nhóm
  - Rubric đánh giá sản phẩm học sinh(theo 4 mức: Tốt, Khá, Đạt, Chưa đạt)
    - Bảng tiêu chí đánh giá với các mức độ rõ ràng

        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        📋 PHỤ LỤC 5: BÀI TẬP MẪU / CÂU HỎI ÔN TẬP
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 5 - 7 bài tập mẫu / câu hỏi ôn tập
  - Có đáp án và hướng dẫn chấm điểm
    - Nếu môn Toán: Sử dụng LaTeX cho công thức

        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        📋 PHỤ LỤC 6: BẢNG TỔNG HỢP KẾT QUẢ KHẢO SÁT(MINH CHỨNG CHO BẢNG DỮ LIỆU SKKN)
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Bảng tổng hợp kết quả khảo sát TRƯỚC thực nghiệm(số lượng, tỷ lệ %)
  - Bảng tổng hợp kết quả khảo sát SAU thực nghiệm
    - Bảng so sánh kết quả TRƯỚC - SAU để minh chứng cho các bảng số liệu trong SKKN
      - Số liệu phải LOGIC và KHỚP với các bảng trong phần Kết quả của SKKN

        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        ⚠️ YÊU CẦU FORMAT VÀ NỘI DUNG(BẮT BUỘC):
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        📌 VỀ NỘI DUNG:
- VIẾT ĐẦY ĐỦ NỘI DUNG thực tế cho từng phụ lục, KHÔNG viết tắt hay bỏ sót
  - Phiếu khảo sát phải có ĐẦY ĐỦ 10 - 15 câu hỏi cụ thể(không ghi "...")
    - Giáo án minh họa phải VIẾT CHI TIẾT từng hoạt động, có lời thoại GV - HS mẫu
      - Rubric phải có ĐẦY ĐỦ tiêu chí và mô tả các mức độ
        - Bài tập mẫu phải có ĐẦY ĐỦ đề bài và đáp án / hướng dẫn giải
          - Số liệu bảng tổng hợp phải KHỚP với số liệu trong phần Kết quả SKKN
            - Nếu dàn ý SKKN có đề cập phụ lục khác(chưa liệt kê ở trên), hãy TẠO THÊM
        
        📌 VỀ FORMAT:
- Markdown chuẩn, bảng dùng | ---|
  - BẢNG PHẢI CÓ ĐẦY ĐỦ TẤT CẢ CÁC CỘT, không được bỏ sót cột nào
    - Mỗi hàng trong bảng phải có đủ số ô tương ứng với số cột ở header
      - Bảng phải bắt đầu từ đầu dòng(không thụt lề)
        - Xuống dòng sau mỗi câu
          - Tách đoạn rõ ràng
            - Đánh số phụ lục rõ ràng: PHỤ LỤC 1, PHỤ LỤC 2...
        - KHÔNG ghi "...", "[nội dung]", "[điền vào]" - phải viết nội dung thực tế
        
        📌 KHÔNG TẠO:
- Phụ lục hình ảnh, video, ảnh chụp màn hình(không thể hiển thị)
  - Phụ lục yêu cầu file đính kèm
        
        📍 KẾT THÚC bằng dòng:
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        ✅ HOÀN THÀNH TẠO TÀI LIỆU PHỤ LỤC
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

      let generatedAppendix = "";
      await sendMessageStream(appendixPrompt, (chunk) => {
        generatedAppendix += chunk;
        setAppendixDocument(generatedAppendix);
      });

      setIsAppendixLoading(false);
    } catch (error: any) {
      console.error('Generate Appendix error:', error);
      alert('Có lỗi khi tạo phụ lục. Vui lòng thử lại.');
      setIsAppendixLoading(false);
    }
  };

  // Export Appendix to Word - Xuất phụ lục thành file Word riêng
  const exportAppendixToWord = async () => {
    try {
      const { exportMarkdownToDocx } = await import('./services/docxExporter');
      const filename = `SKKN_Phuluc_${userInfo.topic.substring(0, 30).replace(/[^a-zA-Z0-9\u00C0-\u1EF9]/g, '_')}.docx`;
      await exportMarkdownToDocx(appendixDocument, filename);
    } catch (error: any) {
      console.error('Export Appendix error:', error);
      alert('Có lỗi khi xuất file phụ lục. Vui lòng thử lại.');
    }
  };

  // Render Logic
  const renderSidebar = () => {
    return (
      <div className="w-full lg:w-80 bg-gradient-to-b from-white to-sky-50 border-r border-sky-100 p-6 flex-shrink-0 flex flex-col h-full overflow-y-auto shadow-[4px_0_24px_rgba(56,189,248,0.08)]">
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-500 flex items-center gap-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
            <Wand2 className="h-6 w-6 text-blue-500" />
            SKKN 2026 PRO
          </h1>
          <p className="text-xs text-blue-800 font-medium mt-1.5 tracking-wide">✨ Trợ lý viết SKKN thông minh</p>
        </div>

        {/* Progress Stepper */}
        <div className="space-y-6">
          {Object.entries(currentStepsInfo).map(([key, info]) => {
            const stepNum = parseInt(key);

            if (isCustomFlow) {
              const appendixStep = 2 + validCustomSections.length;
              if (stepNum >= appendixStep) return null; // Ẩn Phụ lục và Hoàn tất trên sidebar
            } else {
              // Luôn ẩn step Phụ lục (15) và Hoàn tất (16)
              if (stepNum > 14) return null;
              // Ẩn step Giải pháp 4,5 và Review GP4/5 (step 10-13) và Phần V-VI (step 14) nếu không chọn
              if (stepNum >= 10 && stepNum <= 14 && (userInfo.numSolutions || 3) <= 3) return null;
            }

            let statusColor = "text-gray-400 border-gray-200";
            let icon = <div className="w-2 h-2 rounded-full bg-gray-300" />;

            // ERROR STATE HANDLING
            if (state.error && state.step === stepNum) {
              statusColor = "text-red-600 border-red-600 bg-red-50";
              icon = <AlertTriangle className="w-4 h-4 text-red-600" />;
            }
            else if (state.step === stepNum && state.isStreaming) {
              statusColor = "text-sky-600 border-sky-600 bg-sky-50";
              icon = <div className="w-2 h-2 rounded-full bg-sky-500 animate-ping" />;
            } else if (state.step > stepNum) {
              statusColor = "text-sky-800 border-sky-200";
              icon = <CheckCircle className="w-4 h-4 text-sky-600" />;
            } else if (state.step === stepNum) {
              statusColor = "text-sky-600 border-sky-600 font-bold";
              icon = <div className="w-2 h-2 rounded-full bg-sky-600" />;
            }

            // Cho phép click vào các step đã hoàn thành để quay lại sửa
            const isClickable = state.step > stepNum && !state.isStreaming;
            const handleStepClick = () => {
              if (isClickable) {
                setState(prev => ({ ...prev, step: stepNum }));
              }
            };

            return (
              <div
                key={key}
                onClick={handleStepClick}
                className={`flex items - start pl - 4 border - l - 2 ${statusColor.includes('border-sky') ? 'border-sky-500' : statusColor.includes('border-red') ? 'border-red-500' : 'border-gray-200'} py - 1 transition - all ${isClickable ? 'cursor-pointer hover:bg-sky-50 rounded-r-lg' : ''} `}
              >
                <div className="flex-1">
                  <h4 className={`text - sm ${statusColor.includes('text-sky') ? 'text-sky-900' : statusColor.includes('text-red') ? 'text-red-700' : 'text-gray-500'} font - medium`}>
                    {state.error && state.step === stepNum ? "Đã dừng do lỗi" : info.label}
                  </h4>
                  <p className="text-xs text-gray-400">{info.description}</p>
                </div>
                <div className="ml-2 mt-1">
                  {icon}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-auto pt-6 border-t border-gray-100">
          {state.step > GenerationStep.INPUT_FORM && (
            <div className="space-y-3">
              <div className="p-3 bg-gray-50 rounded text-xs text-gray-500 border border-gray-100">
                <span className="font-bold block text-gray-900">Đề tài:</span>
                {userInfo.topic}
              </div>

              {/* Session persistence buttons */}
              <div className="flex gap-2">
                <button
                  onClick={saveSession}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium transition-colors border border-emerald-200"
                  title="Lưu phiên làm việc"
                >
                  <Save size={13} />
                  Lưu phiên
                </button>
                <button
                  onClick={() => {
                    if (confirm('Xóa phiên đã lưu? Bạn sẽ không thể khôi phục lại.')) {
                      clearSavedSession();
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-medium transition-colors border border-red-200"
                  title="Xóa phiên đã lưu"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              {sessionSavedAt && (
                <p className="text-[10px] text-gray-400 text-center">
                  💾 Lưu lúc {sessionSavedAt}
                </p>
              )}

              {/* Controls */}
              {state.isStreaming ? (
                <Button disabled className="w-full" isLoading>Đang viết...</Button>
              ) : (
                state.step < GenerationStep.COMPLETED && (
                  <>
                    {/* Feedback / Review Section only for OUTLINE Step */}
                    {state.step === GenerationStep.OUTLINE && (
                      <div className="mb-2 space-y-2 border-t border-gray-100 pt-2">
                        <p className="text-sm font-semibold text-sky-700">Điều chỉnh:</p>

                        <div className="text-xs text-gray-500 italic mb-2">
                          💡 Mẹo: Bạn có thể sửa trực tiếp Dàn ý ở màn hình bên phải trước khi bấm "Chốt & Viết tiếp".
                        </div>

                        <textarea
                          value={outlineFeedback}
                          onChange={(e) => setOutlineFeedback(e.target.value)}
                          placeholder="Hoặc nhập yêu cầu để AI viết lại..."
                          className="w-full p-2 text-sm border border-gray-300 rounded focus:ring-sky-500 focus:border-sky-500"
                          rows={3}
                        />
                        <Button
                          variant="secondary"
                          onClick={regenerateOutline}
                          disabled={!outlineFeedback.trim()}
                          className="w-full text-sm"
                          icon={<RefreshCw size={14} />}
                        >
                          Yêu cầu AI viết lại
                        </Button>
                      </div>
                    )}

                    <Button onClick={generateNextSection} className="w-full" icon={<ChevronRight size={16} />}>
                      {state.step === GenerationStep.OUTLINE ? 'Chốt Dàn ý & Viết tiếp' : 'Viết phần tiếp theo'}
                    </Button>
                  </>
                )
              )}

              {/* Nút xuất Word SKKN (luôn hiển thị khi đã có nội dung) */}
              {(state.step >= GenerationStep.OUTLINE) && (
                <Button variant="secondary" onClick={exportToWord} className="w-full" icon={<Download size={16} />}>
                  Xuất file Word SKKN
                </Button>
              )}

              {/* Sau khi hoàn thành SKKN: hiển thị các nút phụ lục */}
              {state.step >= GenerationStep.COMPLETED && (
                <>
                  {!appendixDocument ? (
                    <Button
                      onClick={generateAppendix}
                      isLoading={isAppendixLoading}
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      icon={<FileText size={16} />}
                    >
                      {isAppendixLoading ? 'Đang tạo phụ lục...' : 'TẠO PHỤ LỤC'}
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={exportAppendixToWord}
                      className="w-full border-emerald-500 text-emerald-700 hover:bg-emerald-50"
                      icon={<Download size={16} />}
                    >
                      Xuất Word Phụ lục
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Handler: Template analyzed → go to SETUP_INFO
  const handleTemplateAnalyzed = useCallback((rawContent: string, template: SKKNTemplate | null, fileName: string) => {
    // Save to userInfo
    handleUserChange('skknTemplate', rawContent);
    if (template) {
      handleUserChange('customTemplate', JSON.stringify(template) as any);
      setTemplateSectionsCount(template.sections.length);

      // Auto-fill pageLimit nếu mẫu ghi rõ số trang
      if (template.pageLimitFromTemplate && template.pageLimitFromTemplate > 0) {
        handleUserChange('pageLimit', template.pageLimitFromTemplate as any);
      }
    }
    setTemplateFileName(fileName);
    setWizardStep(WizardStep.SETUP_INFO);
  }, [handleUserChange]);

  // Handler: Skip template → go to SETUP_INFO with no template
  const handleSkipTemplate = useCallback(() => {
    setTemplateFileName('');
    setTemplateSectionsCount(0);
    setWizardStep(WizardStep.SETUP_INFO);
  }, []);

  if (checkingAuth) {
    return <div className="h-screen w-screen bg-white flex items-center justify-center"></div>;
  }

  if (!isUnlocked) {
    return <LockScreen onLogin={handleLogin} />;
  }

  // Wizard Step 0: Upload Template
  if (wizardStep === WizardStep.UPLOAD_TEMPLATE) {
    return (
      <>
        <ApiKeyModal
          isOpen={showApiModal}
          onSave={handleSaveApiKey}
          onClose={() => setShowApiModal(false)}
          isDismissible={!!apiKey}
        />
        <TemplateUploadStep
          apiKey={apiKey}
          selectedModel={selectedModel}
          onTemplateAnalyzed={handleTemplateAnalyzed}
          onSkipTemplate={handleSkipTemplate}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex flex-col lg:flex-row font-sans text-gray-900">
      <ApiKeyModal
        isOpen={showApiModal}
        onSave={handleSaveApiKey}
        onClose={() => setShowApiModal(false)}
        isDismissible={!!apiKey}
      />



      {/* Session Restore Modal */}
      {showRestoreModal && pendingSessionData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-sky-500 p-6 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <Save className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Khôi phục phiên làm việc</h3>
                  <p className="text-sm text-blue-100">Bạn có phiên làm việc chưa hoàn thành</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="bg-sky-50 border border-sky-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-700">
                  <span className="font-semibold text-sky-800">Đề tài:</span>{' '}
                  {(pendingSessionData.userInfo as any).topic || 'Không rõ'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Đã lưu lúc: {new Date(pendingSessionData.savedAt).toLocaleString('vi-VN')}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Tiến độ: Bước {pendingSessionData.state.step} / {GenerationStep.COMPLETED}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowRestoreModal(false);
                    clearSavedSession();
                    setPendingSessionData(null);
                  }}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors text-sm"
                >
                  ✖ Bắt đầu mới
                </button>
                <button
                  onClick={() => {
                    restoreSession(pendingSessionData);
                    setShowRestoreModal(false);
                    setPendingSessionData(null);
                  }}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-sky-500 hover:from-blue-600 hover:to-sky-600 text-white rounded-xl font-bold transition-colors text-sm shadow-lg"
                >
                  ✔ Tiếp tục làm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header Button for Settings */}
      <button
        onClick={() => setShowApiModal(true)}
        className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-blue-100 hover:bg-blue-50 hover:border-blue-200 hover:shadow-xl transition-all duration-200"
        title="Cấu hình API Key"
      >
        <Settings size={18} className="text-blue-600" />
        <span className="text-blue-700 font-semibold text-sm hidden sm:inline">⚙️ Cài đặt API Key</span>
      </button>

      {/* Sidebar (Desktop) */}
      <div className="hidden lg:block h-screen sticky top-0 z-20">
        {renderSidebar()}
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 lg:p-8 flex flex-col h-screen overflow-hidden relative">

        {/* Mobile Header */}
        <div className="lg:hidden mb-4 bg-gradient-to-r from-white to-sky-50 p-4 rounded-xl shadow-lg border border-sky-100 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="ml-3 font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 text-xl tracking-tight" style={{ fontFamily: 'Nunito, sans-serif' }}>
              SKKN 2026 PRO
            </span>
            <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium">
              {currentStepsInfo[state.step < COMPLETED_STEP_ID ? state.step : COMPLETED_STEP_ID - 1]?.label || "SKKN 2026 PRO"}
            </span>
          </div>
          <p className="text-xs text-blue-700 font-medium">✨ Trợ lý viết SKKN thông minh</p>
        </div>

        {state.error && (() => {
          const errorInfo = getFriendlyErrorMessage({ message: state.error });
          return (
            <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-xl p-5 mb-4 shadow-sm">
              {/* Header */}
              <div className="flex items-start gap-3 mb-3">
                <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-red-800 text-lg">{errorInfo.title}</h3>
                  <p className="text-red-700 text-sm mt-1">{errorInfo.message}</p>
                </div>
              </div>

              {/* Suggestions */}
              <div className="bg-white/70 rounded-lg p-4 mt-3 border border-red-100">
                <p className="text-sm font-semibold text-gray-700 mb-2">💡 Gợi ý khắc phục:</p>
                <ul className="space-y-2">
                  {errorInfo.suggestions.map((suggestion, index) => (
                    <li key={index} className="text-sm text-gray-600 flex items-start gap-2">
                      <span className="text-gray-400">•</span>
                      {suggestion}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Hướng dẫn thao tác cho người dùng */}
              {state.step > GenerationStep.INPUT_FORM && (
                <div className="bg-gradient-to-r from-blue-50 to-emerald-50 rounded-lg p-4 mt-3 border border-blue-200">
                  <p className="text-sm font-bold text-blue-800 mb-2">📋 Bạn có 2 lựa chọn:</p>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-emerald-600 font-bold text-sm mt-0.5">1.</span>
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold text-emerald-700">Bấm "🔄 Thử lại (đổi key)"</span> - App sẽ tự động chuyển sang API key dự phòng và tiếp tục chạy ngay, không mất dữ liệu.
                      </p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-sky-600 font-bold text-sm mt-0.5">2.</span>
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold text-sky-700">Bấm "💾 Lưu phiên" ở thanh bên trái</span> rồi tắt app. Hôm sau mở lại, API key sẽ được reset và bạn tiếp tục từ chỗ đã dừng.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  onClick={() => setState(prev => ({ ...prev, error: null }))}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  ✕ Đóng thông báo
                </button>
                <button
                  onClick={() => setShowApiModal(true)}
                  className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 transition-colors"
                >
                  🔑 Đổi API Key
                </button>
                {/* 🆕 Nút Thử lại - xoay sang API key dự phòng và retry */}
                {state.step > GenerationStep.INPUT_FORM && (
                  <button
                    onClick={() => {
                      // Xoay sang API key tiếp theo trước khi thử lại
                      const rotation = apiKeyManager.rotateToNextKey('manual_retry');
                      let keyToUse = apiKey;
                      if (rotation.success && rotation.newKey) {
                        keyToUse = rotation.newKey;
                        setApiKey(keyToUse);
                        localStorage.setItem('gemini_api_key', keyToUse);
                        console.log(`🔑 Đã xoay sang key mới: ${rotation.message} `);
                      } else {
                        // Nếu không có key khác, reset tất cả key và thử lại
                        apiKeyManager.resetAllKeys();
                        const freshKey = apiKeyManager.getActiveKey();
                        if (freshKey) {
                          keyToUse = freshKey;
                          setApiKey(keyToUse);
                          localStorage.setItem('gemini_api_key', keyToUse);
                          console.log('🔄 Đã reset tất cả key và thử lại');
                        }
                      }
                      setState(prev => ({ ...prev, error: null }));
                      initializeGeminiChat(keyToUse, selectedModel);
                      // Khôi phục chat history trước khi retry
                      const savedHistory = getChatHistory();
                      if (savedHistory.length > 0) {
                        setChatHistory(savedHistory);
                      }
                      setTimeout(() => {
                        generateNextSection();
                      }, 300);
                    }}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2"
                  >
                    <RefreshCw size={16} />
                    🔄 Thử lại (đổi key)
                  </button>
                )}
                <a
                  href="https://ai.google.dev/gemini-api/docs/api-key"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
                >
                  📖 Hướng dẫn lấy API Key
                </a>
              </div>
            </div>
          );
        })()}

        {state.step === GenerationStep.INPUT_FORM ? (
          <div className="flex-1 flex items-start justify-center overflow-y-auto">
            <SKKNForm
              userInfo={userInfo}
              onChange={handleUserChange}
              onSubmit={startGeneration}
              onManualSubmit={handleManualOutlineSubmit}
              isSubmitting={state.isStreaming}
              apiKey={apiKey}
              selectedModel={selectedModel}
              templateFileName={templateFileName}
              parsedTemplateSections={templateSectionsCount}
              onBackToUpload={() => setWizardStep(WizardStep.UPLOAD_TEMPLATE)}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 relative">
            <DocumentPreview
              content={state.fullDocument}
              onUpdate={handleDocumentUpdate}
              // Only allow direct editing in the OUTLINE step and when not streaming
              isEditable={state.step === GenerationStep.OUTLINE && !state.isStreaming}
            />

            {/* Mobile Controls Floating */}
            <div className="lg:hidden absolute bottom-4 left-4 right-4 flex gap-2 shadow-lg">
              {!state.isStreaming && state.step < COMPLETED_STEP_ID && (
                <Button onClick={generateNextSection} className="flex-1 shadow-xl">
                  {state.step === GenerationStep.OUTLINE ? 'Chốt & Tiếp tục' : 'Viết tiếp'}
                </Button>
              )}
              <Button onClick={exportToWord} variant="secondary" className="bg-white shadow-xl text-sky-700">
                <Download size={20} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
