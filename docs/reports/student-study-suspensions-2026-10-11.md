# Đóng băng hồ sơ nghỉ học tạm thời — 11/10/2026

Đã đồng bộ 625 sinh viên từ quyết định nguồn, tạo 5 khoảng nghỉ có quyết định hợp lệ. Bốn sinh viên đã có quyết định học lại có hiệu lực tiếp tục được theo dõi. Quyết định nghỉ đã hủy không tạo khoảng đóng băng. Không sửa cờ thuộc lớp hay xóa lịch sử.

**Dương Minh Trung — 2347B045** đang nghỉ từ HKII 2025–2026 theo quyết định `332/QÐ-ÐHÐL_03042026`, ký 03/04/2026. Chưa có quyết định học lại hợp lệ, nên hồ sơ vẫn đóng băng dù văn bản nêu mốc kết thúc nghỉ. Khi quyết định học lại có hiệu lực, hệ thống khôi phục theo dõi theo kỳ tương ứng.

- Hồ sơ vẫn thuộc lớp, có tag đang nghỉ học tạm thời.
- Tiến độ và dashboard cá nhân dùng dữ liệu đến HKI 2025–2026, giữ 53 tín chỉ đã đạt; không tính các kỳ nghỉ thành thiếu đăng ký hoặc chậm tiến độ mới.
- Không đưa vào phân mức cảnh báo, tính tiến độ, dự kiến tốt nghiệp và thống kê vận hành trong kỳ nghỉ. Báo cáo cảnh báo giải thích rõ nhóm không phân mức.
- Hồ sơ hỗ trợ cũ chỉ đọc, giữ trạng thái và 30 sự kiện lịch sử; không nằm trong hàng đợi hay tính quá hạn. API chặn tạo/cập nhật hỗ trợ mới.
- Bảng điểm, quyết định và cảnh báo trước nghỉ giữ nguyên để tra cứu. Quyết định bị hủy và quyết định học lại được đồng bộ lại; nhập đăng ký không tự thay thế quyết định học lại.

Kiểm tra dịch vụ trên dữ liệu thật xác nhận Trung bị loại trong HKII 2025–2026 nhưng vẫn tra cứu được HKI 2025–2026; bốn sinh viên đã học lại vẫn được theo dõi. Đồng bộ lặp không thay đổi bản ghi. Đã tính lại 7 phạm vi cảnh báo của HKII 2025–2026 bằng engine v17, tất cả hoàn tất. Ngưỡng phân mức không thay đổi.

Kiểm thử backend: 349 đạt, 1 bỏ qua; frontend: 20 đạt. Kiểm thử bổ sung báo cáo xác nhận khoảng nghỉ được giải thích cả khi snapshot không có miễn trừ và kết quả nguy cơ cũ không bị tính vào kỳ nghỉ. Typecheck và production build backend đạt. Chưa thực hiện kiểm tra trực quan bằng trình duyệt cho thay đổi này.

Chi tiết dữ liệu: [đồng bộ](student-study-suspensions-2026-10-11.json), [kiểm tra dịch vụ](student-study-suspension-verification-2026-10-11.json), [tính lại cảnh báo](student-study-suspension-warning-refresh-2026-10-11.json).
