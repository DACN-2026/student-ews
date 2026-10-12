# Bỏ yêu cầu người dùng nhập mã công nhận rèn luyện — 11/10/2026

Ô nhập mã trạng thái không phù hợp với người dùng cấu hình Cảnh báo học tập. Dữ liệu rèn luyện đã nhập có 9.375 bản ghi: mã `0` ở 6.631 bản ghi, mã `1` ở 2.744 bản ghi. Đặc tả endpoint rèn luyện mới đọc chỉ mô tả kiểu dữ liệu `StatusID`, không giải thích tên/ý nghĩa công nhận cho từng mã. Không tự suy diễn mã `1` là công nhận chỉ vì có `LastScore`.

## Thay đổi

- Bỏ ô nhập mã và yêu cầu người dùng xác minh mã kỹ thuật trên trang cấu hình.
- Hiển thị thông tin nguồn dữ liệu ngay trên hai tiêu chí rèn luyện. Khi chưa có ánh xạ công nhận đã xác nhận trong chính sách, không cho bật hai tiêu chí này. Các ngưỡng học tập vẫn điều chỉnh và lưu được.
- Khi ánh xạ đã có, người dùng chỉ chọn tiêu chí và nhập ngưỡng; không thấy hoặc phải sửa mã nguồn.
- Giữ nguyên ánh xạ trong dữ liệu gửi API, kiểm soát phiên bản và giới hạn dữ liệu nhập. Không tự thêm mã `0`/`1`, không ghi thay đổi chính sách trong phiên chỉnh giao diện.
- Cập nhật hướng dẫn sử dụng. Đây là cải thiện giao diện, không phải xác nhận ý nghĩa trạng thái của hệ thống đào tạo. Việc bật tiêu chí sau này cần đơn vị quản lý xác nhận và cập nhật ánh xạ nguồn.

## Kiểm tra

- 34 kiểm thử frontend đạt, gồm nguồn chưa xác nhận không chặn ngưỡng học tập, nguồn đã xác nhận giữ nguyên ánh xạ, và nội dung hướng dẫn không có ô nhập mã.
- TypeScript và lint các tệp frontend thay đổi đạt.
- Trang `/settings` trả HTTP 200; chỉ gọi GET, chính sách trước/sau giữ nguyên. Kết quả tại [tệp JSON](conduct-configuration-ux-2026-10-11.json).
- Không có trình duyệt kết nối trong phiên này; chưa kiểm tra thao tác thực tế hoặc ảnh chụp bố cục.

Nguồn đối chiếu: [đặc tả API điểm rèn luyện theo lớp](https://kg8vuz7mh4.apidog.io/l%E1%BA%A5y-danh-s%C3%A1ch-%C4%91i%E1%BB%83m-r%C3%A8n-luy%E1%BB%87n-theo-l%E1%BB%9Bp-42667622e0.md).
