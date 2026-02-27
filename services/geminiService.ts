
import { GoogleGenAI, Chat } from "@google/genai";
import { SYSTEM_INSTRUCTION, FALLBACK_MODELS } from "../constants";
import { TitleAnalysisResult } from '../types';

// Hàm phân tích và trả về thông báo lỗi thân thiện
export const parseApiError = (error: any): string => {
  const errorMessage = error?.message || error?.toString() || '';
  const errorString = JSON.stringify(error);

  // Kiểm tra lỗi quota exceeded (429)
  if (errorString.includes('429') ||
    errorMessage.includes('quota') ||
    errorMessage.includes('RESOURCE_EXHAUSTED') ||
    errorMessage.includes('exceeded')) {
    return 'QUOTA_EXCEEDED';
  }

  // Kiểm tra lỗi rate limit
  if (errorMessage.includes('rate') || errorMessage.includes('limit')) {
    return 'RATE_LIMIT';
  }

  // Kiểm tra lỗi API key không hợp lệ
  if (errorMessage.includes('API_KEY_INVALID') ||
    errorMessage.includes('401') ||
    errorMessage.includes('unauthorized') ||
    errorMessage.includes('PERMISSION_DENIED')) {
    return 'INVALID_API_KEY';
  }

  // Kiểm tra lỗi kết nối
  if (errorMessage.includes('network') ||
    errorMessage.includes('fetch') ||
    errorMessage.includes('connection')) {
    return 'NETWORK_ERROR';
  }

  return 'UNKNOWN';
};

// Hàm tạo thông báo lỗi thân thiện
export const getFriendlyErrorMessage = (error: any): { type: string; title: string; message: string; suggestions: string[] } => {
  const errorType = parseApiError(error);

  switch (errorType) {
    case 'QUOTA_EXCEEDED':
      return {
        type: 'quota',
        title: '⚠️ Đã vượt quá giới hạn sử dụng',
        message: 'Bạn đã sử dụng hết lượt gọi API miễn phí trong ngày. Đây là giới hạn từ phía Google, không phải lỗi của ứng dụng.',
        suggestions: [
          '⏰ Đợi khoảng 1-2 phút rồi thử lại',
          '🔑 Sử dụng API Key khác nếu có',
          '📅 Đợi đến ngày hôm sau khi quota được reset',
          '💳 Nâng cấp tài khoản Google AI Studio để có thêm quota'
        ]
      };

    case 'RATE_LIMIT':
      return {
        type: 'rate_limit',
        title: '🚦 Đang gửi yêu cầu quá nhanh',
        message: 'Bạn đang gửi quá nhiều yêu cầu trong thời gian ngắn. Hãy chờ một chút rồi thử lại.',
        suggestions: [
          '⏳ Đợi 30-60 giây rồi thử lại',
          '🔄 Không bấm nút nhiều lần liên tiếp'
        ]
      };

    case 'INVALID_API_KEY':
      return {
        type: 'auth',
        title: '🔐 API Key không hợp lệ',
        message: 'API Key bạn đang sử dụng không đúng hoặc đã hết hạn.',
        suggestions: [
          '🔑 Kiểm tra lại API Key đã nhập',
          '🆕 Tạo API Key mới tại Google AI Studio',
          '📋 Đảm bảo copy đầy đủ API Key (không thừa/thiếu ký tự)'
        ]
      };

    case 'NETWORK_ERROR':
      return {
        type: 'network',
        title: '🌐 Lỗi kết nối mạng',
        message: 'Không thể kết nối đến máy chủ Google AI. Hãy kiểm tra kết nối internet của bạn.',
        suggestions: [
          '📶 Kiểm tra kết nối WiFi/Internet',
          '🔄 Thử làm mới trang (F5)',
          '🌍 Thử sử dụng mạng khác'
        ]
      };

    default:
      return {
        type: 'unknown',
        title: '❌ Đã xảy ra lỗi',
        message: error?.message || 'Có lỗi không xác định xảy ra khi gọi AI.',
        suggestions: [
          '🔄 Thử làm mới trang và thực hiện lại',
          '🔑 Kiểm tra API Key',
          '⏰ Đợi một lúc rồi thử lại'
        ]
      };
  }
};

