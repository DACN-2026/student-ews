# Nhận diện học phần K49 và đối chiếu Trương Anh Minh — 07/10/2026

## Học phần 25BC0001

API CTĐT CQ25CT hiện trả học phần **25BC0001 — Trí tuệ nhân tạo, Blockchain và ứng dụng**, 3 tín chỉ, học kỳ 2, loại Tự Chọn. Kế hoạch giảng dạy nội bộ cũng đã chứa học phần trong lựa chọn học kỳ 2.

Theo yêu cầu nhận diện của người dùng, bổ sung học phần vào nhóm A6:9 của CQ25CT và các chuyên ngành thuộc CQ25CT. Giữ nguyên mã môn nguồn và ngưỡng nhóm 9 TC; tín chỉ chỉ được tính khi kết quả đã đạt. Bộ tính tiến độ, đối chiếu tự chọn và danh sách học phần thay thế dùng cùng nhận diện. Không áp dụng nhận diện mới cho CQ22CT–CQ24CT.

Kết quả đánh giá lại trên dữ liệu hiện có:

| Phạm vi | Đúng tiến độ | Chậm tiến độ | Cần đối soát |
| --- | ---: | ---: | ---: |
| K49 / CQ25CT | 126 | 113 | 0 |
| Toàn hệ thống (625 sinh viên) | 300 | 324 | 1 |

126 sinh viên trước đây bị xếp UNKNOWN vì nhóm CHUNG của 25BC0001 hiện được xác nhận ON_TRACK. 113 trường hợp chậm của K49 vẫn được đánh giá theo kết quả học. Thanh phân bố dùng số lượng thực để tính độ rộng và hiển thị cả nhóm Cần đối soát.

