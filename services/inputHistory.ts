/**
 * Hook để quản lý lịch sử input trong localStorage
 * Cho phép người dùng xem và chọn lại các giá trị đã nhập trước đó
 */

const STORAGE_KEY = 'skkn_input_history';
const MAX_HISTORY_PER_FIELD = 10; // Giới hạn số lượng lịch sử mỗi field

export interface InputHistory {
    [fieldName: string]: string[];
}

/**
 * Lấy toàn bộ lịch sử từ localStorage
 */
export function getInputHistory(): InputHistory {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch (error) {
        console.error('Error reading input history:', error);
        return {};
    }
}

/**
 * Lấy lịch sử cho một field cụ thể
 */
export function getFieldHistory(fieldName: string): string[] {
    const history = getInputHistory();
    return history[fieldName] || [];
}

/**
 * Thêm giá trị mới vào lịch sử của một field
 * - Loại bỏ duplicates
 * - Đặt giá trị mới nhất lên đầu
 * - Giới hạn số lượng
 */
export function addToHistory(fieldName: string, value: string): void {
    if (!value || value.trim().length < 3) return; // Không lưu giá trị quá ngắn

    try {
        const history = getInputHistory();
        const fieldHistory = history[fieldName] || [];

        // Loại bỏ giá trị trùng lặp (case-insensitive)
        const filtered = fieldHistory.filter(
            item => item.toLowerCase() !== value.toLowerCase()
        );

        // Thêm giá trị mới lên đầu
        filtered.unshift(value.trim());

        // Giới hạn số lượng
        history[fieldName] = filtered.slice(0, MAX_HISTORY_PER_FIELD);

        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
        console.error('Error saving input history:', error);
    }
}

/**
 * Xóa một giá trị khỏi lịch sử
 */
export function removeFromHistory(fieldName: string, value: string): void {
    try {
        const history = getInputHistory();
        if (history[fieldName]) {
            history[fieldName] = history[fieldName].filter(item => item !== value);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        }
    } catch (error) {
        console.error('Error removing from history:', error);
    }
}

/**
 * Xóa toàn bộ lịch sử của một field
 */
export function clearFieldHistory(fieldName: string): void {
    try {
        const history = getInputHistory();
        delete history[fieldName];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
        console.error('Error clearing field history:', error);
    }
}

/**
 * Xóa toàn bộ lịch sử
 */
export function clearAllHistory(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        console.error('Error clearing all history:', error);
    }
}

/**
 * Lưu tất cả fields của form vào lịch sử
 */
export function saveFormToHistory(formData: Record<string, string>): void {
    // Các field cần lưu lịch sử
    const fieldsToSave = [
        'topic',
        'subject',
        'level',
        'grade',
        'school',
        'location',
        'facilities',
        'textbook',
        'researchSubjects',
        'timeframe',
        'applyAI',
        'focus',
        'specialRequirements'
    ];

    fieldsToSave.forEach(field => {
        if (formData[field]) {
            addToHistory(field, formData[field]);
        }
    });
}