let chatSession: Chat | null = null;
let currentApiKey: string | null = null;
let currentSelectedModel: string | null = null;
let history: any[] = []; // Store history to restore when switching models

export const initializeGeminiChat = (apiKey: string, selectedModel?: string) => {
  currentApiKey = apiKey;
  currentSelectedModel = selectedModel || FALLBACK_MODELS[0];
  chatSession = null;
  history = []; // Reset history on new initialization
};

// Lấy lịch sử chat để lưu phiên làm việc
export const getChatHistory = (): any[] => {
  return [...history];
};

// Khôi phục lịch sử chat từ phiên đã lưu
export const setChatHistory = (savedHistory: any[]) => {
  history = savedHistory || [];
};

const createChatSession = (model: string) => {
  if (!currentApiKey) throw new Error("API Key not found");

  const ai = new GoogleGenAI({ apiKey: currentApiKey });

  return ai.chats.create({
    model: model,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.7,
      topK: 64,
      topP: 0.95,
      maxOutputTokens: 65536,
      thinkingConfig: { thinkingBudget: 2048 },
      tools: [{ googleSearch: {} }]
    },
    history: history
  });
};

// Sắp xếp models với model được chọn đầu tiên
const getOrderedModels = (): string[] => {
  if (!currentSelectedModel || !FALLBACK_MODELS.includes(currentSelectedModel)) {
    return FALLBACK_MODELS;
  }

  // Đưa model được chọn lên đầu, giữ nguyên thứ tự các model còn lại
  const orderedModels = [currentSelectedModel];
  for (const model of FALLBACK_MODELS) {
    if (model !== currentSelectedModel) {
      orderedModels.push(model);
    }
  }
  return orderedModels;
};

export const sendMessageStream = async (message: string, onChunk: (text: string) => void) => {
  // Sử dụng API key từ localStorage (đã được khởi tạo qua initializeGeminiChat)
  if (!currentApiKey) {
    throw new Error("Không có API Key. Vui lòng nhập API key trong phần Cài đặt.");
  }

  let lastError: any = null;
  const modelsToTry = getOrderedModels();

  console.log(`🚀 Bắt đầu gửi tin nhắn. Sẽ thử ${modelsToTry.length} model theo thứ tự: ${modelsToTry.join(' → ')}`);

  // Thử lần lượt các model theo thứ tự fallback
  for (const model of modelsToTry) {
    try {
      console.log(`🤖 Đang thử model: ${model}`);

      // Tạo session với model hiện tại
      const ai = new GoogleGenAI({ apiKey: currentApiKey });
      chatSession = ai.chats.create({
        model: model,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.7,
          topK: 64,
          topP: 0.95,
          maxOutputTokens: 65536,
          thinkingConfig: { thinkingBudget: 2048 },
          tools: [{ googleSearch: {} }]
        },
        history: history
      });

      const responseStream = await chatSession.sendMessageStream({ message });

      let fullResponse = "";
      for await (const chunk of responseStream) {
        if (chunk.text) {
          onChunk(chunk.text);
          fullResponse += chunk.text;
        }
      }

      // Thành công - cập nhật history và return
      history.push({ role: 'user', parts: [{ text: message }] });
      history.push({ role: 'model', parts: [{ text: fullResponse }] });
      console.log(`✅ Thành công với model ${model}`);
      return;

    } catch (error: any) {
      console.error(`❌ Model ${model} thất bại:`, error.message || error);
      lastError = error;

      const errorType = parseApiError(error);
      console.log(`⏭️ Lỗi ${errorType}, thử model tiếp theo...`);

      // Tiếp tục thử model tiếp theo
      continue;
    }
  }

  // Tất cả models đều thất bại
  console.error(`💀 Tất cả ${modelsToTry.length} models đều thất bại.`);
  throw lastError || new Error("Tất cả models đều thất bại. Vui lòng kiểm tra API key hoặc thử lại sau.");
};

