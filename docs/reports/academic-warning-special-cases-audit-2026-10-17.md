# Rà soát Cảnh báo học tập — 17/10/2026

**Cập nhật sau rà soát:** đã xử lý 5 điểm trong [báo cáo sửa](academic-warning-five-fixes-2026-10-17.md). Theo xác nhận của người dùng, VT là vắng thi, còn kết quả đạt/không đạt dùng `isPass` từ API. Các môn chuyển miễn `R` đã có kết quả nguồn; vướng mắc trước đây là cách hệ thống xử lý chúng. Nội dung và số liệu bên dưới ghi nhận trạng thái **trước khi sửa**, không mô tả phiên bản hiện tại.

**Kết luận: đã có nhiều xử lý đúng, nhưng chưa đủ nhất quán và rõ ràng cho các trường hợp đặc biệt.** Xác nhận 5 vấn đề cần xử lý: 4 vấn đề ảnh hưởng cách đánh giá và 1 vấn đề trình bày bằng chứng. Không kết luận dữ liệu của Trường sai.

API quản lý đào tạo của Trường là nguồn chuẩn. Các phát hiện dưới đây liên quan đến cách SEWS tiếp nhận, diễn giải, chọn mốc và hiển thị. Lượt này chỉ đọc dữ liệu và mô phỏng; không sửa điểm, GPA, hồ sơ, kết quả cảnh báo, chính sách hoặc tạo đợt đánh giá mới.

## Phạm vi và kết quả đối chiếu

- Kiểm tra mã nguồn từ nhập điểm, chọn kỳ, phạm vi sinh viên, quyết định, nợ, tiến độ, tín hiệu sớm đến chi tiết giao diện.
- Đối chiếu **622 kết quả gần nhất của sinh viên đang được theo dõi**, đều thuộc HK02 (2025–2026). GPA học kỳ và tích lũy trong kết quả cảnh báo khớp bảng tổng hợp đúng sinh viên/CTĐT/kỳ: **0 chênh lệch**.
- **19 sinh viên** còn ít nhất một tiêu chí `NOT_EVALUATED`. Trong đó có 11 người GPA nguồn trống cùng VT; 1 người chưa xác định được kỳ đầu; 4 người chưa đủ căn cứ nợ; các nhóm có thể trùng nhau. Đây là độ đầy đủ của thông tin phục vụ đánh giá, không phải bằng chứng dữ liệu Trường sai.
- **1.239 lượt VT** hiện đã nhập có kết quả mà hai cách xử lý cùng nhận là không đạt; chưa thấy mâu thuẫn VT trên các lượt này. Rủi ro AW04 được chứng minh bằng tình huống mô phỏng khác trạng thái.
- **156 kiểm thử backend + 31 kiểm thử frontend liên quan: đạt**. Các kiểm thử sẵn có chưa bắt được những tình huống dưới đây.

## Những vấn đề cần xử lý

### AW01 — Cao: theo dõi trong kỳ lấy nhầm mốc cuối kỳ

Luồng theo dõi trong kỳ gọi bộ tính tiến độ với kỳ hiện tại như một kỳ đã kết thúc. Loader tăng mốc thêm một học kỳ; môn đang học/chờ điểm bị đưa vào phần tín chỉ đến hạn, có thể gây cảnh báo đỏ.

**Bằng chứng hiện tại:** bốn hồ sơ được lấy mẫu đều có thiếu hụt tiến độ trước kỳ hiện tại bằng 0, nhưng preview báo `HIGH_RISK` do thiếu 15 hoặc 18 tín chỉ trong kỳ đang học. Ví dụ 2549C049: mốc đã kết thúc HK2 thiếu 0 TC; preview chuyển sang HK3 và báo thiếu 15 TC. Tình huống mô phỏng 4 môn đang học, mỗi môn 3 TC, cũng tạo thiếu hụt 12 TC thay vì 0 ở mốc đã kết thúc.

**Hướng sửa:** tách rõ mốc của kỳ đã chốt và theo dõi trong kỳ. Không đưa toàn bộ tín chỉ chưa đến hạn của kỳ đang học thành chậm tiến độ. Việc học lại/bù môn hiện tại vẫn được ghi nhận đang thực hiện, giữ nguyên nợ đã xác định từ trước.

Căn cứ: [early-warning-monitoring.ts](../../apps/backend/lib/services/early-warning-monitoring.ts:61), [student-training-progress.ts](../../apps/backend/lib/services/student-training-progress.ts:1296), [academic-warning-progress.ts](../../apps/backend/lib/services/academic-warning-progress.ts:34).

### AW02 — Cao: chuyển trường thiếu mốc lịch sử nhưng tiến độ vẫn ghi “đầy đủ”

