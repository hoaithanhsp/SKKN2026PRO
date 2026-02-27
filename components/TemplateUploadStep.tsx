import React, { useState, useRef, useCallback } from 'react';
import { SKKNTemplate, SKKNSection } from '../types';
import { extractSKKNStructure } from '../services/geminiService';
import { GoogleGenAI } from '@google/genai';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { Upload, FileText, CheckCircle, Loader2, ArrowRight, Sparkles, AlertTriangle, X, ChevronDown, ChevronUp } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

interface Props {
    apiKey: string;
    selectedModel: string;
    onTemplateAnalyzed: (rawContent: string, template: SKKNTemplate | null, fileName: string) => void;
    onSkipTemplate: () => void;
}

export const TemplateUploadStep: React.FC<Props> = ({
    apiKey,
    selectedModel,
    onTemplateAnalyzed,
    onSkipTemplate,
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isExtracting, setIsExtracting] = useState(false);
    const [progress, setProgress] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [fileName, setFileName] = useState('');
    const [parsedTemplate, setParsedTemplate] = useState<SKKNTemplate | null>(null);
    const [showAllSections, setShowAllSections] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Trích xuất text từ PDF - tái sử dụng logic từ SKKNForm
    const extractTextFromPdf = async (arrayBuffer: ArrayBuffer, onProgress?: (msg: string) => void): Promise<string> => {
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;
        let allText = '';
        const BATCH_SIZE = 10;

        for (let batchStart = 1; batchStart <= totalPages; batchStart += BATCH_SIZE) {
            const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, totalPages);
            if (onProgress) {
                onProgress(`Đang đọc trang ${batchStart}-${batchEnd}/${totalPages}...`);
            }

            const batchPromises: Promise<string>[] = [];
            for (let i = batchStart; i <= batchEnd; i++) {
                batchPromises.push(
                    pdf.getPage(i).then(async (page) => {
                        const textContent = await page.getTextContent();
                        return textContent.items
                            .map((item: any) => item.str)
                            .join(' ');
                    })
                );
            }
            const batchResults = await Promise.all(batchPromises);
            allText += batchResults.join('\n');
        }

        return allText;
    };

    // Xử lý file upload
    const processFile = useCallback(async (file: File) => {
        if (file.size > MAX_FILE_SIZE) {
            setError(`File "${file.name}" vượt quá ${MAX_FILE_SIZE / 1024 / 1024}MB`);
            return;
        }

        setIsProcessing(true);
        setError(null);
        setFileName(file.name);
        setParsedTemplate(null);
        setProgress(`Đang đọc file ${file.name}...`);

        try {
            const arrayBuffer = await file.arrayBuffer();
            let extractedText = '';

            const isImage = file.type.startsWith('image/') || /\.(png|jpg|jpeg|webp|bmp|gif)$/i.test(file.name);

            if (isImage) {
                // Xử lý ảnh: chuyển base64 → gửi Gemini Vision API đọc nội dung
                setProgress('Đang đọc ảnh bằng AI...');
                const base64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const result = e.target?.result as string;
                        resolve(result.split(',')[1]); // Bỏ prefix "data:image/...;base64,"
                    };
                    reader.readAsDataURL(file);
                });

                try {
                    const ai = new GoogleGenAI({ apiKey });
                    const response = await ai.models.generateContent({
                        model: selectedModel || 'gemini-2.0-flash',
                        contents: [{
                            role: 'user',
                            parts: [
                                { inlineData: { mimeType: file.type || 'image/png', data: base64 } },
                                { text: 'Đọc và trích xuất TOÀN BỘ nội dung văn bản trong ảnh này. Giữ nguyên cấu trúc, đánh số mục, tiêu đề. Trả về plain text, không markdown.' }
                            ]
                        }]
                    });
                    extractedText = response.text || '';
                } catch (imgErr: any) {
                    setError('Không thể đọc ảnh: ' + imgErr.message);
                    setIsProcessing(false);
                    return;
                }
            } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
                extractedText = await extractTextFromPdf(arrayBuffer, setProgress);
            } else if (
                file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                file.name.endsWith('.docx')
            ) {
                setProgress('Đang đọc file Word...');
                const result = await mammoth.extractRawText({ arrayBuffer });
                extractedText = result.value;
            } else {
                extractedText = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target?.result as string);
                    reader.readAsText(file);
                });
            }

            if (!extractedText.trim()) {
                setError('Không trích xuất được nội dung từ file. Vui lòng thử file khác.');
                setIsProcessing(false);
                return;
            }

            setProgress('Đang phân tích cấu trúc mẫu SKKN bằng AI...');
            setIsProcessing(false);
            setIsExtracting(true);

            // Dùng AI trích xuất cấu trúc
            if (apiKey) {
                try {
                    const result = await extractSKKNStructure(apiKey, extractedText, selectedModel);
                    if (result.sections.length > 0) {
                        const template: SKKNTemplate = {
                            name: file.name,
                            sections: result.sections,
                            rawContent: extractedText,
                            contentGuidelines: result.contentGuidelines || '',
                            pageLimitFromTemplate: result.pageLimitFromTemplate || 0,
                            headerFields: result.headerFields || {},
                        };
                        setParsedTemplate(template);
                        setProgress('');
                    } else {
                        setProgress('');
                        // Vẫn cho tiếp tục dù không trích xuất được structure
                        setParsedTemplate({
                            name: file.name,
                            sections: [],
                            rawContent: extractedText,
                        });
                    }
                } catch (structureError: any) {
                    console.error('Lỗi trích xuất cấu trúc:', structureError);
                    setError('Không thể phân tích cấu trúc tự động. Bạn vẫn có thể tiếp tục - AI sẽ dùng nội dung mẫu gốc.');
                    setParsedTemplate({
                        name: file.name,
                        sections: [],
                        rawContent: extractedText,
                    });
                }
            } else {
                setError('Vui lòng cấu hình API Key trước khi phân tích.');
            }
        } catch (err: any) {
            setError(`Lỗi đọc file: ${err.message || 'Không xác định'}`);
        } finally {
            setIsProcessing(false);
            setIsExtracting(false);
        }
    }, [apiKey, selectedModel]);

    // Drag & Drop handlers
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processFile(file);
    }, [processFile]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, [processFile]);

    const handleContinue = () => {
        if (parsedTemplate) {
            onTemplateAnalyzed(
                parsedTemplate.rawContent,
                parsedTemplate.sections.length > 0 ? parsedTemplate : null,
                fileName
            );
        }
    };

    const handleClearAndRetry = () => {
        setFileName('');
        setParsedTemplate(null);
        setError(null);
        setProgress('');
    };

    const visibleSections = parsedTemplate?.sections
        ? showAllSections
            ? parsedTemplate.sections
            : parsedTemplate.sections.slice(0, 10)
        : [];

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
            <div className="w-full max-w-2xl">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30 mb-4">
                        <Sparkles className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                        SKKN 2026 PRO
                    </h1>
                    <p className="text-gray-500 text-sm">Trợ lý viết Sáng kiến Kinh nghiệm thông minh</p>
                </div>

                {/* Main Card */}
                <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                    {/* Card Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-white">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-sm font-bold">1</div>
                            <div>
                                <h2 className="text-lg font-bold">Tải lên mẫu yêu cầu SKKN</h2>
                                <p className="text-blue-100 text-sm mt-0.5">File Word hoặc PDF mẫu từ Sở/Phòng Giáo dục</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-6">
                        {/* Nếu chưa upload hoặc đang xử lý */}
                        {!parsedTemplate ? (
                            <>
                                {/* Upload Zone */}
                                <div
                                    onClick={() => !isProcessing && !isExtracting && fileInputRef.current?.click()}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    className={`
                    relative cursor-pointer rounded-xl border-2 border-dashed transition-all duration-300 p-8
                    ${isProcessing || isExtracting
                                            ? 'border-blue-300 bg-blue-50/50 cursor-wait'
                                            : isDragging
                                                ? 'border-blue-500 bg-blue-50 scale-[1.02] shadow-lg shadow-blue-100'
                                                : 'border-gray-300 bg-gray-50/50 hover:border-blue-400 hover:bg-blue-50/30 hover:shadow-md'
                                        }
                  `}
                                >
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileSelect}
                                        className="hidden"
                                        accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp"
                                    />

                                    <div className="text-center">
                                        {isProcessing || isExtracting ? (
                                            <div className="flex flex-col items-center gap-3">
                                                <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                                                <div>
                                                    <p className="text-blue-700 font-semibold text-sm">{progress || 'Đang xử lý...'}</p>
                                                    {isExtracting && (
                                                        <p className="text-blue-500 text-xs mt-1">AI đang phân tích cấu trúc mẫu SKKN...</p>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center mx-auto mb-4">
                                                    <Upload className="w-7 h-7 text-blue-600" />
                                                </div>
                                                <p className="text-gray-700 font-semibold mb-1">
                                                    Kéo thả file vào đây hoặc <span className="text-blue-600 underline">chọn file</span>
                                                </p>
                                                <p className="text-gray-400 text-xs">
                                                    Hỗ trợ: PDF, Word (.docx), TXT, Ảnh (PNG/JPG) • Tối đa 100MB
                                                </p>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Error */}
                                {error && (
                                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                                        <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                                        <div className="flex-1">
                                            <p className="text-red-700 text-sm">{error}</p>
                                        </div>
                                        <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
                                            <X size={14} />
                                        </button>
                                    </div>
                                )}

                                {/* Info Box */}
                                <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl p-4">
                                    <p className="text-amber-800 font-semibold text-sm mb-2 flex items-center gap-2">
                                        <FileText size={16} className="text-amber-600" />
                                        Mẫu yêu cầu SKKN là gì?
                                    </p>
                                    <ul className="text-amber-700 text-xs space-y-1.5 ml-6">
                                        <li>• File Word/PDF mẫu hướng dẫn viết SKKN từ <strong>Sở/Phòng GD&ĐT</strong></li>
                                        <li>• AI sẽ phân tích và <strong>bám sát cấu trúc</strong> mẫu này khi viết</li>
                                        <li>• Giúp SKKN đúng format yêu cầu của đơn vị</li>
                                    </ul>
                                </div>
                            </>
                        ) : (
                            /* Đã phân tích xong - Hiển thị kết quả */
                            <div className="space-y-4">
                                {/* File info */}
                                <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                                            <FileText className="w-5 h-5 text-emerald-600" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-emerald-800 text-sm">{fileName}</p>
                                            <p className="text-emerald-600 text-xs flex items-center gap-1">
                                                <CheckCircle size={12} />
                                                Đã phân tích thành công
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleClearAndRetry}
                                        className="text-xs text-gray-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                                    >
                                        Đổi file
                                    </button>
                                </div>

                                {/* Kết quả phân tích - danh sách sections */}
                                {parsedTemplate.sections.length > 0 ? (
                                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                                        <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-100">
                                            <p className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                                                <CheckCircle size={16} className="text-emerald-500" />
                                                Trích xuất được {parsedTemplate.sections.length} mục từ mẫu
                                            </p>
                                        </div>
                                        <div className="p-4 max-h-64 overflow-y-auto">
                                            <ul className="space-y-1">
                                                {visibleSections.map((s: SKKNSection, idx: number) => (
                                                    <li
                                                        key={idx}
                                                        style={{ paddingLeft: `${(s.level - 1) * 16}px` }}
                                                        className={`text-sm py-0.5 ${s.level === 1
                                                            ? 'font-bold text-gray-800'
                                                            : s.level === 2
                                                                ? 'text-gray-700'
                                                                : 'text-gray-500 text-xs'
                                                            }`}
                                                    >
                                                        <span className="mr-1.5">
                                                            {s.level === 1 ? '📌' : s.level === 2 ? '•' : '○'}
                                                        </span>
                                                        {s.title}
                                                    </li>
                                                ))}
                                            </ul>
                                            {parsedTemplate.sections.length > 10 && (
                                                <button
                                                    onClick={() => setShowAllSections(!showAllSections)}
                                                    className="mt-2 text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
                                                >
                                                    {showAllSections ? (
                                                        <>
                                                            <ChevronUp size={14} /> Thu gọn
                                                        </>
                                                    ) : (
                                                        <>
                                                            <ChevronDown size={14} /> Xem thêm {parsedTemplate.sections.length - 10} mục
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                        <p className="text-amber-700 text-sm">
                                            ⚠️ Không trích xuất được cấu trúc chi tiết. AI sẽ dùng nội dung gốc của mẫu để viết SKKN.
                                        </p>
                                    </div>
                                )}

                                {error && (
                                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                                        {error}
                                    </div>
                                )}

                                {/* CTA Continue */}
                                <button
                                    onClick={handleContinue}
                                    className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-base shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all flex items-center justify-center gap-2"
                                >
                                    Tiếp tục → Thiết lập Thông tin Sáng kiến
                                    <ArrowRight size={18} />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Footer: Skip option */}
                    <div className="px-6 pb-6">
                        <div className="pt-4 border-t border-gray-100">
                            <button
                                onClick={onSkipTemplate}
                                className="w-full py-3 px-4 text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                            >
                                <span>Không có mẫu?</span>
                                <span className="font-semibold">Dùng mẫu chuẩn Bộ GD&ĐT →</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer text */}
                <p className="text-center text-xs text-gray-400 mt-6">
                    SKKN 2026 PRO • Trợ lý viết Sáng kiến Kinh nghiệm bằng AI
                </p>
            </div>
        </div>
    );
};