// Phân tích tài liệu để trích xuất thông tin cho SKKN (không dùng chat session)
export const analyzeDocumentForSKKN = async (
  apiKey: string,
  documentContent: string,
  documentType: 'reference' | 'template',
  selectedModel?: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });

  // Giới hạn nội dung để tránh vượt token limit
  const truncatedContent = documentContent.substring(0, 20000);

  const prompt = documentType === 'reference'
    ? `Bạn là chuyên gia phân tích tài liệu giáo dục. Hãy phân tích TÀI LIỆU THAM KHẢO sau và trích xuất thông tin hữu ích cho việc viết SKKN (Sáng kiến Kinh nghiệm):

📚 **TÀI LIỆU THAM KHẢO:**
${truncatedContent}

---

Hãy phân tích và trả về kết quả theo format sau:

## 📖 1. NỘI DUNG CHÍNH
- Liệt kê các chủ đề, khái niệm, kiến thức quan trọng
- Tóm tắt ý chính của tài liệu

## 🔧 2. PHƯƠNG PHÁP / KỸ THUẬT (nếu có)
- Các phương pháp dạy học được đề cập
- Kỹ thuật, chiến lược giảng dạy

## 📊 3. SỐ LIỆU / DỮ LIỆU QUAN TRỌNG (nếu có)
- Thống kê, bảng biểu
- Kết quả nghiên cứu, khảo sát

## 💡 4. GỢI Ý ÁP DỤNG CHO SKKN
- Cách tận dụng tài liệu này vào đề tài SKKN
- Các điểm có thể tham khảo, trích dẫn
- Ý tưởng phát triển giải pháp

⚠️ Lưu ý: Trả lời ngắn gọn, súc tích, tập trung vào thông tin hữu ích nhất.`
    : `Bạn là chuyên gia về quy trình viết SKKN. Hãy phân tích MẪU YÊU CẦU SKKN sau và trích xuất thông tin quan trọng:

📋 **MẪU YÊU CẦU SKKN:**
${truncatedContent}

---

Hãy phân tích và trả về kết quả theo format sau:

## 📝 1. CẤU TRÚC YÊU CẦU
- Các phần bắt buộc phải có
- Thứ tự các mục
- Quy định về format

## ⭐ 2. TIÊU CHÍ ĐÁNH GIÁ (nếu có)
- Các tiêu chí chấm điểm
- Thang điểm
- Trọng số các phần

## 📏 3. YÊU CẦU ĐẶC BIỆT
- Độ dài tối thiểu/tối đa
- Font chữ, cỡ chữ, căn lề
- Quy định về trích dẫn, tài liệu tham khảo

## ⚠️ 4. LƯU Ý QUAN TRỌNG
- Các điểm cần tuân thủ nghiêm ngặt
- Lỗi thường gặp cần tránh
- Điểm khác biệt so với mẫu chuẩn (nếu có)

⚠️ Lưu ý: Trả lời ngắn gọn, súc tích, tập trung vào thông tin cần thiết nhất.`;

  const model = selectedModel || FALLBACK_MODELS[0];

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt
    });

    return response.text || 'Không thể phân tích tài liệu. Vui lòng thử lại.';
  } catch (error: any) {
    console.error('Lỗi phân tích tài liệu:', error);
    throw new Error(getFriendlyErrorMessage(error).message);
  }
};

// Interface cho cấu trúc mục SKKN (import từ types.ts nếu cần)
interface SKKNSection {
  id: string;
  level: number;
  title: string;
  suggestedContent?: string;
}

