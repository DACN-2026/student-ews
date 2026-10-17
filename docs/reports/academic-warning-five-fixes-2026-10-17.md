# Đã sửa 5 điểm của Cảnh báo học tập — 17/10/2026

**API của Trường là nguồn chuẩn.** Các thay đổi sửa cách hệ thống xử lý và trình bày; không sửa điểm, GPA, quyết định hoặc hồ sơ nguồn.

| Điểm | Đã xử lý |
| --- | --- |
| **1. Mốc theo dõi trong kỳ** | Đối chiếu tiến độ đến trước kỳ đang học; không báo thiếu toàn bộ tín chỉ đang chờ điểm. Bốn hồ sơ từng bị báo đỏ do thiếu 15–18 TC đang học nay có thiếu hụt đúng mốc là **0**. |
| **2. Chuyển trường/chuyển miễn** | Đọc kết quả đạt và dấu `R` từ API; tính tín chỉ công nhận từ mốc quyết định tiếp nhận, không bịa kỳ học gốc. Không tạo cảnh báo thiếu đăng ký trước mốc tiếp nhận chuyển trường. Hồ sơ 2347A048 được tính 5 môn học thuật và 2 môn điều kiện đã công nhận: **nợ 0 TC**, thiếu tiến độ theo CTĐT giảm **20 → 8 TC**. |
| **3. Học bù/môn khác mã** | Bỏ tự ghép theo tên; dùng mã và các tương đương theo CTĐT đã xác nhận. Không tự đổi môn 2 TC thành 3 TC. Các cặp mã chưa được cấu hình được ghi rõ là việc đối chiếu ánh xạ của hệ thống; không kết luận API thiếu dữ liệu hay sinh viên chưa đạt môn đó. |
| **4. VT** | VT là vắng thi; đạt/không đạt dùng `isPass` của API, thống nhất giữa tiến độ, nợ, tỷ lệ tín chỉ và theo dõi. Giữ nguyên mã VT, không tự đổi thành điểm F/0. Chi tiết hiển thị riêng VT và kết quả theo API. Học cải thiện giữ tín chỉ đã đạt; học lại đang chờ không tạo thêm lần không đạt. |
| **5. Bằng chứng đúng kỳ** | Mở chi tiết mặc định đúng kết quả cảnh báo, kỳ và CTĐT; tải lại vẫn giữ mốc. Có nút riêng xem tiến độ hiện tại. API chặn dùng kết quả cảnh báo của sinh viên khác. |

**Đã cập nhật kết quả:** phiên bản bộ tính `v22`; 56 phạm vi đánh giá được xử lý với chính sách gốc và giữ các đợt cũ. Một phạm vi lịch sử không còn cấu hình khóa/CTĐT được giữ nguyên. Cả **622/622 sinh viên** trong báo cáo hiện hành dùng phiên bản mới.

**Kiểm tra:** 430 test đạt, 1 test bỏ qua theo cấu hình có sẵn; TypeScript, build production, lint không có lỗi; smoke test và **10 kiểm tra API production** đạt. Lint còn 17 cảnh báo có sẵn. Chưa kiểm tra trực quan trên trình duyệt.

**Bảo toàn dữ liệu:** đối chiếu dấu vân tay trước/sau của điểm, đăng ký, tổng hợp học kỳ, bản ghi chuyển miễn, quyết định và hồ sơ đều không thay đổi. GPA của 622 kết quả hiện hành khớp tổng hợp nguồn: **0 chênh lệch**. Các cập nhật chỉ tạo kết quả suy diễn mới và đồng bộ hồ sơ hỗ trợ nội bộ, giữ lịch sử; không gửi thông báo.

**Đính chính sau đối chiếu chi tiết:** hồ sơ 2246B045 đã có kết quả đạt riêng cho cả ba mã thuộc CTĐT hiện tại (`20CT2103`, `20LH0001`, `20CT1202`). Vì vậy, ba mã cũ trùng tên không cần ánh xạ để xác định hoàn thành các môn này. Điều kiện yêu cầu ánh xạ của v22 quá rộng và đã được sửa ở v23; xem [báo cáo bổ sung](academic-warning-passed-code-fix-2026-10-17.md). Đây không phải xác nhận ba cặp mã tương đương của Trường. Số liệu và tệp bằng chứng phía trên ghi lại lần kiểm tra v22.

Bằng chứng: [kiểm tra trước/sau và API](academic-warning-five-fixes-verification-2026-10-17.json), [các phạm vi cập nhật](academic-warning-five-fixes-refresh-2026-10-17.json).
