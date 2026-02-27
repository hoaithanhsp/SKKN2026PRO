import React, { useState, useRef } from 'react';
import { X, FileUp, RefreshCw, Download, Check, Loader2, FileText, Eye } from 'lucide-react';
import { Button } from './Button';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface SolutionReviewModalProps {
    isOpen: boolean;
    solutionNumber: number; // 1-5
    solutionContent: string;
    isLoading: boolean;
    isRevising: boolean;
    onClose: () => void;
    onApprove: () => void;
    onRevise: (feedback: string, referenceDoc?: string) => Promise<void>;
    onDownloadWord: () => void;
}

export const SolutionReviewModal: React.FC<SolutionReviewModalProps> = ({
    isOpen,
    solutionNumber,
    solutionContent,
    isLoading,
    isRevising,
    onClose,
    onApprove,
    onRevise,
    onDownloadWord,
}) => {
    const [feedback, setFeedback] = useState('');
    const [referenceDoc, setReferenceDoc] = useState('');
    const [referenceFileName, setReferenceFileName] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [activeTab, setActiveTab] = useState<'preview' | 'edit'>('preview');
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    // Extract text from DOCX
    const extractDocxText = async (file: File): Promise<string> => {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
    };

    // Extract text from PDF
    const extractPdfText = async (file: File): Promise<string> => {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
                .map((item: any) => item.str)
                .join(' ');
            fullText += pageText + '\n\n';
        }

        return fullText;
    };

    // Handle file upload
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        setReferenceFileName(file.name);

        try {
            let text = '';
            const fileExt = file.name.split('.').pop()?.toLowerCase();

            if (fileExt === 'docx' || fileExt === 'doc') {
                text = await extractDocxText(file);
            } else if (fileExt === 'pdf') {
                text = await extractPdfText(file);
            } else if (fileExt === 'txt') {
                text = await file.text();
            } else {
                alert('Vui lòng tải lên file .docx, .pdf hoặc .txt');
                return;
            }

            setReferenceDoc(text);
        } catch (error) {
            console.error('Error reading file:', error);
            alert('Không thể đọc file. Vui lòng thử lại.');
        } finally {
            setIsUploading(false);
        }
    };

    // Handle revise request
    const handleRevise = async () => {
        if (!feedback.trim() && !referenceDoc.trim()) {
            alert('Vui lòng nhập yêu cầu sửa lại hoặc tải lên tài liệu tham khảo!');
            return;
        }
        await onRevise(feedback, referenceDoc);
        setFeedback('');
    };

    // Simple markdown to HTML for preview
    const renderMarkdown = (text: string) => {
        // Basic markdown rendering
        let html = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold mt-4 mb-2 text-sky-800">$1</h3>')
            .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-5 mb-3 text-sky-900">$1</h2>')
            .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-6 mb-4 text-sky-950">$1</h1>')
            .replace(/^- (.*$)/gim, '<li class="ml-4">$1</li>')
            .replace(/^(\d+)\. (.*$)/gim, '<li class="ml-4 list-decimal">$2</li>')
            .replace(/\n\n/g, '</p><p class="mb-3">')
            .replace(/\n/g, '<br/>');

        return `<p class="mb-3">${html}</p>`;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-sky-600 to-indigo-600">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                            <Eye className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">
                                Xem và Sửa Giải pháp {solutionNumber}
                            </h2>
                            <p className="text-sky-100 text-sm">
                                Xem lại nội dung, yêu cầu sửa hoặc đồng ý để tiếp tục
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                    >
                        <X className="w-5 h-5 text-white" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200">
                    <button
                        onClick={() => setActiveTab('preview')}
                        className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${activeTab === 'preview'
                            ? 'text-sky-600 border-b-2 border-sky-600 bg-sky-50'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <Eye className="w-4 h-4 inline mr-2" />
                        Xem trước nội dung
                    </button>
                    <button
                        onClick={() => setActiveTab('edit')}
                        className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${activeTab === 'edit'
                            ? 'text-sky-600 border-b-2 border-sky-600 bg-sky-50'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        <RefreshCw className="w-4 h-4 inline mr-2" />
                        Yêu cầu sửa lại
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {activeTab === 'preview' ? (
                        /* Preview Tab */
                        <div className="h-full overflow-y-auto p-6">
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center h-full">
                                    <Loader2 className="w-12 h-12 text-sky-600 animate-spin mb-4" />
                                    <p className="text-gray-600">Đang tạo nội dung giải pháp {solutionNumber}...</p>
                                </div>
                            ) : (
                                <div
                                    className="prose prose-sky max-w-none text-gray-800 leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: renderMarkdown(solutionContent) }}
                                />
                            )}
                        </div>
                    ) : (
                        /* Edit Tab */
                        <div className="h-full overflow-y-auto p-6 space-y-4">
                            {/* Feedback textarea */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    ✏️ Yêu cầu sửa lại (mô tả chi tiết những gì cần thay đổi):
                                </label>
                                <textarea
                                    value={feedback}
                                    onChange={(e) => setFeedback(e.target.value)}
                                    placeholder="Ví dụ: 
• Thêm nhiều ví dụ thực tế hơn
• Viết ngắn gọn hơn phần cơ sở khoa học
• Bổ sung bảng biểu so sánh
• Thay đổi quy trình thực hiện thành 5 bước..."
                                    className="w-full h-40 p-4 border border-gray-300 rounded-lg text-sm focus:ring-sky-500 focus:border-sky-500 resize-none"
                                    disabled={isRevising}
                                />
                            </div>

                            {/* Reference document upload */}
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    📄 Tải lên tài liệu tham khảo (tùy chọn):
                                </label>
                                <p className="text-xs text-gray-500 mb-3">
                                    AI sẽ dựa vào tài liệu này để viết lại giải pháp phù hợp hơn
                                </p>

                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileUpload}
                                    accept=".docx,.doc,.pdf,.txt"
                                    className="hidden"
                                />

                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isUploading || isRevising}
                                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                                    >
                                        {isUploading ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <FileUp className="w-4 h-4" />
                                        )}
                                        <span className="text-sm">Chọn file (.docx, .pdf, .txt)</span>
                                    </button>

                                    {referenceFileName && (
                                        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                                            <FileText className="w-4 h-4 text-green-600" />
                                            <span className="text-sm text-green-700">{referenceFileName}</span>
                                            <button
                                                onClick={() => {
                                                    setReferenceDoc('');
                                                    setReferenceFileName('');
                                                }}
                                                className="text-green-600 hover:text-green-800"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {referenceDoc && (
                                    <div className="mt-3 p-3 bg-white border border-gray-200 rounded-lg max-h-32 overflow-y-auto">
                                        <p className="text-xs text-gray-500 mb-1">Nội dung trích xuất:</p>
                                        <p className="text-xs text-gray-700 whitespace-pre-wrap">
                                            {referenceDoc.substring(0, 500)}
                                            {referenceDoc.length > 500 && '...'}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Revise button */}
                            <Button
                                onClick={handleRevise}
                                disabled={isRevising || (!feedback.trim() && !referenceDoc.trim())}
                                isLoading={isRevising}
                                className="w-full"
                                variant="secondary"
                            >
                                {isRevising ? 'Đang viết lại...' : '🔄 Viết lại giải pháp'}
                            </Button>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
                    <Button
                        onClick={onDownloadWord}
                        variant="secondary"
                        disabled={isLoading || isRevising || !solutionContent}
                        className="flex items-center gap-2"
                    >
                        <Download className="w-4 h-4" />
                        Tải xuống Word
                    </Button>

                    <div className="flex items-center gap-3">
                        <Button
                            onClick={onClose}
                            variant="secondary"
                            disabled={isLoading || isRevising}
                        >
                            Đóng
                        </Button>
                        <Button
                            onClick={onApprove}
                            disabled={isLoading || isRevising || !solutionContent}
                            className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
                        >
                            <Check className="w-4 h-4" />
                            Đồng ý & Tiếp tục
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
