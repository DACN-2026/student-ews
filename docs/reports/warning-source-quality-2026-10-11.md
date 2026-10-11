# Đối chiếu API và sửa dữ liệu cảnh báo — 11/10/2026

Đã đối chiếu toàn bộ 625 sinh viên, 31.141 lượt học và 912 quyết định duy nhất; sửa 7 trạng thái kết quả trống, áp dụng migration và tính lại thành công 7 nhóm cảnh báo HKII 2025–2026. Sau sửa, 31.141 lượt học khớp snapshot API đã kiểm tra, không còn chênh lệch trong phép đối chiếu điểm và kỳ. Không thay điểm số, GPA, tín chỉ, quyết định nguồn hoặc ngưỡng phân mức.

## Phạm vi và nguồn

Đọc [tài liệu API Apidog](https://kg8vuz7mh4.apidog.io/llms.txt) và đặc tả cả 8 endpoint. Đối chiếu trực tiếp 5 endpoint nghiệp vụ: danh sách lớp, bảng điểm lớp, bảng điểm rèn luyện lớp, bảng điểm cá nhân và quyết định. Có 1.290 kết quả gọi thành công: 40 lượt cho 10 lớp và 1.250 lượt cho 625 sinh viên. Bảng điểm lớp được đọc HKII/HKIII 2025–2026; rèn luyện HKII; bảng điểm cá nhân toàn bộ kỳ của chương trình hiện tại. Học phí và CTĐT chỉ đọc đặc tả trong đợt này, không gọi lại dữ liệu nguồn.

Snapshot nguồn hoàn tất lúc **03:07:25 ngày 11/10/2026 (UTC+7)**. Bản sửa được áp dụng lúc 03:20:30, sau đó chạy lại đánh giá. Đây là quan sát tại thời điểm kiểm tra, không phải đồng bộ thời gian thực. API công bố chỉ các chức năng đọc; chưa có endpoint sửa điểm, xác nhận lý do nghỉ hoặc bằng chứng đăng ký riêng. Các khác biệt chưa đủ căn cứ được ghi nhận để xác minh, không sửa ngược hệ thống nguồn.

## Những lỗi đã xử lý

| Vấn đề | Cách xử lý đã áp dụng |
| --- | --- |
| 7 lượt học không có điểm, không có cờ đạt/chờ điểm nhưng bị gán `graded` | Chuyển sang `unknown`; giữ nguyên dữ liệu điểm và payload. Dùng chung bộ chuẩn hóa cho importer/API điểm để tránh tái diễn. |
| GDQP thiếu kỳ ở 2448A025 và 2549A055 làm nợ học thuật bị đánh dấu thiếu | Không dùng học phần điều kiện GDQP/GDTC để kết luận độ đầy đủ nợ học thuật; vẫn giữ hồ sơ chưa phân kỳ và chưa xác nhận chứng chỉ. |
| GDTC chưa rõ ở 2246B008 chặn đối chiếu tiến độ học thuật | Chỉ kết quả học thuật chưa rõ mới làm tiến độ học thuật thiếu. |
| Học phần học thuật cũ trống/chờ điểm bị bỏ qua | Đánh dấu nợ/tiến độ liên quan là một phần; nếu có bằng chứng đạt cùng học phần trước kỳ xét thì giải quyết nợ hiện tại, không bịa kết quả lần học cũ. |
| Chỉ có SHCD 0 tín chỉ vẫn được coi là có đăng ký | Chỉ lượt học có tín chỉ dương là bằng chứng đăng ký từ bảng điểm; chưa có bằng chứng không đồng nghĩa đã xác nhận không đăng ký. |
| Chỉ số nội bộ trong bản ghi có thể bị hiểu thành năm/kỳ | Chỉ chấp nhận nhãn năm học/kỳ tường minh; trường hợp thiếu hoặc mâu thuẫn được giữ chưa phân kỳ. Kiểm tra lại 31.141 lượt học hiện tại: không cần đổi kỳ. |
| Vấn đề nguồn chỉ nằm trong báo cáo kỹ thuật | Lưu nhật ký có hash và thời điểm, đưa quan sát vào snapshot cảnh báo và khối **Đối chiếu API nguồn** trong chi tiết sinh viên, theo đúng quyền/phạm vi. |

7 lượt học đã sửa: 2246A028/TC1003D; 2246A041/20TN1201; 2246B008/TC1001D và TC1002D; 2246B026/TC1001D; 2246B045/20HN1201 và 20HN1204.

Migration `20261011033000_unknown_source_grade_status` đã áp dụng: cho phép trạng thái `unknown` và ràng buộc trạng thái này không đi kèm điểm hoặc kết quả đạt. Script sửa chạy trong transaction, kiểm tra nguồn còn mới, dữ liệu hiện tại và `updatedAt`; chạy lại cùng snapshot sau khi đã áp dụng không tạo thay đổi hoặc nhật ký lặp.

## Dữ liệu cần đơn vị nguồn/GVCN/CVHT xác minh

**Hai hồ sơ mâu thuẫn giữa bảng điểm lớp và cá nhân:**

- **2347A019 — Trương Xuân Thắng:** bảng lớp HKII ghi GPA 0,64 và 14 tín chỉ; bảng cá nhân không có HKII và ghi GPA 0,64 ở HKIII. Không tự chuyển học phần từ HKIII sang HKII.
- **2347A049 — Hà Thị Trung:** bảng lớp HKII ghi GPA 0 và 8 tín chỉ; bảng cá nhân HKII chỉ có SHCD 0 tín chỉ. Không lấy GPA lớp để lấp GPA cá nhân.

**13 sinh viên có bản ghi kỳ nhưng chưa có GPA từ nguồn:** 11 hồ sơ có kết quả học thuật VT (2246A050, 2246B008, 2347A054, 2347A057, 2347C044, 2448A021, 2448A027, 2448A028, 2448A036, 2448B030, 2549B030); 2 hồ sơ chỉ có SHCD (2246B029, 2347A049). Giữ GPA `null`; VT vẫn được xử lý theo kết quả không đạt, SHCD không tạo GPA học thuật.

**9 hồ sơ chưa đủ bằng chứng nợ học thuật:** 2246A006, 2246A041, 2246B045, 2347A009, 2347A065, 2347A048, 2448A014, 2448B022, 2448B030. Có kết quả cũ trống/chờ điểm, mã học phần chưa được xác nhận tương đương hoặc lịch sử chuyển trường thiếu kỳ. Riêng 2347A048 có 7 học phần học thuật chuyển đến chưa xác định năm/kỳ. Không tự ghép tương đương chỉ vì tên giống nhau.

**3 hồ sơ chưa đủ bằng chứng tiến độ học thuật:** 2448A014, 2448B022, 2448B030 có học phần cũ mang cờ chưa có điểm. Cần kiểm tra kết quả với đơn vị quản lý đào tạo; không quy thành trượt chỉ vì đang trống.

**Rèn luyện:** nguồn có `CheckData=false`; đặc tả chưa giải thích đủ ý nghĩa `StatusID=0/1`. Không mặc định `StatusID=1` là đã công nhận hoặc bật cảnh báo rèn luyện dựa trên giả định đó.

Có 53 hồ sơ mang ít nhất một quan sát chất lượng, gồm cả ghi chú thông tin và vấn đề cần xác minh. Các nhóm trên có giao nhau; 53 không phải số sinh viên nguy cơ cao.

## Kết quả sau tính lại

| Chỉ số | Kết quả |
| --- | --- |
| Sinh viên được phân tích | 622; loại 1 nghỉ hợp lệ và 1 thôi học |
| Mức nội bộ | 179 nguy cơ cao; 110 cần chú ý; 333 bình thường — giữ nguyên |
| Nhóm 34 thiếu bảng tổng hợp kỳ trước | 33 nguy cơ cao với hồ sơ hỗ trợ đang mở; 1 nghỉ hợp lệ (Dương Minh Trung) |
| GPA chưa có | 46 = 33 thiếu tổng hợp + 13 nguồn chưa có GPA |
| Chưa có bằng chứng đăng ký tín chỉ dương | 35; chưa phải kết luận 35 sinh viên không đăng ký |
| Độ phủ tiêu chí đang triển khai | 570 đầy đủ; 50 một phần; 2 không đủ (trước sửa: 570/51/1) |
| Nợ học thuật | 613 đầy đủ; 9 một phần |
| Tiến độ học thuật | 619 đầy đủ; 3 một phần |
| Đối chiếu nguồn hiện tại với kết quả cảnh báo mới | 0 chênh lệch trong các trường được kiểm tra |

Ngưỡng nội bộ giữ nguyên: nợ 13/19 tín chỉ, chậm tiến độ 4/12 tín chỉ và khoảng GPA tích lũy 0,2. Việc phân mức nội bộ, đối chiếu QĐ600/TB1270 và độ đầy đủ dữ liệu vẫn được trình bày riêng; không tự tạo quyết định cảnh báo hoặc buộc thôi học.

## Kiểm tra và bằng chứng

- Backend: 332 test, 331 đạt, 1 bỏ qua, 0 lỗi. Frontend: 20 test đạt.
- TypeScript backend/frontend đạt; lint không có lỗi, còn 2 cảnh báo backend và 15 cảnh báo frontend có sẵn. Không thực hiện kiểm tra giao diện bằng trình duyệt trong đợt này.
- Đối chiếu sau sửa toàn bộ 31.141 lượt học với snapshot đã lấy từ API: 0 chênh lệch điểm/trạng thái/kỳ; 7 trạng thái `unknown`.
- Chạy lại 7 nhóm cảnh báo: 7 thành công, 0 thất bại. Migration đã áp dụng; thử chạy lại script sửa cùng snapshot không tạo thay đổi.

Các tệp bằng chứng: [đối chiếu API](warning-source-quality-2026-10-11.json), [thay đổi đã áp dụng và quan sát từng hồ sơ](warning-source-repair-2026-10-11.json), [kiểm tra sau sửa](warning-source-repair-verification-2026-10-11.json), [7 nhóm đã chạy lại](warning-source-refresh-2026-10-11.json), [đối chiếu kết quả cảnh báo mới](academic-warning-standing-audit-2026-10-11.json). [Báo cáo trước sửa](academic-warning-standing-audit-2026-10-11.md) giữ các phát hiện về quyết định học vụ.

Để đối chiếu lại, chạy từ `apps/backend` (cần `.env.local` đúng database):

```powershell
node --env-file=.env.local -r ./scripts/node-test-shim.cjs --import tsx scripts/audit-warning-source-quality.cjs
node --env-file=.env.local -r ./scripts/node-test-shim.cjs --import tsx scripts/repair-warning-source-quality.ts
```

Lệnh thứ hai chỉ lập kế hoạch. `--apply` dùng sau khi đã xem kế hoạch; kết quả chạy cảnh báo cần được cập nhật sau khi dữ liệu/bằng chứng thay đổi.
