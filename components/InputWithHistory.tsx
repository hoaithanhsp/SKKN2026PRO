import React, { useState, useRef, useEffect } from 'react';
import { getFieldHistory, removeFromHistory } from '../services/inputHistory';
import { X, History, Clock } from 'lucide-react';

interface InputWithHistoryProps {
    name: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    className?: string;
    required?: boolean;
    type?: string;
}

/**
 * Component input với dropdown lịch sử
 * Hiển thị các giá trị đã nhập trước đó khi focus
 */
export const InputWithHistory: React.FC<InputWithHistoryProps> = ({
    name,
    value,
    onChange,
    placeholder,
    className = '',
    required = false,
    type = 'text'
}) => {
    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState<string[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Load lịch sử khi focus
    const loadHistory = () => {
        const fieldHistory = getFieldHistory(name);
        // Lọc ra các giá trị khác với giá trị hiện tại
        const filtered = fieldHistory.filter(
            item => item.toLowerCase() !== value.toLowerCase()
        );
        setHistory(filtered);
    };

    const handleFocus = () => {
        loadHistory();
        setShowHistory(true);
    };

    // Đóng dropdown khi click bên ngoài
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowHistory(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Chọn một giá trị từ lịch sử
    const selectValue = (selectedValue: string) => {
        // Tạo synthetic event để gọi onChange
        const syntheticEvent = {
            target: {
                name,
                value: selectedValue
            }
        } as React.ChangeEvent<HTMLInputElement>;

        onChange(syntheticEvent);
        setShowHistory(false);
        inputRef.current?.focus();
    };

    // Xóa một giá trị khỏi lịch sử
    const handleRemove = (e: React.MouseEvent, itemToRemove: string) => {
        e.stopPropagation();
        removeFromHistory(name, itemToRemove);
        setHistory(prev => prev.filter(item => item !== itemToRemove));
    };

    return (
        <div ref={containerRef} className="relative">
            <input
                ref={inputRef}
                type={type}
                name={name}
                value={value}
                onChange={onChange}
                onFocus={handleFocus}
                placeholder={placeholder}
                required={required}
                className={className}
                autoComplete="off"
            />

            {/* Dropdown lịch sử */}
            {showHistory && history.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2 text-xs text-gray-500">
                        <Clock size={12} />
                        <span>Lịch sử đã nhập</span>
                    </div>
                    {history.map((item, index) => (
                        <div
                            key={index}
                            className="flex items-center justify-between px-3 py-2 hover:bg-sky-50 cursor-pointer group transition-colors"
                            onClick={() => selectValue(item)}
                        >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <History size={14} className="text-gray-400 flex-shrink-0" />
                                <span className="text-sm text-gray-700 truncate">{item}</span>
                            </div>
                            <button
                                onClick={(e) => handleRemove(e, item)}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-all"
                                title="Xóa khỏi lịch sử"
                            >
                                <X size={14} className="text-red-500" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

interface TextareaWithHistoryProps {
    name: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    placeholder?: string;
    className?: string;
    required?: boolean;
    rows?: number;
}

/**
 * Component textarea với dropdown lịch sử
 */
export const TextareaWithHistory: React.FC<TextareaWithHistoryProps> = ({
    name,
    value,
    onChange,
    placeholder,
    className = '',
    required = false,
    rows = 3
}) => {
    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState<string[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const loadHistory = () => {
        const fieldHistory = getFieldHistory(name);
        const filtered = fieldHistory.filter(
            item => item.toLowerCase() !== value.toLowerCase()
        );
        setHistory(filtered);
    };

    const handleFocus = () => {
        loadHistory();
        setShowHistory(true);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowHistory(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectValue = (selectedValue: string) => {
        const syntheticEvent = {
            target: {
                name,
                value: selectedValue
            }
        } as React.ChangeEvent<HTMLTextAreaElement>;

        onChange(syntheticEvent);
        setShowHistory(false);
        textareaRef.current?.focus();
    };

    const handleRemove = (e: React.MouseEvent, itemToRemove: string) => {
        e.stopPropagation();
        removeFromHistory(name, itemToRemove);
        setHistory(prev => prev.filter(item => item !== itemToRemove));
    };

    return (
        <div ref={containerRef} className="relative">
            <textarea
                ref={textareaRef}
                name={name}
                value={value}
                onChange={onChange}
                onFocus={handleFocus}
                placeholder={placeholder}
                required={required}
                rows={rows}
                className={className}
            />

            {showHistory && history.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2 text-xs text-gray-500">
                        <Clock size={12} />
                        <span>Lịch sử đã nhập</span>
                    </div>
                    {history.map((item, index) => (
                        <div
                            key={index}
                            className="flex items-center justify-between px-3 py-2 hover:bg-sky-50 cursor-pointer group transition-colors"
                            onClick={() => selectValue(item)}
                        >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <History size={14} className="text-gray-400 flex-shrink-0" />
                                <span className="text-sm text-gray-700 line-clamp-2">{item}</span>
                            </div>
                            <button
                                onClick={(e) => handleRemove(e, item)}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-all flex-shrink-0"
                                title="Xóa khỏi lịch sử"
                            >
                                <X size={14} className="text-red-500" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
