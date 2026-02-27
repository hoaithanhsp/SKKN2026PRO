// Cấu trúc một mục trong mẫu SKKN tùy chỉnh
export interface SKKNSection {
  id: string;           // ID duy nhất (1, 1.1, 1.1.1...)
  level: number;        // Cấp độ (1: Phần lớn, 2: mục con, 3: mục nhỏ)
  title: string;        // Tiêu đề gốc từ mẫu
  suggestedContent?: string; // Gợi ý nội dung (tùy chọn)
}

// Cấu trúc mẫu SKKN đầy đủ
export interface SKKNTemplate {
  name: string;         // Tên mẫu (từ tên file hoặc tiêu đề)
  sections: SKKNSection[]; // Danh sách các mục
  rawContent: string;   // Nội dung gốc đã trích xuất
  contentGuidelines?: string; // Hướng dẫn nội dung viết từ mẫu
  pageLimitFromTemplate?: number; // Số trang giới hạn nếu mẫu ghi rõ
  headerFields?: Record<string, string>; // Thông tin hành chính (Họ tên, Đơn vị...)
}

// Wizard steps cho flow Template-First
export enum WizardStep {
  UPLOAD_TEMPLATE = 0,
  SETUP_INFO = 1,
  GENERATION = 2,
}

// State cho quá trình phân tích template
export interface TemplateAnalysisState {
  isAnalyzing: boolean;
  fileName: string;
  rawContent: string;
  parsedTemplate: SKKNTemplate | null;
  error: string | null;
}

export interface UserInfo {
  // Bắt buộc
  topic: string;
  subject: string;
  level: string; // Cấp học
  grade: string; // Khối lớp
  school: string;
  location: string; // Địa điểm
  facilities: string; // Điều kiện cơ sở vật chất

  // Bổ sung
  textbook: string;
  researchSubjects: string; // Đối tượng nghiên cứu
  timeframe: string; // Thời gian thực hiện
  applyAI: string; // Có ứng dụng AI không
  focus: string; // Trọng tâm/Đặc thù

  // Tài liệu tham khảo
  referenceDocuments: string; // Nội dung các tài liệu PDF được tải lên

  // Mẫu SKKN (tùy chọn)
  skknTemplate: string; // Nội dung mẫu SKKN nếu người dùng tải lên
  customTemplate?: string; // JSON string của SKKNTemplate - cấu trúc đã trích xuất từ mẫu

  // Yêu cầu khác
  specialRequirements: string; // Các yêu cầu đặc biệt: giới hạn trang, viết ngắn gọn, thêm bài toán...
  pageLimit: number | ''; // Số trang SKKN cần giới hạn (0 = không giới hạn)
  includePracticalExamples: boolean; // Thêm nhiều bài toán thực tế, ví dụ minh họa
  includeStatistics: boolean; // Bổ sung bảng biểu, số liệu thống kê
  requirementsConfirmed: boolean; // Đã xác nhận các yêu cầu chưa

  // Tùy chọn số lượng giải pháp
  numSolutions: number; // Số giải pháp cần viết (1-5, mặc định 3)
}

export enum GenerationStep {
  INPUT_FORM = 0,
  OUTLINE = 1,
  PART_I_II = 2,
  PART_III = 3,
  // Giải pháp 1
  PART_IV_SOL1 = 4,
  PART_IV_SOL1_REVIEW = 5,
  // Giải pháp 2
  PART_IV_SOL2 = 6,
  PART_IV_SOL2_REVIEW = 7,
  // Giải pháp 3
  PART_IV_SOL3 = 8,
  PART_IV_SOL3_REVIEW = 9,
  // Giải pháp 4 (tùy chọn)
  PART_IV_SOL4 = 10,
  PART_IV_SOL4_REVIEW = 11,
  // Giải pháp 5 (tùy chọn)
  PART_IV_SOL5 = 12,
  PART_IV_SOL5_REVIEW = 13,
  // Phần V, VI và kết luận
  PART_V_VI = 14,
  APPENDIX = 15,
  COMPLETED = 16
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface GenerationState {
  step: GenerationStep;
  messages: ChatMessage[];
  fullDocument: string;
  isStreaming: boolean;
  error: string | null;
}

// Nội dung từng giải pháp riêng biệt
export interface SolutionContent {
  content: string;           // Nội dung giải pháp
  isApproved: boolean;       // Đã duyệt chưa
  revisionHistory: string[]; // Lịch sử các phiên bản (tùy chọn)
}

export interface SolutionsState {
  solution1: SolutionContent | null;
  solution2: SolutionContent | null;
  solution3: SolutionContent | null;
  solution4: SolutionContent | null;
  solution5: SolutionContent | null;
}

// Exam Types
export enum QuestionType {
  MULTIPLE_CHOICE = 'MULTIPLE_CHOICE',
  TRUE_FALSE = 'TRUE_FALSE',
  SHORT_ANSWER = 'SHORT_ANSWER',
  ESSAY = 'ESSAY'
}

export interface Choice {
  id: string;
  text: string;
}

export interface Statement {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  choices?: Choice[];
  correctChoiceId?: string;
  statements?: Statement[];
  correctAnswer?: string;
  explanation?: string;
}

export interface ExamPart {
  id: string | number;
  title: string;
  description?: string;
  questions: Question[];
}

export interface Exam {
  title: string;
  topic: string;
  hasEssay: boolean;
  parts: ExamPart[];
}

export type UserAnswers = Record<string, string | Record<string, boolean>>;

/**
 * Kết quả phân tích tên đề tài SKKN
 * Theo quy trình kiểm tra 3 lớp
 */
export interface TitleAnalysisResult {
  // Cấu trúc tên đề tài
  structure: {
    action: string;      // Hành động (Ứng dụng, Thiết kế, Xây dựng...)
    tool: string;        // Công cụ (AI Gemini, Kahoot, Canva...)
    subject: string;     // Môn học/Lĩnh vực
    scope: string;       // Phạm vi (lớp, cấp học)
    purpose: string;     // Mục đích
  };

  // Mức độ trùng lặp
  duplicateLevel: 'Cao' | 'Trung bình' | 'Thấp';
  duplicateDetails: string;

  // Điểm số (tổng 100)
  scores: {
    specificity: number;   // Độ cụ thể (max 25)
    novelty: number;       // Tính mới (max 30)
    feasibility: number;   // Tính khả thi (max 25)
    clarity: number;       // Độ rõ ràng (max 20)
    total: number;         // Tổng điểm
  };

  // Chi tiết từng tiêu chí
  scoreDetails: Array<{
    category: string;
    score: number;
    maxScore: number;
    reason: string;
  }>;

  // Vấn đề cần khắc phục
  problems: string[];

  // Gợi ý 5 tên thay thế
  suggestions: Array<{
    title: string;
    strength: string;
    predictedScore: number;
  }>;

  // Đề tài mới nổi liên quan
  relatedTopics: string[];

  // Kết luận tổng quan
  overallVerdict: string;
}
