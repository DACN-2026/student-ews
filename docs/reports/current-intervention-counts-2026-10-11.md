# Một sinh viên, một hồ sơ can thiệp hiện hành — 11/10/2026

Đã sửa cách đếm và danh sách mặc định của Cảnh báo học tập: mỗi sinh viên được chọn một hồ sơ hiện hành, ưu tiên hồ sơ đang mở/xử lý; khi có nhiều ứng viên cùng loại, chọn đợt được tạo mới nhất. Chọn hồ sơ trước khi lọc trạng thái, mức nguy cơ, học kỳ và phân trang để hồ sơ hoàn tất cũ không xuất hiện thay thế hồ sơ đang mở.

API tổng hợp, thống kê theo lớp và danh sách dùng cùng cách chọn. API danh sách bổ sung `view=history` để tra cứu riêng các đợt đã hoàn tất. Tab Lịch sử can thiệp sử dụng chế độ này. Các bộ lọc Hoàn tất trong danh sách hiện hành chỉ áp dụng cho hồ sơ hiện hành đã hoàn tất.

Giao diện bỏ cách cộng tổng các đợt hỗ trợ vào tổng hồ sơ hiện hành. Phần tổng hợp ghi rõ mỗi sinh viên một hồ sơ; khối lịch sử hiển thị riêng số đợt hỗ trợ đã hoàn tất và liên kết đến tab Lịch sử can thiệp.

## Đối chiếu dữ liệu thực tế

- HK02 (2025–2026): 297 sinh viên có nguy cơ = 178 nguy cơ cao + 119 cần chú ý.
- 297 hồ sơ hiện hành: 297 chưa xử lý, 0 đang xử lý, 0 hoàn tất, 0 quá hạn.
- Danh sách gồm 297 sinh viên riêng biệt trên ba trang API; tổng và phân trang thống nhất với báo cáo.
- Ba đợt đã hoàn tất của Hán Quang Dũng, Đỗ Hoàng Giang và Phan Anh Minh vẫn nằm trong lịch sử riêng. Hồ sơ lịch sử của Phan Anh Minh chưa có liên kết hiện hành hợp lệ; giữ nguyên dữ liệu nguồn, không tự sửa căn cứ học kỳ.
- Không cập nhật/xóa hồ sơ, ghi chú, trạng thái hoặc sự kiện. Số bản ghi hồ sơ và sự kiện trước/sau kiểm tra HTTP không đổi.
- Backend: 360 kiểm thử, 359 đạt và 1 bỏ qua sẵn có; frontend: 32 kiểm thử đạt. TypeScript, lint các tệp thay đổi và build backend đạt; còn một cảnh báo lint đã tồn tại trong tệp kiểm thử.
- Có kiểm thử hồ sơ cũ đã hoàn tất, hồ sơ lịch sử mất liên kết, lọc trạng thái sau khi chọn hồ sơ hiện hành, phân trang và bảo toàn lịch sử. Kiểm thử quyền truy cập hiện có tiếp tục đạt.
- Đã khởi động lại backend ở cổng 3001 và kiểm tra API thực. Chưa kiểm tra trực quan bằng trình duyệt.

Kết quả HTTP tại [tệp đối chiếu](current-intervention-counts-2026-10-11.json).
