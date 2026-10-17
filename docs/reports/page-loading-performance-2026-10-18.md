# Tối ưu tải dữ liệu các trang — 18/10/2026

Đã áp dụng bản tối ưu vào backend đang chạy. Frontend dùng các thay đổi mới qua máy chủ phát triển hiện có.

## Kết quả đo tại máy hiện tại

| Yêu cầu dữ liệu | Trước | Sau |
| --- | ---: | ---: |
| Tổng hợp tiến độ lần đầu cho toàn bộ sinh viên đang theo dõi | 1.615 ms | 1.025 ms |
| Trang danh sách tiến độ sau khi đã có thống kê | 85 ms | 6 ms |
| Tổng quan ở lượt tổng hợp đầu được đo | 1.580 ms | 1.111 ms |

Đây là thời gian phản hồi yêu cầu dữ liệu cục bộ, không phải thời gian hiển thị hoàn chỉnh trang trên trình duyệt. Mỗi đợt đo gồm một lượt đầu và một lượt lặp; kết quả phụ thuộc trạng thái máy và dữ liệu đã lưu tạm. Các yêu cầu vốn nhanh như danh mục, hồ sơ và bảng điểm riêng lẻ không có cải thiện đáng kể.

## Đã thay đổi

- **Tiến độ và Tổng quan:** đọc chung hồ sơ, lớp, khóa và thông tin chuyển/miễn cho nhóm sinh viên cần tổng hợp; giảm các truy vấn lặp cho từng người. Vẫn xét riêng chương trình và học kỳ của từng sinh viên.
- **Cấu hình đào tạo:** các yêu cầu đồng thời dùng chung lượt đọc cấu hình đang chạy. Lỗi không được giữ lại; lần sau có thể thử đọc lại.
- **Thống kê tiến độ:** chỉ lấy phần kết quả đạt/không đạt cần dùng thay vì truyền toàn bộ nội dung bản ghi gốc. Giữ nguyên cách đọc các kiểu giá trị của Trường; trường hợp lượt học có cùng khóa sắp xếp vẫn dùng cách đọc cũ để giữ nguyên thứ tự.
- **Phân trang tiến độ:** dùng kết quả tổng hợp còn hiệu lực để trả danh sách và thống kê nhất quán, không tính lại các sinh viên trong từng trang. Không tăng thời gian lưu tạm hiện có là 60 giây; vẫn kiểm tra thay đổi tình trạng rời lớp khi xác định phạm vi.
- **Bảng điểm trong Hồ sơ sinh viên:** bắt đầu tải dữ liệu tiến độ cùng lúc với bảng điểm và điểm tổng hợp; thành phần bảng điểm dùng lại yêu cầu đã tải qua bộ nhớ tạm hiện có.
- **Tiến độ đăng ký:** xác định học kỳ trước khi tải kế hoạch, tránh tải toàn bộ rồi tải lại theo kỳ.
- **Cảnh báo học tập:** hủy yêu cầu cũ khi đổi bộ lọc hoặc rời trang; chặn phản hồi cũ ghi đè danh sách mới.

## Kiểm tra

- **471 kiểm thử đạt**, 1 kiểm thử bỏ qua: backend 413 đạt, frontend 58 đạt.
- Kiểm tra TypeScript và dựng cả backend, frontend thành công.
- **637 đối chiếu dữ liệu trùng khớp:** 625 hồ sơ hiện tại và 12 đối chiếu lịch sử, gồm các trường hợp chuyển ngành, VT, nghỉ học và chuyển/miễn.
- Kiểm tra 14 kiểu giá trị kết quả đạt/không đạt của Trường; không thay đổi cách xác định kết quả.
- Các yêu cầu đo sau cập nhật đều trả thành công. Danh sách sinh viên, điểm, tiến độ chi tiết và các chỉ số nghiệp vụ Tổng quan/Cảnh báo giữ nguyên; chỉ thời gian tạo báo cáo thay đổi. Phân trang có thêm thống kê đầy đủ khi đã có kết quả tổng hợp.
- Kiểm tra qua cổng frontend xác nhận 622 sinh viên đang theo dõi: 300 đáp ứng yêu cầu, 322 chậm tiến độ; trang thứ hai trả đúng 20 sinh viên và cùng thống kê.

Không thay đổi điểm, tín chỉ, quyết định hoặc quy tắc đánh giá để đổi lấy tốc độ.

Bằng chứng đo cục bộ nằm trong thư mục `.tmp`: `performance-baseline.json`, `performance-after.json`, `performance-batch-parity.json`, `performance-source-projection.json` và các nhật ký kiểm thử/dựng tương ứng.