Loader biết có điểm lịch sử chưa xác định kỳ, nhưng chỉ thêm câu lưu ý. Hàm tạo tín hiệu cảnh báo không dùng thông tin đó để đánh giá độ đầy đủ của tiến độ.

**Bằng chứng hiện tại:** hồ sơ 2347A048 có nợ tín chỉ `NOT_EVALUATED / UNSCOPED_HISTORICAL_ATTEMPTS`, trong khi tiến độ ghi `COMPLETE`, cảnh báo đỏ, thiếu 20 TC thuộc 6 môn đầu chương trình. Đọc lại bằng bộ tính hiện tại vẫn cho kết quả này. Chưa có đủ căn cứ để khẳng định toàn bộ 20 TC đó thực sự chưa hoàn thành trước chuyển trường.

**Hướng sửa:** giữ GPA chính thức của Trường; xác minh thông tin công nhận và phạm vi các lượt trước chuyển trường. Chỉ kết luận thiếu tín chỉ đối với phần có bằng chứng đầy đủ; phần còn lại phải có trạng thái “chờ đối chiếu lịch sử/công nhận”, không ghi toàn bộ tiến độ là đầy đủ. Không tự gán năm/kỳ cho điểm chưa phân kỳ.

Căn cứ: [student-training-progress.ts](../../apps/backend/lib/services/student-training-progress.ts:1326), [academic-warning-progress.ts](../../apps/backend/lib/services/academic-warning-progress.ts:35).

### AW03 — Cao: tự công nhận môn khác mã chỉ vì trùng tên

Bộ tính tiến độ ghép theo tên duy nhất khi không tìm thấy mã. Việc này không yêu cầu ánh xạ tương đương được xác nhận hoặc kiểm tra tín chỉ tương thích; bộ tính nợ lại không dùng cùng cách ghép.

**Bằng chứng:** mô phỏng môn cũ 2 TC đã đạt, khác mã nhưng trùng tên với môn mới 3 TC, bộ tính công nhận đủ 3 TC và báo tiến độ đầy đủ. Dữ liệu hiện tại có một hồ sơ chuyển ngành (2246B045) với ba cặp môn đi qua điều kiện ghép theo tên: `20HN1104 → 20CT2103`, `LH1001D → 20LH0001`, `CT2106D → 20CT1202`. Ba cặp này có thể được Trường công nhận; mã hiện tại chưa chứng minh căn cứ công nhận bằng một ánh xạ rõ ràng.

**Hướng sửa:** dùng kết quả công nhận/tương đương từ Trường hoặc ánh xạ đã xác minh theo CTĐT, phiên bản và phạm vi sinh viên. Trùng tên chỉ là gợi ý đối chiếu. Dùng chung căn cứ cho nợ và tiến độ; không tự quy đổi 2 TC thành 3 TC.

Căn cứ: [student-training-progress.ts](../../apps/backend/lib/services/student-training-progress.ts:275), [academic-debt.ts](../../apps/backend/lib/services/academic-debt.ts:61).

### AW04 — Cao, rủi ro chưa xuất hiện trong mẫu VT hiện tại: diễn giải VT không thống nhất

Phần nợ/tỷ lệ dùng `warningCourseOutcome()` để xét cờ chờ điểm và kết quả nguồn. Phần tiến độ dùng `courseOutcome()`, hàm này trả “không đạt” ngay khi thấy VT, trước khi xét các cờ đó.

**Tái hiện:** VT có `notScore=true` được phần nợ nhận là đang chờ, nhưng tiến độ coi là không đạt và ghi dữ liệu `COMPLETE`. VT chưa rõ kết quả cũng bị tiến độ coi là không đạt trong khi phần nợ yêu cầu xác minh. Các lượt VT hiện đã nhập đều có kết quả không đạt phù hợp, nên chưa quan sát lỗi này trên 1.239 lượt hiện tại.

**Hướng sửa:** thống nhất cách đọc kết quả nguồn cho các phép tính liên quan; VT vẫn hiển thị nguyên mã. Chờ điểm không phải F; chưa rõ kết quả không được ghi đã xác định; không suy ra GPA 0 từ VT.

Căn cứ: [academic-course-rules.ts](../../apps/backend/lib/academic-course-rules.ts:59), [academic-course-rules.ts](../../apps/backend/lib/academic-course-rules.ts:71), [student-training-progress.ts](../../apps/backend/lib/services/student-training-progress.ts:311).

### AW05 — Trung bình: mở chi tiết tiến độ không giữ kỳ cảnh báo đang xem

