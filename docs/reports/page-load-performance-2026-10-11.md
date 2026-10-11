# Tối ưu tốc độ tải trang — 11/10/2026

Đã giảm dữ liệu đọc từ các đợt đánh giá cũ và lượt gọi API lặp khi khởi tạo trang. Không thay đổi cách tính hoặc phân mức cảnh báo.

## Số đo trước và sau

Đo tuần tự qua HTTP trên cùng máy, backend Next.js production ở cổng 3001, cùng tài khoản quản trị và cùng truy vấn. Mỗi API được gọi hai lần ở mỗi bản. Bảng dùng lần thứ hai để giảm ảnh hưởng khởi động. Đây là thời gian nhận toàn bộ phản hồi API, không phải thời gian trình duyệt hiển thị đầy đủ trang.

| Dữ liệu phục vụ trang | Trước | Sau | Giảm thời gian |
| --- | ---: | ---: | ---: |
| Danh sách sinh viên, trang đầu 20 sinh viên | 6.584 ms | 46 ms | 99,3% |
| Báo cáo Cảnh báo học tập | 6.846 ms | 151 ms | 97,8% |
| Chi tiết cảnh báo sinh viên | 1.200 ms | 44 ms | 96,3% |
| Tổng quan | 12.807 ms | 1.381 ms | 89,2% |

Lần gọi đầu sau khởi động backend: danh sách sinh viên 134 ms, báo cáo cảnh báo 179 ms, chi tiết cảnh báo 67 ms, Tổng quan 1.303 ms. Tiến độ vẫn tải theo trang trước, thống kê toàn bộ chạy riêng; lần tính toàn bộ đầu tiên khoảng 1,25 giây. Dự kiến tốt nghiệp vốn đã tải nhanh, khoảng 19–32 ms.

Dữ liệu đo: [trước](page-load-performance-before-2026-10-11.json), [sau](page-load-performance-after-2026-10-11.json).

## Các thay đổi

- Báo cáo cảnh báo đọc thông tin đợt đánh giá mà không kéo toàn bộ `sourceSnapshot` của mọi phiên bản cũ. Biểu đồ lịch sử chỉ đọc các trường thống kê; tiêu chí chi tiết chỉ đọc cho kỳ được chọn.
- PostgreSQL chỉ trả phần quyết định loại trừ cần giải thích cho sinh viên chưa có kết quả trong phạm vi đang xem. Giữ giải thích cả đợt đánh giá hoàn toàn không có kết quả vì tất cả sinh viên được loại trừ.
- Tổng quan, lịch sử cảnh báo của sinh viên, danh sách đợt tính tiến độ và chi tiết kế hoạch không tải bản chụp nguồn khi giao diện chỉ dùng thông tin tổng hợp.
- Layout chuyển phiên đã xác thực ở server xuống client, bỏ lần gọi `/auth/me` thứ hai. Trang con chỉ được mở sau khi quyền và phạm vi cache đã được khởi tạo; đổi quyền sẽ xóa cache của phạm vi cũ. API `/auth/me` cũng tái sử dụng actor vừa được kiểm tra trong chính yêu cầu đó.
- Trang Cảnh báo hiện kết quả đã lưu trong lúc đồng bộ lịch sử chạy nền; khi đồng bộ thành công, báo cáo và tab đang mở tải lại kết quả. Lỗi đồng bộ vẫn được thông báo.
- Chi tiết cảnh báo, hồ sơ can thiệp và danh sách chưa phân loại tải mã giao diện khi mở, giảm mã cần tải ban đầu.

## Xác minh

- Toàn bộ phản hồi của bảy API dữ liệu trước/sau giống nhau, chỉ bỏ qua thời điểm tạo phản hồi của báo cáo và Tổng quan khi so sánh.
- 622 sinh viên được đánh giá; nguy cơ cao 178, cần chú ý 119, chưa ghi nhận nguy cơ 325. Tiến độ: 300 đúng tiến độ, 322 chậm tiến độ.
- Kiểm tra tài khoản CVHT: kết quả chỉ chứa sinh viên trong phạm vi được cấp.
- Dương Minh Trung vẫn được loại khỏi đánh giá trong kỳ nghỉ, tiến độ hiển thị lịch sử đã đóng băng.
- Backend: 359 kiểm thử, 358 đạt, 1 bỏ qua sẵn có. Frontend: 25 kiểm thử đạt, gồm kiểm thử khởi tạo phiên không gọi lại API và xóa cache khi quyền thay đổi.
- TypeScript, lint các tệp thay đổi và build production cả hai ứng dụng đạt. Frontend được build và chạy kiểm tra ở thư mục/cổng riêng, không ghi đè bản frontend phát triển đang chạy.
- HTTP production frontend trả 200 cho Tổng quan, Sinh viên, Đào tạo, Tiến độ, Dự kiến tốt nghiệp, Cảnh báo và hồ sơ sinh viên. Kiểm tra này xác nhận phản hồi HTML; chưa đo thời gian render hoặc thao tác giao diện trên trình duyệt vì phiên này không có trình duyệt kết nối.

Backend tối ưu đã chạy lại ở cổng 3001; frontend phát triển tiếp tục dùng cổng 3000. Tốc độ thực tế còn phụ thuộc cấu hình máy, mạng và số lượng sinh viên. Lần mở đầu trong chế độ phát triển có thể phải chờ Next.js biên dịch trang.
