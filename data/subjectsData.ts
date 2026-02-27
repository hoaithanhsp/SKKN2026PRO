// Database Môn học / Lĩnh vực cho ứng dụng viết SKKN
// Dữ liệu được phân nhóm để AI tham khảo khi viết nội dung bám sát lĩnh vực

export interface SubjectItem {
    id: number;
    name: string;
    group: string;
    description: string;
}

export const SUBJECTS_DATA: SubjectItem[] = [
    { id: 1, name: 'Bồi dưỡng giáo viên', group: 'Giáo dục - Đào tạo', description: 'Các phương pháp, kinh nghiệm trong việc bồi dưỡng chuyên môn, nghiệp vụ cho giáo viên' },
    { id: 2, name: 'Chăm sóc nuôi dưỡng', group: 'Mầm non', description: 'Kinh nghiệm chăm sóc, nuôi dưỡng trẻ em tại các cơ sở giáo dục mầm non' },
    { id: 3, name: 'Chủ nhiệm', group: 'Quản lý lớp học', description: 'Kinh nghiệm công tác chủ nhiệm lớp, quản lý học sinh, xây dựng tập thể lớp' },
    { id: 4, name: 'Chuyển đổi số', group: 'Công nghệ - Giáo dục', description: 'Ứng dụng công nghệ số trong dạy học và quản lý giáo dục' },
    { id: 5, name: 'Cơ bản', group: 'Kỹ thuật', description: 'Kiến thức và kỹ năng cơ bản trong lĩnh vực kỹ thuật' },
    { id: 6, name: 'Cơ khí', group: 'Kỹ thuật công nghiệp', description: 'Kinh nghiệm giảng dạy và thực hành cơ khí' },
    { id: 7, name: 'Công đoàn', group: 'Tổ chức - Đoàn thể', description: 'Hoạt động công đoàn trong trường học, bảo vệ quyền lợi giáo viên' },
    { id: 8, name: 'Công nghệ công nghiệp', group: 'Kỹ thuật - Công nghệ', description: 'Giảng dạy và ứng dụng công nghệ công nghiệp' },
    { id: 9, name: 'Công nghệ nông nghiệp', group: 'Nông nghiệp - Công nghệ', description: 'Giảng dạy và ứng dụng công nghệ trong nông nghiệp' },
    { id: 10, name: 'Công nghệ thông tin', group: 'CNTT - Giáo dục', description: 'Ứng dụng CNTT trong dạy học, quản lý và các hoạt động giáo dục' },
    { id: 11, name: 'Công tác Đoàn, Đội', group: 'Tổ chức - Đoàn thể', description: 'Kinh nghiệm tổ chức hoạt động Đoàn Thanh niên, Đội Thiếu niên trong trường học' },
    { id: 12, name: 'Đạo đức', group: 'Giáo dục nhân cách', description: 'Giảng dạy môn Đạo đức, giáo dục phẩm chất đạo đức cho học sinh' },
    { id: 13, name: 'Địa lý', group: 'Khoa học xã hội', description: 'Phương pháp giảng dạy môn Địa lý hiệu quả' },
    { id: 14, name: 'Điện máy', group: 'Kỹ thuật điện', description: 'Kinh nghiệm giảng dạy và thực hành điện máy' },
    { id: 15, name: 'Giáo dục công dân', group: 'Giáo dục nhân cách', description: 'Phương pháp giảng dạy môn Giáo dục công dân, giáo dục pháp luật cho học sinh' },
    { id: 16, name: 'Giáo dục địa phương', group: 'Giáo dục - Địa phương', description: 'Tích hợp nội dung giáo dục địa phương vào chương trình học' },
    { id: 17, name: 'Giáo dục hướng nghiệp', group: 'Hướng nghiệp', description: 'Kinh nghiệm tư vấn, định hướng nghề nghiệp cho học sinh' },
    { id: 18, name: 'Giáo dục Kinh tế và Pháp luật', group: 'Kinh tế - Pháp luật', description: 'Giảng dạy kiến thức kinh tế và pháp luật cho học sinh THPT' },
    { id: 19, name: 'Giáo dục mẫu giáo, nhà trẻ', group: 'Mầm non', description: 'Phương pháp giáo dục trẻ mầm non, mẫu giáo và nhà trẻ' },
    { id: 20, name: 'Giáo dục nghề nghiệp', group: 'Hướng nghiệp - Dạy nghề', description: 'Kinh nghiệm giảng dạy và đào tạo nghề nghiệp cho học sinh' },
    { id: 21, name: 'Giáo dục quốc phòng và an ninh', group: 'Quốc phòng - An ninh', description: 'Giảng dạy môn Giáo dục quốc phòng và an ninh' },
    { id: 22, name: 'Giáo dục tập thể', group: 'Giáo dục nhân cách', description: 'Xây dựng tinh thần tập thể, kỹ năng làm việc nhóm cho học sinh' },
    { id: 23, name: 'Giáo dục thể chất', group: 'Thể dục - Thể thao', description: 'Phương pháp giảng dạy thể dục, rèn luyện sức khỏe cho học sinh' },
    { id: 24, name: 'Giáo dục thường xuyên', group: 'Giáo dục - Đào tạo', description: 'Kinh nghiệm giảng dạy và quản lý trong hệ thống giáo dục thường xuyên' },
    { id: 25, name: 'Giáo dục tiểu học', group: 'Tiểu học', description: 'Phương pháp giảng dạy và quản lý học sinh bậc tiểu học' },
    { id: 26, name: 'Hoá học', group: 'Khoa học tự nhiên', description: 'Phương pháp giảng dạy môn Hóa học, thí nghiệm thực hành' },
    { id: 27, name: 'Hoạt động trải nghiệm hướng nghiệp', group: 'Hướng nghiệp - Trải nghiệm', description: 'Tổ chức các hoạt động trải nghiệm thực tế gắn với định hướng nghề nghiệp' },
    { id: 28, name: 'Kế toán', group: 'Kinh tế - Tài chính', description: 'Giảng dạy kế toán, quản lý tài chính trong trường học' },
    { id: 29, name: 'Khoa học', group: 'Khoa học tự nhiên', description: 'Phương pháp giảng dạy môn Khoa học ở bậc tiểu học' },
    { id: 30, name: 'Kỹ năng sống', group: 'Giáo dục nhân cách', description: 'Giáo dục kỹ năng sống, kỹ năng mềm cho học sinh' },
    { id: 31, name: 'Lịch sử', group: 'Khoa học xã hội', description: 'Phương pháp giảng dạy môn Lịch sử hiệu quả, sáng tạo' },
    { id: 32, name: 'Mỹ thuật', group: 'Nghệ thuật', description: 'Phương pháp giảng dạy môn Mỹ thuật, phát triển năng khiếu thẩm mỹ' },
    { id: 33, name: 'Ngoại ngữ', group: 'Ngôn ngữ', description: 'Phương pháp giảng dạy ngoại ngữ (Anh, Pháp, Nhật...) hiệu quả' },
    { id: 34, name: 'Ngữ văn', group: 'Ngôn ngữ - Văn học', description: 'Phương pháp giảng dạy môn Ngữ văn, phát triển năng lực đọc viết' },
    { id: 35, name: 'Nhân viên', group: 'Hành chính - Nhân sự', description: 'Kinh nghiệm công tác của nhân viên hành chính, y tế, bảo vệ trong trường học' },
    { id: 36, name: 'Phong trào trường học', group: 'Tổ chức - Phong trào', description: 'Tổ chức các phong trào thi đua, hoạt động ngoại khóa trong trường học' },
    { id: 37, name: 'Phương pháp dạy học', group: 'Sư phạm', description: 'Đổi mới phương pháp dạy học tích cực, hiệu quả' },
    { id: 38, name: 'Quản lý', group: 'Quản lý giáo dục', description: 'Kinh nghiệm quản lý trường học, quản lý chuyên môn' },
    { id: 39, name: 'Sinh học', group: 'Khoa học tự nhiên', description: 'Phương pháp giảng dạy môn Sinh học, thực hành thí nghiệm' },
    { id: 40, name: 'Sức khỏe học đường', group: 'Y tế - Sức khỏe', description: 'Chăm sóc sức khỏe học sinh, phòng chống bệnh học đường' },
    { id: 41, name: 'Tâm lý học đường', group: 'Tâm lý - Giáo dục', description: 'Hỗ trợ tâm lý học sinh, phòng ngừa và can thiệp các vấn đề tâm lý' },
    { id: 42, name: 'Tham vấn học đường', group: 'Tâm lý - Tư vấn', description: 'Kinh nghiệm tư vấn, hỗ trợ học sinh và phụ huynh trong môi trường học đường' },
    { id: 43, name: 'Thanh tra', group: 'Quản lý - Kiểm tra', description: 'Kinh nghiệm công tác thanh tra, kiểm tra trong giáo dục' },
    { id: 44, name: 'Thiết bị dạy học', group: 'Cơ sở vật chất', description: 'Sử dụng và sáng tạo thiết bị dạy học hiệu quả' },
    { id: 45, name: 'Thủ công', group: 'Nghệ thuật - Kỹ năng', description: 'Phương pháp giảng dạy thủ công, rèn luyện kỹ năng khéo léo cho học sinh' },
    { id: 46, name: 'Thư viện', group: 'Hành chính - Thư viện', description: 'Quản lý và phát triển thư viện trường học, khuyến đọc' },
    { id: 47, name: 'Tiếng Việt', group: 'Ngôn ngữ', description: 'Phương pháp giảng dạy môn Tiếng Việt ở bậc tiểu học' },
    { id: 48, name: 'Tin học', group: 'CNTT - Giáo dục', description: 'Phương pháp giảng dạy môn Tin học, lập trình cho học sinh' },
    { id: 49, name: 'Toán', group: 'Khoa học tự nhiên', description: 'Phương pháp giảng dạy môn Toán, phát triển tư duy logic' },
    { id: 50, name: 'Tự chọn', group: 'Đa lĩnh vực', description: 'Các chủ đề tự chọn theo nhu cầu và điều kiện của nhà trường' },
    { id: 51, name: 'Tự nhiên xã hội', group: 'Khoa học tổng hợp', description: 'Phương pháp giảng dạy môn Tự nhiên và Xã hội ở bậc tiểu học' },
    { id: 52, name: 'Văn phòng', group: 'Hành chính', description: 'Kinh nghiệm công tác văn phòng, hành chính trong trường học' },
    { id: 53, name: 'Văn thư', group: 'Hành chính', description: 'Kinh nghiệm công tác văn thư, lưu trữ hồ sơ trong trường học' },
    { id: 54, name: 'Vật lý', group: 'Khoa học tự nhiên', description: 'Phương pháp giảng dạy môn Vật lý, thí nghiệm thực hành' },
];