// Trích xuất cấu trúc mục từ mẫu SKKN
export const extractSKKNStructure = async (
  apiKey: string,
  templateContent: string,
  selectedModel?: string
): Promise<{ sections: SKKNSection[], contentGuidelines?: string, pageLimitFromTemplate?: number, headerFields?: Record<string, string> }> => {
  const ai = new GoogleGenAI({ apiKey });

  // Giới hạn nội dung để tránh vượt token limit
  const truncatedContent = templateContent.substring(0, 25000);

  const prompt = `Bạn là chuyên gia phân tích cấu trúc tài liệu SKKN (Sáng kiến Kinh nghiệm).

NHIỆM VỤ: Phân tích MẪU YÊU CẦU SKKN sau và TRÍCH XUẤT ĐẦY ĐỦ thông tin.

═══════════════════════════════════════════════════════════════
MẪU SKKN CẦN PHÂN TÍCH:
═══════════════════════════════════════════════════════════════
${truncatedContent}
═══════════════════════════════════════════════════════════════

TRẢ VỀ JSON OBJECT với format CHÍNH XÁC sau (KHÔNG có text khác, CHỈ JSON):

{
  "sections": [
    {"id": "1", "level": 1, "title": "I. Mô tả giải pháp đã biết", "suggestedContent": "Nêu rõ giải pháp/cách làm cũ đang được áp dụng..."},
    {"id": "2", "level": 1, "title": "II. Nội dung giải pháp đề nghị công nhận sáng kiến", "suggestedContent": ""},
    {"id": "2.1", "level": 2, "title": "II.1 Nội dung giải pháp đề nghị công nhận sáng kiến", "suggestedContent": "Trình bày chi tiết nội dung giải pháp mới"},
    ...
  ],
  "contentGuidelines": "Tóm tắt ngắn gọn các hướng dẫn viết nội dung nếu mẫu có ghi (VD: yêu cầu mô tả giải pháp cũ, nêu tính mới, so sánh trước sau...)",
  "pageLimitFromTemplate": 0,
  "headerFields": {
    "hoTen": "Họ và tên",
    "chucVu": "Chức vụ, đơn vị công tác",
    "tenSangKien": "Tên sáng kiến",
    "linhVuc": "Lĩnh vực áp dụng sáng kiến",
    "donViApDung": "Đơn vị áp dụng sáng kiến",
    "thoiGian": "Thời gian áp dụng"
  }
}

QUY TẮC QUAN TRỌNG TỐI CAO:

📋 PHẦN sections:
1. BỎ QUA CÁC THÔNG TIN HÀNH CHÍNH trong sections (Họ tên, Chức vụ, Đơn vị...) - đưa chúng vào headerFields.
2. CHỈ TRÍCH XUẤT cấu trúc phần NỘI DUNG CỐT LÕI cần viết (Mô tả giải pháp, Nội dung giải pháp, Tính mới, Hiệu quả, Khả năng nhân rộng...)
3. level 1: Phần lớn nhất. level 2: Mục con cấp 1. level 3: Mục con cấp 2.
4. Giữ NGUYÊN tiêu đề gốc trong mẫu.
5. suggestedContent: Tóm tắt hướng dẫn viết nếu mẫu có ghi cho mục đó.

📄 PHẦN contentGuidelines:
- Tóm tắt toàn bộ hướng dẫn/yêu cầu viết mà mẫu đề cập (nếu có).
- VD: "Mẫu yêu cầu mô tả giải pháp cũ trước, sau đó nêu giải pháp mới, so sánh tính mới, nêu hiệu quả..."

📏 PHẦN pageLimitFromTemplate:
- Nếu mẫu có ghi rõ giới hạn số trang (VD: "không quá 15 trang", "từ 10-20 trang"), trả về số trang tối đa.
- Nếu không ghi, trả về 0.

👤 PHẦN headerFields:
- Trích xuất TÊN các trường thông tin hành chính mà mẫu yêu cầu điền (Họ tên, Chức vụ, Đơn vị, Lĩnh vực...).
- Key: tên viết tắt camelCase. Value: tên đầy đủ tiếng Việt như mẫu ghi.
- CHỈ lấy các trường mà MẪU thực sự có, KHÔNG tự bịa thêm.

CHỈ TRẢ VỀ JSON OBJECT, KHÔNG giải thích, KHÔNG markdown code block.

BẮT ĐẦU JSON NGAY:`;

  const model = selectedModel || FALLBACK_MODELS[0];

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt
    });

    const responseText = response.text || '{}';

    // Cố gắng parse JSON từ response
    let jsonText = responseText.trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // Try to find JSON object first
    const jsonObjMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonObjMatch) {
      jsonText = jsonObjMatch[0];
    }

    const parsed = JSON.parse(jsonText);

    // Nếu AI trả về object có sections
    if (parsed && parsed.sections && Array.isArray(parsed.sections)) {
      const sections: SKKNSection[] = parsed.sections.filter(
        (s: any) => s.id && s.title && typeof s.level === 'number'
      );
      return {
        sections,
        contentGuidelines: parsed.contentGuidelines || '',
        pageLimitFromTemplate: typeof parsed.pageLimitFromTemplate === 'number' ? parsed.pageLimitFromTemplate : 0,
        headerFields: parsed.headerFields || {},
      };
    }

    // Fallback: Nếu AI vẫn trả về array cũ
    if (Array.isArray(parsed)) {
      const sections: SKKNSection[] = parsed.filter(
        (s: any) => s.id && s.title && typeof s.level === 'number'
      );
      return { sections };
    }

    return { sections: [] };

  } catch (error: any) {
    console.error('Lỗi trích xuất cấu trúc SKKN:', error);
    return { sections: [] };
  }
};

