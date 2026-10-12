# Gộp hai mức GPA học kỳ vào một thẻ — 11/10/2026

GPA học kỳ thấp theo QĐ600 và GPA dưới ngưỡng theo dõi sớm cùng dùng một giá trị điểm học kỳ. Đã gộp hai lý do này vào một thẻ chỉ số ở StudentWarningWorkspace, dùng chung cho hồ sơ sinh viên và chi tiết cảnh báo.

- Thẻ hiển thị GPA, ngưỡng theo dõi sớm và ngưỡng học vụ, kèm một vùng đối chiếu bảng điểm và phần căn cứ cho hai ngưỡng.
- Khi đã dưới ngưỡng học vụ, ưu tiên trạng thái này; không thêm thẻ Cần chú ý cho cùng giá trị GPA.
- Khi chỉ đạt điều kiện theo dõi sớm, lấy ngưỡng học vụ từ ruleResults của lần đánh giá đã lưu để vẫn đối chiếu được. Không lấy ngưỡng từ chính sách hiện tại thay thế kết quả lịch sử.
- GPA suy giảm giữ riêng vì đo mức thay đổi giữa các kỳ. Các chỉ số khác giữ nguyên.
- Giữ ngưỡng 0,8 của học kỳ đầu nếu có trong kết quả; không chuyển dữ liệu thiếu thành GPA 0. Nếu hai lý do ghi nhận GPA khác nhau, giữ riêng để không che khuất dữ liệu cần xác minh.
- Không thay thuật toán phân mức, tính lại đợt đánh giá, sửa/xóa lý do, hồ sơ can thiệp hoặc lịch sử.

## Kiểm tra

- 38 kiểm thử frontend đạt. Có kiểm thử một thẻ/một vùng bảng điểm, ưu tiên ngưỡng học vụ, chỉ theo dõi sớm, kỳ đầu, thiếu số liệu và dữ liệu xung đột.
- TypeScript và lint các tệp thay đổi đạt.
- Đọc API thực của Lê Tuấn Đức (2246B017): GPA 0,63, ngưỡng học vụ 1,00, ngưỡng theo dõi sớm 2,00. Hai lý do GPA được gộp vào một thẻ; GPA suy giảm vẫn riêng. Phản hồi API trước/sau không đổi. Chi tiết tại [tệp đối chiếu](term-gpa-card-grouping-2026-10-11.json).
- Phiên này chưa có trình duyệt kết nối; kiểm tra giao diện bằng HTML render tĩnh, kiểu dữ liệu và đối chiếu API, chưa kiểm tra ảnh chụp hoặc thao tác thực tế.
