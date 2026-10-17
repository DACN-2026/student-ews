# Rà soát dữ liệu toàn hệ thống — 18/10/2026

**Đã sửa các cờ đối soát/thiếu dữ liệu do hệ thống xử lý và áp dụng bản sửa lên backend đang dùng ở cổng 3001.** Kiểm chứng qua cả backend và giao diện cổng 3000, không chỉ trên mã nguồn.

| Phạm vi hiện hành | Kết quả |
| --- | --- |
| Tiến độ học tập — 622 sinh viên | 300 đáp ứng, 322 chậm, **0 cần đối soát** |
| Tiến độ chuẩn | **0 lỗi dữ liệu** trong các đợt đang áp dụng |
| Dự kiến tốt nghiệp — 622 sinh viên | **0 cờ đối soát, 0 tiêu chí thiếu dữ liệu** |
| Cảnh báo học tập — 622 kết quả kỳ xét gần nhất | **0 kết quả thiếu dữ liệu**; 178 nguy cơ cao, 146 cần theo dõi, 298 chưa ghi nhận nguy cơ |

Đã sửa:

- Dùng kết quả `IsPass` đã xác định và cờ chờ điểm của Trường, kể cả khi ô điểm số trống; không tự tạo điểm F/0 hoặc tính lại GPA.
- Môn không đạt ngoài CTĐT hiện tại không làm treo phép tính nợ của ngành hiện tại; không tự công nhận môn tương đương theo tên.
- Nhận diện kỳ tiếp theo khi sinh viên chuyển trường đã có bằng chứng học kỳ trước, không yêu cầu phải có học kỳ đầu của khóa hành chính.
- GDQP của **Hoàng Xuân Nghĩa** hiện **Chờ xác nhận điều kiện**, chưa phải đạt. Đối chiếu trực tiếp bảng điểm API không ghi nhận học phần GDQP hoặc trường xác nhận chứng chỉ cho hồ sơ này.
- **Dương Minh Trung — 2347B045** đang nghỉ được chấp thuận: API báo cáo trả **Không thuộc phạm vi đánh giá kỳ này**, không gọi là thiếu dữ liệu.
- Giữ ba bản ghi từng được cách ly do sai phạm vi CTĐT của **Trương Anh Minh — 2347A052** để truy vết; chúng không còn chặn kiểm tra công nhận của CTĐT hiện tại. Hồ sơ đã ngừng theo dõi được ghi rõ, không dùng làm cảnh báo tiến độ hiện tại.
- Tạo phiên bản mới cho **7 phạm vi dự kiến tốt nghiệp, 56 phạm vi cảnh báo lịch sử**; giữ các đợt cũ. Một phạm vi cũ không có sinh viên hiện tại và không có quan hệ khóa–CTĐT được giữ nguyên, không vượt kiểm tra cấu hình để chạy lại.

**Giới hạn chỉ số vẫn được thể hiện đúng:** 46 sinh viên chưa được đánh giá trọn bộ tiêu chí GPA của kỳ xét: 35 không có tín chỉ đăng ký trong kỳ, 11 chưa có GPA kỳ trong nguồn. Hai sinh viên khác chỉ thiếu cơ sở so sánh GPA giữa hai kỳ. Không tự bù GPA hoặc chuyển các tiêu chí chưa đánh giá thành đã đạt. Đây không phải lỗi mất bản ghi khi đồng bộ.

**Đối chiếu nguồn:** kiểm tra 625 sinh viên, 31.141 lượt học và các trường điểm/GPA nguồn, 355 dòng CTĐT, 912 quyết định duy nhất, 41 chính sách học phí và các bản ghi rèn luyện trong phạm vi quản lý. Không phát hiện thiếu bản ghi nguồn hoặc khác giá trị điểm/tín chỉ trong các đối chiếu này. 8.700 dòng SHCD được giữ trong nguồn và không đưa vào bảng điểm học thuật. Chín dòng rèn luyện thuộc ba sinh viên ngoài danh sách quản lý được ghi riêng, không nhập vào hồ sơ hiện tại.

**Cấu hình kỳ học được kê riêng:** 51 dòng phần chung kế thừa kỳ học từ CTĐT gốc theo luồng nhập hiện có. Riêng `20CT3203` và `TC1002C` của `CQ22CT-MMT` đang dùng cấu hình kỳ 7 và kỳ 2 từ script chuẩn hóa cũ, trong khi nhãn nguồn của danh mục chuyên ngành ghi kỳ 1. Đợt này không thay đổi hai cấu hình đó hoặc tuyên bố nhãn kỳ nguồn trùng hoàn toàn với cấu hình kế hoạch; tín chỉ vẫn khớp. Bảng đối chiếu chi tiết được giữ trong bằng chứng.

**Kiểm chứng:** 464 test đạt, 1 bỏ qua; build production và TypeScript đạt. 1.933 kiểm tra API đạt, gồm đủ 625 bảng điểm và 622 hồ sơ tiến độ/chi tiết tốt nghiệp; hai kiểm tra render hồ sơ ngừng theo dõi đạt. Dấu vân tay 12 nhóm dữ liệu nguồn trước/sau khớp hoàn toàn. Không ghi đè điểm, GPA, lịch sử hoặc các hồ sơ can thiệp. Chưa kiểm thử thao tác trực quan trên trình duyệt trong đợt này.

[Bằng chứng và danh sách các tiêu chí chưa phát sinh đủ chỉ số](system-data-integrity-2026-10-18.json).