/**
 * Phân tích tên đề tài SKKN
 * Theo quy trình kiểm tra 3 lớp từ quy trinh kiem tra.txt
 */
export const analyzeTitleSKKN = async (
  apiKey: string,
  title: string,
  subject?: string,
  level?: string,
  selectedModel?: string
): Promise<TitleAnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Bạn là chuyên gia phân tích tên đề tài Sáng kiến kinh nghiệm (SKKN) với 20 năm kinh nghiệm.

## THÔNG TIN ĐỀ TÀI CẦN PHÂN TÍCH:
- Tên đề tài: "${title}"
${subject ? `- Môn học/Lĩnh vực: ${subject}` : ''}
${level ? `- Cấp học: ${level}` : ''}

## QUY TRÌNH KIỂM TRA 3 LỚP:

### LỚP 1: DATABASE NỘI BỘ (Đề tài phổ biến)
So sánh với database đề tài tích hợp:

🔴 TRÙNG LẶP CAO (80-90%):
- "Ứng dụng AI trong dạy học môn [X]"
- "Sử dụng ChatGPT hỗ trợ [công việc Y]"
- "Ứng dụng Canva thiết kế bài giảng"
- "Sử dụng Kahoot/Quizizz tăng tính tương tác"
- "Dạy học trực tuyến qua Google Meet/Zoom"
- "Ứng dụng Google Classroom quản lý lớp học"

🟡 TRÙNG LẶP TRUNG BÌNH (60-70%):
- "Dạy học theo dự án (PBL) môn [X]"
- "Phương pháp dạy học tích cực môn [X]"
- "Dạy học theo nhóm hiệu quả"
- "Phát triển năng lực tự học của học sinh"

🟢 TRÙNG LẶP THẤP (20-40%):
- "Kết hợp AI và PBL trong dạy STEM lớp 8"
- Các đề tài kết hợp nhiều phương pháp
- Đề tài có đối tượng đặc biệt (HS khuyết tật, vùng cao)

### LỚP 2: TÌM KIẾM ONLINE (Mô phỏng)
Ước tính số lượng đề tài tương tự trên:
- Cổng SKKN Bộ GD&ĐT
- Sở GD&ĐT các tỉnh
- Tạp chí Giáo dục
- Google Scholar

### LỚP 3: WEBSITE CHUYÊN NGÀNH
- violet.vn, tailieu.vn, 123doc.net
- thuvienvatly.com, giaoducthoidai.vn

## CHẤM ĐIỂM (TỔNG 100 ĐIỂM):

1. **Độ cụ thể (max 25đ)**:
   - 25: Có đầy đủ: môn học, cấp học, công cụ, phạm vi cụ thể
   - 20: Có 3/4 yếu tố
   - 15: Có 2/4 yếu tố
   - 10: Chỉ có 1 yếu tố cụ thể
   - 5: Quá chung chung

2. **Tính mới (max 30đ)**:
   - 30: Chưa ai làm, hoàn toàn mới
   - 25: Kết hợp 2-3 yếu tố mới
   - 20: Có 1 điểm mới rõ ràng
   - 15: Cải tiến từ đề tài cũ
   - 10: Đã có nhiều người làm
   - 5: Trùng lặp hoàn toàn

3. **Tính khả thi (max 25đ)**:
   - 25: Rất dễ thực hiện, nguồn lực sẵn có
   - 20: Khả thi, cần chuẩn bị ít
   - 15: Khả thi nhưng cần thời gian/chi phí
   - 10: Khó khăn, cần nhiều nguồn lực
   - 5: Không khả thi

