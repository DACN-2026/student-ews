# Trạng thái rời lớp theo quyết định — 11/10/2026

Đã rà soát 625 hồ sơ và áp dụng mốc rời lớp cho **2549A044 — Bùi Lan Phong**, theo quyết định **230/QĐ-ĐHĐL ngày 19/03/2026**, từ **HKII 2025–2026**. Cờ danh sách lớp nguồn vẫn được giữ là đang trong lớp; trạng thái hiển thị và phạm vi hỗ trợ lấy thêm căn cứ quyết định.

Hai quyết định “Tiếp nhận Chuyển trường” trong nguồn là chuyển đến, không được chuyển thành rời lớp. Sinh viên nghỉ tạm thời/bảo lưu không mang tag này chỉ vì có quyết định nghỉ. Một hồ sơ đã có cờ rời lớp từ nguồn được giữ nguyên.

## Hành vi đã áp dụng

- Hồ sơ và danh sách sinh viên hiển thị tag **Đã rời lớp** theo quyết định đã ký/hiệu lực, kể cả khi cờ lớp nguồn chưa được cập nhật.
- Không đưa sinh viên rời lớp vào các chức năng theo dõi, cảnh báo, tiến độ, dự kiến tốt nghiệp, hàng đợi hỗ trợ hoặc thống kê vận hành hiện tại. Bộ tính theo kỳ loại sinh viên từ kỳ rời lớp trở đi; kỳ trước đó vẫn có thể đối chiếu lịch sử.
- API chặn ghi can thiệp, hẹn theo dõi, chuyển trạng thái hoặc mở lại hỗ trợ cho sinh viên đã rời lớp, kể cả khi người gọi là quản trị.
- Hồ sơ, điểm, quyết định, snapshot đánh giá và nhật ký hỗ trợ được giữ. Chi tiết hỗ trợ lịch sử vẫn đọc được trong phạm vi được cấp quyền. Tiến độ cá nhân mở mặc định dùng kỳ chính trước kỳ rời lớp và hiển thị giải thích lịch sử.
- Quyết định chuyển đến, nghỉ tạm thời, chưa có số/ngày ký hợp lệ, ký trong tương lai hoặc đã bị hủy không tạo mốc rời lớp. Quyết định có hiệu lực kỳ tương lai chưa làm rời lớp ngay ở hiện tại.
- Đồng bộ được gọi sau thay đổi/nhập quyết định, xác minh hiệu lực và importer Apidog; có script riêng kiểm tra/ap dụng cùng nhật ký trước/sau. Khi quyết định bị hủy hoặc có quyết định trở lại đã hiệu lực, đồng bộ lại mốc từ các quyết định còn hợp lệ.

## Bằng chứng áp dụng

| Kiểm tra database sau áp dụng | Kết quả |
| --- | --- |
| Hồ sơ đã đối chiếu | 625 |
| Hồ sơ đổi mốc theo quyết định | 1 — Bùi Lan Phong |
| Sinh viên trong phạm vi hiện tại | 623 |
| Phạm vi HKI 2025–2026, trước mốc rời lớp | 624 |
| Phạm vi từ HKII 2025–2026 | 623 |
| Lượt học/kết quả điểm còn lưu | 31.141/31.141; đối chiếu snapshot nguồn vẫn 0 chênh lệch |
| Quyết định còn lưu | 912 |
| Tổng hợp điểm lịch sử của Bùi Lan Phong | 2 bản ghi, giữ nguyên |
| API cho phép tiếp tục hỗ trợ Bùi Lan Phong | Bị chặn, mã `STUDENT_LEFT_CLASS` |
| Tiến độ cá nhân mặc định | Chỉ lịch sử đến HKI 2025–2026 |
| Chạy lại đồng bộ cùng quyết định | 0 thay đổi mới, không tạo nhật ký lặp |
| Chạy lại cảnh báo kỳ đã chốt theo engine v16 | 7 nhóm thành công, 0 thất bại |

