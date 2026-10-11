# UX/UI cấu hình Cảnh báo học tập — 11/10/2026

Đã chỉnh trang `/settings` theo luồng đọc quy chế, đặt ngưỡng hỗ trợ sớm, kiểm tra ví dụ và lưu phiên bản mới.

- Hiển thị tên đầy đủ Quy chế đào tạo trình độ đại học của Trường Đại học Đà Lạt, số quyết định và thông tin PDF. Có nút xem Điều 18 ở trang 25 của PDF và nút tải nguyên bản 32 trang, 13,7 MB. PDF chỉ tải khi người dùng mở hoặc tải, không được nhúng sẵn vào trang.
- Nhóm ngưỡng nợ tín chỉ, chậm tiến độ và GPA; ví dụ cập nhật theo số đang nhập. Bảng ngưỡng học vụ ở cột đối chiếu, tách khỏi các ô cấu hình.
- Nhóm tiêu chí bổ sung theo điểm học tập, kết quả học phần và rèn luyện. Tỷ lệ không đạt hiển thị bằng phần trăm; gửi API đúng giá trị tỷ lệ như trước.
- Nhãn, đơn vị, thông báo lỗi dưới từng ô và trạng thái lưu rõ ràng. Có hủy thay đổi; ngăn lưu dữ liệu thiếu/sai hoặc ngưỡng nguy cơ cao nhỏ hơn ngưỡng cần chú ý.
- Chỉ sử dụng điểm rèn luyện có trạng thái đã xác minh là công nhận. Thông báo lưu nêu rõ cấu hình dùng cho lần đánh giá tiếp theo, có đường dẫn trở lại chức năng Cảnh báo để chạy lại nếu cần.
- Giữ quyền `academic_warning.policy.manage`, kiểm soát phiên bản và API lưu hiện có. Không ghi thay đổi chính sách trong quá trình chỉnh giao diện.

## Kiểm tra

- 32 kiểm thử frontend đạt, gồm kiểm thử tỷ lệ phần trăm, dữ liệu nhập rỗng, quan hệ ngưỡng, trạng thái công nhận, ví dụ GPA và liên kết PDF.
- TypeScript, lint các tệp thay đổi và build production frontend đạt.
- Trang cấu hình và PDF trả HTTP 200 trên bản production kiểm tra ở cổng 3002 và bản phát triển cổng 3000. PDF có kiểu `application/pdf`; SHA-256 của dữ liệu tải xuống giống file gốc trong `docs`.
- Chính sách trước/sau kiểm tra HTTP giống nhau; chỉ gọi GET. Kết quả kiểm tra cuối ở [tệp JSON](warning-settings-ux-2026-10-11.json).
- Đã loại thư mục build kiểm tra khỏi quét nguồn bằng `.gitignore`, dọn bản kiểm tra và khởi động lại frontend phát triển. Lỗi CSS do quét nhầm build tạm đã hết; cổng 3000 đang trả 200.
- Phiên này không có trình duyệt kết nối; chưa kiểm chứng bố cục bằng ảnh chụp hoặc thao tác thực tế trên trình duyệt. Kiểm tra giao diện gồm cấu trúc HTML của tài liệu, kiểu dữ liệu, luồng API đọc và build.