4. **Độ rõ ràng (max 20đ)**:
   - 20: Tên ngắn gọn, dễ hiểu, có từ khóa rõ
   - 15: Rõ ràng nhưng hơi dài
   - 10: Có thể hiểu nhưng chưa tối ưu
   - 5: Khó hiểu, rườm rà

## PHÁT HIỆN VẤN ĐỀ:
- Từ ngữ chung chung: "ứng dụng công nghệ", "nâng cao chất lượng", "một số biện pháp"
- Từ quá tham vọng: "toàn diện", "cách mạng hóa", "đột phá"
- Công cụ lỗi thời: "băng hình", "đĩa CD", "máy chiếu overhead"
- Công cụ quá phổ biến: "ChatGPT", "Kahoot", "Google Classroom"

## ĐỀ XUẤT 5 TÊN THAY THẾ (Công thức):
1. Cụ thể hóa: Thêm [Cấp học] + [Bối cảnh đặc biệt]
2. Kết hợp: [Công nghệ A] + [Phương pháp B] + [Môn học C]
3. Đối tượng đặc biệt: [Phương pháp] + [HS đặc thù] + [Mục tiêu]
4. Bài học cụ thể: [Phương pháp] + [Bài/Chương cụ thể] + [Công cụ]
5. Tạo công cụ mới: Thiết kế [Công cụ tự tạo] + [Mục đích]

TRẢ VỀ JSON (KHÔNG có markdown code block, CHỈ JSON thuần):
{
  "structure": {
    "action": "Từ khóa hành động (hoặc rỗng)",
    "tool": "Công cụ/Phương tiện (hoặc rỗng)",
    "subject": "Môn học/Lĩnh vực",
    "scope": "Phạm vi (lớp, cấp học)",
    "purpose": "Mục đích"
  },
  "duplicateLevel": "Cao|Trung bình|Thấp",
  "duplicateDetails": "Giải thích chi tiết về mức độ trùng lặp",
  "scores": {
    "specificity": <điểm>,
    "novelty": <điểm>,
    "feasibility": <điểm>,
    "clarity": <điểm>,
    "total": <tổng điểm>
  },
  "scoreDetails": [
    { "category": "Độ cụ thể", "score": <điểm>, "maxScore": 25, "reason": "lý do" },
    { "category": "Tính mới", "score": <điểm>, "maxScore": 30, "reason": "lý do" },
    { "category": "Tính khả thi", "score": <điểm>, "maxScore": 25, "reason": "lý do" },
    { "category": "Độ rõ ràng", "score": <điểm>, "maxScore": 20, "reason": "lý do" }
  ],
  "problems": ["Vấn đề 1", "Vấn đề 2"],
  "suggestions": [
    { "title": "Tên đề tài thay thế 1", "strength": "Điểm mạnh", "predictedScore": <điểm dự kiến> },
    { "title": "Tên đề tài thay thế 2", "strength": "Điểm mạnh", "predictedScore": <điểm dự kiến> },
    { "title": "Tên đề tài thay thế 3", "strength": "Điểm mạnh", "predictedScore": <điểm dự kiến> },
    { "title": "Tên đề tài thay thế 4", "strength": "Điểm mạnh", "predictedScore": <điểm dự kiến> },
    { "title": "Tên đề tài thay thế 5", "strength": "Điểm mạnh", "predictedScore": <điểm dự kiến> }
  ],
  "relatedTopics": ["Đề tài mới nổi 1", "Đề tài mới nổi 2", "Đề tài mới nổi 3"],
  "overallVerdict": "Kết luận tổng quan và lời khuyên"
}

BẮT ĐẦU JSON NGAY:`;

  const model = selectedModel || FALLBACK_MODELS[0];

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt
    });

    const responseText = response.text || '{}';

    // Xử lý response để lấy JSON
    let jsonText = responseText.trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // Find JSON object in response
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    const result: TitleAnalysisResult = JSON.parse(jsonText);
    return result;

  } catch (error: any) {
    console.error('Lỗi phân tích đề tài:', error);
    throw new Error(getFriendlyErrorMessage(error).message);
  }
};