// Lấy danh sách nhóm duy nhất (đã sắp xếp)
export const SUBJECT_GROUPS: string[] = [...new Set(SUBJECTS_DATA.map(s => s.group))].sort();

// Tra cứu mô tả theo tên môn/lĩnh vực
export function getSubjectDescription(name: string): string | null {
    const found = SUBJECTS_DATA.find(
        s => s.name.toLowerCase() === name.toLowerCase()
    );
    return found ? found.description : null;
}

// Tra cứu thông tin đầy đủ theo tên
export function getSubjectInfo(name: string): SubjectItem | null {
    return SUBJECTS_DATA.find(
        s => s.name.toLowerCase() === name.toLowerCase()
    ) || null;
}

// Lọc theo nhóm
export function getSubjectsByGroup(group: string): SubjectItem[] {
    return SUBJECTS_DATA.filter(s => s.group === group);
}

// Tìm kiếm theo từ khóa (tên hoặc nhóm)
export function searchSubjects(query: string): SubjectItem[] {
    if (!query.trim()) return SUBJECTS_DATA;
    const lowerQuery = query.toLowerCase();
    return SUBJECTS_DATA.filter(
        s => s.name.toLowerCase().includes(lowerQuery) ||
            s.group.toLowerCase().includes(lowerQuery)
    );
}