623 là phạm vi sinh viên hiện tại theo trạng thái lớp/quyết định, chưa loại nghỉ hợp lệ riêng cho kỳ xét. Đây không phải số kết quả cảnh báo: HKII 2025–2026 vẫn có 622 sinh viên được phân tích sau loại nghỉ hợp lệ; ngưỡng nội bộ được giữ nguyên.

Migration `20261011040000_student_class_departure` đã áp dụng. Kiểm thử backend: 339 test, 338 đạt, 1 bỏ qua; frontend: 20 test đạt. Các tình huống chuyển đi/chuyển đến, nghỉ tạm thời, quyết định bị hủy, hiệu lực tương lai, đồng bộ lặp, chặn hỗ trợ và đọc lịch sử đã được kiểm tra.

Bằng chứng chi tiết: [kế hoạch đồng bộ hiện tại sau áp dụng](student-departures-2026-10-11-plan.json), [thay đổi đã áp dụng, gồm trạng thái trước/sau](student-departures-2026-10-11.json), [kiểm tra hồ sơ/phạm vi/lịch sử sau áp dụng](student-departure-verification-2026-10-11.json), [7 nhóm cảnh báo đã chạy lại](student-departure-warning-refresh-2026-10-11.json).

TypeScript backend/frontend và build backend đạt; lint không có lỗi (còn 2 cảnh báo backend và 15 frontend có sẵn). Backend cục bộ ở cổng 3001 đã khởi động lại với bản build mới và health check xác nhận database kết nối. Không thực hiện kiểm tra giao diện trực quan bằng trình duyệt trong đợt này.

Từ `apps/backend`, dùng `npm run db:check-student-departures` để xem kế hoạch hoặc `npm run db:sync-student-departures` để áp dụng. Hai lệnh cần `.env.local` đúng database, chỉ đồng bộ mốc suy ra từ quyết định, không xóa dữ liệu hoặc sửa nguồn API.

## Làm rõ danh sách không phân mức theo kỳ

Danh sách trước đây ghi chung “chưa có bảng tổng hợp điểm” cho cả sinh viên đã được miễn phân tích theo quyết định nghỉ. Đã sửa để lấy lý do loại trừ từ snapshot của đúng lần đánh giá mới nhất theo khóa/chương trình/kỳ; không dùng quyết định của kỳ khác hoặc snapshot cũ để giải thích kết quả hiện tại. Thông báo tổng quan tách số hồ sơ ngoài phạm vi khỏi số hồ sơ chưa có kết quả hoặc thiếu dữ liệu.

Đối chiếu dữ liệu thật HKII 2025–2026: danh sách chỉ còn **2347B045 — Dương Minh Trung**, hiển thị **Nghỉ được chấp thuận**, số quyết định **332/QĐ-ĐHĐL ngày 03/04/2026** và hướng theo dõi thời hạn nghỉ, thủ tục trở lại học. Sinh viên vẫn thuộc lớp. Đây là hồ sơ nghỉ hợp lệ, không phải lỗi thiếu điểm cần bổ sung để phân mức trong kỳ nghỉ.

Các quyết định nghỉ khác vẫn được lưu. Hồ Kim Long, Cao Văn Linh, Vũ Anh Tân đã trở lại học; quyết định nghỉ của Lưu Thị Phúc không bao phủ HKII 2025–2026. Các hồ sơ này tiếp tục được phân tích theo kỳ tương ứng. Chi tiết trong [báo cáo đối chiếu quyết định nghỉ](academic-warning-standing-audit-2026-10-11.md).

Kiểm thử phân biệt nghỉ được chấp thuận, thiếu tổng hợp điểm, kết quả đã lưu nhưng thiếu dữ liệu, snapshot cũ, giới hạn sinh viên và lần chạy không có kết quả đều đạt. TypeScript và lint của các tệp sửa đạt; dữ liệu thật vẫn giữ 179 nguy cơ cao, 110 cần chú ý và 333 bình thường.
