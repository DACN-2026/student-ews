# Phạm vi cảnh báo học kỳ đã qua — 11/10/2026

Theo yêu cầu, đã bỏ tiêu chí **Thời gian đào tạo tối đa** khỏi bộ tính toán cảnh báo. Engine tăng lên v18 để tạo kết quả mới, không sửa/xóa lịch sử đánh giá. Giao diện bỏ tiêu chí này trong cả định dạng kết quả cũ, số tiêu chí chưa đánh giá và gợi ý hỗ trợ.

Đã gỡ hai khối **Theo dõi trong kỳ hiện tại** và **Đối chiếu đăng ký và quyết định học vụ** khỏi workspace dùng chung cho hồ sơ sinh viên và drawer cảnh báo. Hai component không còn được sử dụng đã được xóa; mở chi tiết không gọi API của hai khối này. Bằng chứng từng tiêu chí vẫn đối chiếu đúng kỳ đã xét. Quyết định nguồn ở backend tiếp tục xác định phạm vi nghỉ học/học lại/rời lớp theo kỳ.

Đã tính lại 56 phạm vi chương trình thuộc 8 học kỳ chính trước có dữ liệu, không tính kỳ hiện tại. Kiểm tra 2.766 kết quả mới: không có `ACADEMIC_STUDY_DURATION_REVIEW`, không có phạm vi thất bại. Sinh viên Trương Kim An (2246A048) có kết quả mới trong các kỳ lịch sử. Hồ sơ Dương Minh Trung vẫn đóng băng, giữ 53 tín chỉ trước nghỉ, hồ sơ hỗ trợ chỉ đọc và lịch sử không đổi.

Kiểm thử backend: 349 đạt, 1 bỏ qua; frontend: 21 đạt. Production build backend, typecheck frontend và lint các tệp thay đổi đạt. Backend cục bộ được khởi động lại và healthcheck xác nhận kết nối cơ sở dữ liệu. Chưa kiểm tra trực quan bằng trình duyệt trong thay đổi này.

[Chi tiết đợt đánh giá và kiểm tra dữ liệu](previous-term-warning-criteria-2026-10-11.json).
