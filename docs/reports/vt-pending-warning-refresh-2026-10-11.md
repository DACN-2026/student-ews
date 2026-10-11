# Cập nhật cảnh báo: VT và học phần chờ điểm

Kỳ hiển thị: HK02 (2025-2026). Đã đánh giá 622 sinh viên; nghỉ học tạm thời vẫn được loại khỏi phạm vi. Engine academic-warning-qd600-article18-and-progress-v19.

**127 sinh viên có 475 học phần VT (1418 TC)** được theo dõi riêng trong kỳ này. Chỉ số này gồm học phần điều kiện; tỷ lệ tín chỉ không đạt học thuật vẫn loại học phần điều kiện. Các môn VT chưa xác minh không tự cộng thành F, không tự gán GPA 0 và không tự kết luận cảnh báo học vụ.

Phân mức hiện tại: 178 nguy cơ cao, 119 cần chú ý. Phân mức nguy cơ chỉ là ưu tiên hỗ trợ, không phải quyết định xử lý học vụ.

## Học phần đang học / chờ điểm

Pending không tạo hay xóa nợ F. Bằng chứng đạt trước mốc xét vẫn được giữ khi học cải thiện; F còn nợ cho đến khi có kết quả đạt/thay thế hợp lệ. Unknown và mã chưa khớp CTĐT vẫn cần đối chiếu.

| Sinh viên | Môn chờ điểm | Tình trạng tổng nợ |
| --- | ---: | --- |
| 2448A014 | 1 | Vẫn cần xác minh VT lịch sử; phần F đã xác định là 11 TC, chưa coi đó là tổng nợ cuối cùng |
| 2448B022 | 4 | Vẫn cần xác minh VT lịch sử; phần F đã xác định là 3 TC, chưa coi đó là tổng nợ cuối cùng |
| 2448B030 | 4 | Vẫn cần xác minh VT lịch sử; phần F đã xác định là 9 TC, chưa coi đó là tổng nợ cuối cùng |

Ba sinh viên này chưa có kết quả đạt/F được xác định từ API cho các môn chờ điểm liệt kê. Thông tin người dùng cung cấp về học lại/cải thiện được dùng để sửa cách xử lý trạng thái pending, không dùng để tự tạo điểm F lịch sử.

## Các phạm vi giữ nguyên

- GPA và tỷ lệ tín chỉ không đạt tiếp tục chưa được đánh giá khi chưa ghi nhận đăng ký học thuật kỳ trước.
- Hoàng Xuân Nghĩa giữ GPA 3,00 và kết quả đối chiếu như trước: chưa xác định được kỳ chính đầu tiên, nợ chưa đủ lịch sử chuyển trường.
- Bốn trường hợp mã học phần chưa khớp CTĐT vẫn cần đối chiếu; không tự tạo alias hoặc công nhận tín chỉ.
- Dương Minh Trung vẫn được đóng băng và giữ dữ liệu lịch sử.

Giữ nguyên toàn bộ 336 hồ sơ can thiệp đã có cùng trạng thái; 11229 sự kiện cũ vẫn nguyên vẹn. Phát sinh 17 hồ sơ hỗ trợ mới khi bổ sung tín hiệu VT ở các kỳ xét. Điểm (31141 bản ghi) và quyết định (912 bản ghi) không bị sửa.

Kiểm tra: backend 354 kiểm thử đạt, 1 bỏ qua; frontend 22 kiểm thử đạt; backend build, frontend TypeScript và lint các tệp thay đổi đều đạt. Đã khởi động lại backend và kiểm tra kết nối cơ sở dữ liệu. Chưa kiểm tra trực quan trong trình duyệt.

[Dữ liệu kiểm chứng](vt-pending-warning-refresh-2026-10-11.json)