Nguồn: [API CTĐT](https://kg8vuz7mh4.apidog.io/l%E1%BA%A5y-chi-ti%E1%BA%BFt-ch%C6%B0%C6%A1ng-tr%C3%ACnh-%C4%91%C3%A0o-t%E1%BA%A1o-42667626e0.md).

## Trương Anh Minh — 2347A052

Đối chiếu API trực tiếp ngày 07/10/2026, kết quả chi tiết đã lọc lưu tại [source-api-truong-anh-minh-2026-10-07.json](source-api-truong-anh-minh-2026-10-07.json).

Danh sách lớp ITK47A trả **Trương Anh Minh**, MSSV **2347A052**, mã chương trình **CQ23CT**. [Nguồn danh sách lớp](https://kg8vuz7mh4.apidog.io/l%E1%BA%A5y-danh-s%C3%A1ch-sinh-vi%C3%AAn-theo-m%C3%A3-l%E1%BB%9Bp-42667620e0.md).

Kết quả gọi LayBangDiemSinhVien với p1=2347A052, p3=ALL, p4=ALL:

| p2 | Kết quả |
| --- | --- |
| CQ23CT | Mảng rỗng |
| CQ23CT-PM | 3 đăng ký HK01, năm 2026–2027, chưa có điểm |
| CQ23CT-MMT | Cùng 3 học phần và trạng thái; trường StudyProgramID mang mã MMT |

| Mã HP | Học phần | TC |
| --- | --- | ---: |
| 20CT1101 | Nhập môn ngành CNTT | 3 |
| 20CT1102 | Nguyên lý lập trình cấu trúc | 4 |
| 20LH0001 | Pháp luật đại cương | 3 |

Cả ba bản ghi có NotScore=1; IsPass và các trường điểm đều null. Đây là 10 TC đăng ký chờ kết quả. Hai truy vấn chuyên ngành không phải bằng chứng để cộng thành 6 môn hoặc 20 TC. Nguồn hiện không cung cấp lịch sử đạt/công nhận tín chỉ cho sinh viên này. [Nguồn bảng điểm](https://kg8vuz7mh4.apidog.io/l%E1%BA%A5y-b%E1%BA%A3ng-%C4%91i%E1%BB%83m-chi-ti%E1%BA%BFt-c%E1%BB%A7a-sinh-vi%C3%AAn-42667625e0.md).

API quyết định trả **Tiếp nhận Chuyển trường**, số **721/QÐ-ÐHÐL_25062026**, ký **25/06/2026**. Đây là căn cứ để kiểm tra hồ sơ tiếp nhận và công nhận tín chỉ trước khi xác định lộ trình học; chưa xác nhận chuyên ngành thực tế từ kết quả bảng điểm trên. [Nguồn quyết định](https://kg8vuz7mh4.apidog.io/l%E1%BA%A5y-danh-s%C3%A1ch-quy%E1%BA%BFt-%C4%91%E1%BB%8Bnh-c%E1%BB%A7a-sinh-vi%C3%AAn-42667623e0.md).

Đối chiếu DB: hồ sơ đang mang CQ23CT; không có đăng ký/summary trong bảng vận hành. Cả ba đăng ký nguồn đã được lưu ở bảng đối soát với reason=API_PROGRAM_SCOPE_CONFLICT, cùng năm/kỳ và NotScore=1. Quyết định tiếp nhận chuyển trường cũng đã được lưu. Lần kiểm tra này chỉ đọc dữ liệu sinh viên, không sửa hồ sơ hoặc tự chọn chuyên ngành.

## Cập nhật trạng thái rời lớp theo yêu cầu người dùng

Ngày 07/10/2026, kiểm tra lại quyết định nguồn: FullText là **“Chuyển trường đến (CTK47A -> CTK47A)”**, DecisionName là **“Tiếp nhận Chuyển trường”**. Nội dung tóm tắt giao diện khớp dữ liệu nguồn. Danh sách lớp nguồn vẫn trả IsInClass=true; quyết định này mô tả tiếp nhận đến, không phải chuyển đi.

Người dùng đã xác nhận **“Đánh dấu Minh đã rời lớp”**. Cập nhật riêng trạng thái trong hệ thống nội bộ của 2347A052 thành isInClass=false bằng API PATCH sinh viên; không sửa quyết định hoặc dữ liệu Apidog. Nhật ký student.membership.update lưu previousIsInClass=true và isInClass=false.

Các chức năng theo dõi dùng phạm vi còn trong lớp: tổng quan, tiến độ, đánh giá đăng ký/hoàn thành, dự kiến tốt nghiệp, cảnh báo học tập, hàng đợi can thiệp và xuất báo cáo. Danh sách sinh viên và hồ sơ lịch sử vẫn giữ Minh. Các kết quả đánh giá đã lưu được lọc trước phân trang và tổng hợp; không xóa lịch sử. Cache thống kê tiến độ phân biệt trạng thái rời lớp/quay lại lớp để không giữ số lượng cũ.

Đối chiếu API ứng dụng sau cập nhật:

| Kiểm tra | Kết quả |
| --- | --- |
| Danh sách sinh viên tìm 2347A052 | 1 hồ sơ, isInClass=false |
| Tiến độ tìm 2347A052 | 0 sinh viên |
| Cảnh báo học tập tìm 2347A052 | 0 sinh viên |
| Đợt dự kiến tốt nghiệp đã có Minh, tìm 2347A052 | 0 sinh viên; tổng đợt CQ23CT còn 7 |
| Tổng quan / thống kê tiến độ | 624 sinh viên |
| Đúng tiến độ / chậm tiến độ / cần đối soát | 300 / 324 / 0 |
| Quyết định tiếp nhận chuyển trường | Nội dung gốc được giữ |

Kiểm tra kỹ thuật: 270 kiểm thử đạt, 1 bỏ qua, 0 lỗi; backend và frontend build thành công; backend lint 0 lỗi (2 cảnh báo có sẵn). Bổ sung kiểm thử phạm vi theo dõi, phân trang, tổng hợp đợt/nhóm và cache khi rời lớp/quay lại lớp.