Phần đối chiếu bằng chứng có truyền kỳ đánh giá. Nhưng nút mở chi tiết tiến độ chỉ truyền ID sinh viên, khiến màn hình chi tiết tải tiến độ hiện tại. Một lượt học lại/bù đã đạt sau kỳ cảnh báo có thể làm người dùng thấy hai số khác nhau mà không rõ vì khác mốc.

**Hướng sửa:** mở mặc định đúng kỳ/CTĐT của cảnh báo, hiển thị rõ mốc; nếu xem hiện tại thì cung cấp lựa chọn riêng có nhãn rõ ràng. Không dùng kết quả đạt về sau để xóa bằng chứng của kỳ trước.

Căn cứ: [WarningStudentDetailModal.tsx](../../apps/frontend/components/warnings/WarningStudentDetailModal.tsx:45), [StudentProgressDetail.tsx](../../apps/frontend/components/training-progress/StudentProgressDetail.tsx:63), [academic-warning-evidence.ts](../../apps/backend/lib/services/academic-warning-evidence.ts:59).

## Đánh giá theo trường hợp

| Trường hợp | Đánh giá hiện tại |
| --- | --- |
| Chuyển đến/chuyển ngành | Quyết định tiếp nhận chuyển trường không bị hiểu là chuyển đi. Còn vướng công nhận môn, lịch sử thiếu kỳ và độ đầy đủ tiến độ: AW02, AW03. |
| VT đã có kết quả | Dùng kết quả đạt/không đạt nguồn cho nợ và tỷ lệ, giữ mã VT, không tạo GPA số. Cách xử lý VT chờ/chưa rõ chưa thống nhất: AW04. |
| Học cải thiện | Mô phỏng xác nhận giữ tín chỉ đã đạt khi lượt cải thiện đang chờ; không cộng tín chỉ hai lần, không tạo thêm F. GPA tiếp tục theo tổng hợp của Trường. |
| Học lại/bù cùng môn | Nợ F trước đó vẫn giữ khi đang chờ; có kết quả đạt thì giải quyết một nghĩa vụ môn học, không xóa lịch sử F. Phải phân biệt kỳ xét với kết quả học bù về sau: AW01, AW05. |
| Bù bằng môn khác | Có xử lý nhóm tự chọn và tín chỉ dư trong cùng khối đã cấu hình; không lấy tự chọn dư thay môn bắt buộc. Công nhận khác mã cần căn cứ rõ, không chỉ tên giống nhau: AW03. |
| Thôi học/chuyển đi | Có cơ chế loại theo quyết định hợp lệ và kỳ hiệu lực, giữ lịch sử; không tự coi thiếu đăng ký là đã thôi học. Trạng thái rời lớp lưu hiện tại khớp bộ phân giải quyết định: 0 chênh lệch. |
| Nghỉ tạm thời/bảo lưu | Đóng băng theo quyết định; chờ quyết định tiếp nhận học lại, không tự mở chỉ vì hết thời gian nghỉ ghi trên giấy. Các kiểm thử về ngày hiệu lực, quay lại học và quyết định hủy đạt. |
| Kỳ hè | Tách giám sát khỏi đánh giá kỳ chính; chưa mặc định gộp GPA hè vào kỳ chính. Kết quả học lại hè chỉ giải quyết nợ ở mốc phù hợp. |
| Thiếu đăng ký/thiếu tổng hợp | Có thông báo cần xác minh; không tự điền GPA 0 hoặc tự ban hành quyết định. Cần luôn giữ riêng mức nguy cơ hỗ trợ và độ đầy đủ dữ liệu. |

## Thứ tự xử lý đề xuất

1. Sửa mốc theo dõi trong kỳ và trạng thái lịch sử chưa đủ căn cứ (AW01, AW02).
2. Thống nhất công nhận môn và diễn giải VT giữa nợ/tiến độ (AW03, AW04).
3. Giữ mốc khi mở bằng chứng, bổ sung kiểm thử cho chính các tình huống đã tái hiện (AW05).

Sau khi sửa cần so sánh trước/sau đối với kết quả suy diễn của SEWS; giữ nguyên điểm, GPA và dữ liệu chính thức của Trường.

**Giới hạn:** đối chiếu bản dữ liệu API đã nhập trong cơ sở dữ liệu cục bộ, không gọi lại toàn bộ API Trường trong lượt này; 4 hồ sơ preview là mẫu kiểm tra, không phải tổng số người bị ảnh hưởng. Chưa kiểm tra trực quan trình duyệt. Chức năng theo dõi không đạt nhiều lần đang tắt (`repeatedFailuresFrom=null`); chưa coi các lượt VT lặp lại là cảnh báo bị bỏ sót trong chính sách hiện hành.

Bằng chứng số liệu và mô phỏng: [JSON](academic-warning-special-cases-audit-2026-10-17.json).
