# Báo cáo rà soát hiển thị thông tin sinh viên — 17/10/2026

**Cập nhật ở đợt xử lý tiếp theo:** cả 7 phát hiện dưới đây đã được sửa và kiểm chứng. Xem [báo cáo sau sửa](student-display-seven-fixes-2026-10-17.md). Nội dung bên dưới giữ nguyên làm bằng chứng tình trạng trước sửa.

**Vẫn còn 7 điểm có thể gây hiểu nhầm. Đợt này chỉ kiểm tra và lập báo cáo, không sửa code hoặc cập nhật cơ sở dữ liệu.** Những điểm dưới đây được xác nhận từ dữ liệu đang lưu, kết quả dịch vụ cung cấp cho API và nhánh hiển thị tương ứng; không quy lỗi cho dữ liệu chuẩn của Trường.

Phạm vi: **625 hồ sơ, 31.141 lượt học, 3.456 tổng hợp học kỳ, 9.375 bản ghi rèn luyện, 912 quyết định và 41 chính sách học phí**. Đã kiểm tra dịch vụ chi tiết dự kiến tốt nghiệp của toàn bộ **622 sinh viên trong 7 phạm vi hiện hành**; đối chiếu thêm hồ sơ, bảng điểm, đăng ký, tiến độ, cảnh báo, dashboard và xuất báo cáo.

## 1. Hồ sơ và báo cáo xuất chọn lẫn đợt đánh giá — ưu tiên cao

**316 sinh viên** đang là **Chờ kết quả** trong đợt tiến độ chuẩn của HK01 2026–2027, nhưng tổng quan hồ sơ lại hiện **Chậm tiến độ**. Đã xác nhận trên dịch vụ thực tế; file Excel tiến độ cũng có cùng biểu hiện.

Ví dụ: `2246A002`, `2347A001`. Cùng kỳ xét, đợt chuẩn trả `pending_result`, trong khi hồ sơ lấy `behind_schedule` từ đợt chạy phục vụ dự kiến tốt nghiệp.

Nguyên nhân: truy vấn chọn kết quả hoàn tất mới nhất nhưng không giới hạn đúng mục đích đánh giá; báo cáo xuất cũng không giới hạn đợt chuẩn đang áp dụng. Người dùng có thể nhắc nợ hoặc ưu tiên can thiệp nhầm cho sinh viên đang chờ điểm.

**Đề xuất:** thống nhất nguồn kết quả tiến độ chuẩn giữa danh sách, hồ sơ và xuất báo cáo; hiện rõ kỳ xét và mục đích của kết quả lịch sử/dự kiến tốt nghiệp.

## 2. Chọn kỳ quá khứ trên dashboard nhưng tiến độ vẫn là hiện tại — ưu tiên cao

Đã kiểm tra ba bộ lọc: **HK01 2026–2027, HK02 2025–2026 và HK02 2024–2025**. Cả ba đều trả cùng thống kê tiến độ: **300 đúng tiến độ, 322 chậm**, tỷ lệ đúng tiến độ **48,23%**; cả phân bố theo khóa cũng giống nhau.

Nguyên nhân được xác nhận trong luồng xử lý: dashboard lấy đối chiếu tiến độ hiện tại mà không truyền kỳ lịch sử đã chọn, trong khi thông tin nguồn lại gắn kỳ của bộ lọc. Đặc biệt, dữ liệu khóa K49 vẫn xuất hiện trong phân bố tiến độ khi chọn HK02 2024–2025.

**Đề xuất:** tiến độ phải tính theo mốc đã chọn, hoặc tách rõ một khu vực chỉ phản ánh hiện tại. Không dùng biểu đồ này để nhận định tiến độ của kỳ quá khứ ở trạng thái hiện nay.

## 3. “Chưa xác định” bị chuyển thành “Chậm tiến độ” trên dashboard — ưu tiên cao

Đối chiếu tiến độ hiện tại trả **300 đúng tiến độ, 321 chậm, 1 chưa xác định**. Dashboard lại trả **300 đúng, 322 chậm, 0 cần đối soát**.

Hồ sơ bị ảnh hưởng là `2347A048`: đang cần đối chiếu mã `TN1001D` và `20TN1201`; dịch vụ gốc giữ `UNKNOWN`. Dashboard chuyển mọi trạng thái khác `ON_TRACK` thành `behind_schedule`.

**Đề xuất:** giữ nhóm **Cần đối soát/Chưa xác định** riêng. Chênh lệch tín chỉ của hồ sơ này chưa phải căn cứ để kết luận chậm tiến độ khi phần công nhận học phần chưa được chốt.

## 4. VT vẫn bị gọi là điểm F trong dự kiến tốt nghiệp — ưu tiên cao

Trong kết quả hiện hành, **779 học phần của 180 sinh viên** có bằng chứng VT và chưa đạt theo `isPass`; các dòng này đi vào nhánh hiển thị cố định **“Chưa đạt (Điểm F)”**, **“Chưa đạt (F)”** hoặc khuyến nghị ghi **“bị điểm F”**. Gồm 469 học phần bắt buộc và 310 học phần tự chọn.

Ví dụ: `2347A049`, môn `20CT2201` — Cơ sở dữ liệu, nguồn giữ **VT**, `isPass=false`, nhưng phần cần xử lý gọi là điểm F.

**Kết luận “chưa đạt” phù hợp với `isPass`; cách gọi nguyên nhân là “F” không chính xác.** Điểm gốc không bị đổi, nhưng người tư vấn có thể hiểu nhầm vắng thi thành thi trượt.

**Đề xuất:** giữ ký hiệu VT và mô tả “Vắng thi — chưa đạt theo API”; chỉ dùng chữ F khi nguồn thực sự là F.

## 5. Môn tự chọn chưa đăng ký bị gọi là “Nợ môn” — ưu tiên trung bình

Chi tiết hoàn thành CTĐT có **878 dòng học phần lựa chọn của 482 sinh viên** chưa từng có lượt đăng ký theo ID học phần, không bắt buộc đăng ký riêng từng môn, nhưng vẫn rơi vào nhãn đỏ **“Chưa đạt / Nợ môn”**.

Ví dụ: `2347A001`, môn `20CT4103D` thuộc nhóm `CHUYEN_NGANH:9`; `isRegistrationRequired=false`, không có bằng chứng lượt học. Sinh viên phải đáp ứng định mức của nhóm, không đồng nghĩa phải học mọi phương án trong nhóm.

**Đề xuất:** tách “Môn lựa chọn chưa học” khỏi môn đã học không đạt; trình bày phần còn thiếu ở cấp nhóm tín chỉ. Không coi 878 dòng này là 878 khoản nợ môn.

## 6. Vừa “Đúng tiến độ” vừa “Chậm X TC” — cần làm rõ cách diễn đạt

Có **10 sinh viên** đồng thời được xếp `ON_TRACK`, lý do **“Đúng tiến độ đào tạo”**, nhưng cột chênh lệch lại ghi **“Chậm 2/3 TC”**.

Ví dụ `2246B045`: kế hoạch đến mốc **134 TC**, số đạt theo phép so sánh kế hoạch **132 TC**, chênh **−2 TC**, trong khi kết luận yêu cầu vẫn là `ON_TRACK`.

Nguyên nhân: kết luận dùng yêu cầu học phần/khối tự chọn được công nhận, còn chênh lệch dùng tổng tín chỉ kế hoạch học kỳ. Hai phép so sánh khác nhau đang dùng chung từ “tiến độ/chậm”. **Không nên diễn giải riêng con số −2 TC thành 2 TC nợ đã được xác nhận.**

**Đề xuất:** ghi rõ “Đáp ứng yêu cầu đến mốc” và “Chênh lệch so với kế hoạch học kỳ”, kèm căn cứ tương ứng.

## 7. Sinh viên đã rời lớp vẫn có nhãn cảnh báo “Bình thường” — ưu tiên trung bình

Khi xem nhóm đã rời lớp, **2 hồ sơ `2347A052`, `2549A044`** có `warningInfo=null` nhưng danh sách vẫn trả mức xanh, giao diện hiện **“Bình thường”**. Mở chi tiết lại thấy lần lượt trạng thái chưa đủ dữ liệu và nguy cơ cao của lịch sử đánh giá.

Nguyên nhân: danh sách mặc định mức xanh khi không có kết quả cảnh báo trong phạm vi theo dõi hiện tại. Trạng thái rời lớp vẫn được giữ, nhưng nhãn “Bình thường” dễ bị hiểu thành kết luận học tập mới.

**Đề xuất:** hiển thị “Đã ngừng theo dõi” hoặc “Chỉ tra cứu lịch sử”; nếu hiện cảnh báo cũ thì phải ghi rõ kỳ đánh giá. Việc dừng hỗ trợ mới cho sinh viên rời lớp vẫn có cơ chế chặn riêng.

## Các phần đã đối chiếu, chưa phát hiện sai lệch mới

- `isPass` đã chuẩn hóa khớp trường nguồn trên 31.141 bản ghi điểm: **0 chênh lệch**. Nguồn giữ **1.239 lượt VT**; không phát hiện việc sửa chúng thành F trong dữ liệu lưu.
- Đối chiếu GPA cảnh báo với tổng hợp cùng kỳ và cùng CTĐT: **589 trường hợp có bản ghi đối chiếu, 0 chênh lệch**; 33 kết quả còn lại không có bản ghi tổng hợp khớp khóa đó để thực hiện cùng phép so sánh, không đưa vào con số xác nhận GPA. Đây không phải kết luận API của Trường thiếu dữ liệu.
- Bảng điểm hồ sơ có luồng từng lượt học, giữ lần học lại/cải thiện và kỳ thực học; không lấy kết quả đạt kỳ sau để ghi đè lịch sử lần trước.
- `2347B045` đang nghỉ tạm thời: giữ mốc lịch sử HK01 2025–2026 và cờ chỉ tra cứu lịch sử. Môn miễn M của `2448A025`, `2549A055` vẫn được ghi nhận ở góc nhìn hiện tại, không tự gán kỳ học gốc.
- Lỗi mã kế hoạch thiếu `D` đã xử lý ở đợt trước: **0 kết quả tiến độ chuẩn hiện hành còn vướng lỗi đối chiếu cấu hình đó**. Các lỗi chọn nguồn/nhãn trong báo cáo này là vấn đề khác.
- Dấu vân tay **9 nhóm dữ liệu nguồn** khớp hoàn toàn với sau đợt đối chiếu kế hoạch trước đó.

## Phạm vi xác nhận và thứ tự đề nghị xử lý

Ưu tiên thống nhất **nguồn kết quả hồ sơ/xuất báo cáo**, **mốc kỳ của dashboard** và **nhóm chưa xác định**; tiếp theo sửa cách mô tả **VT**, **môn lựa chọn**, **chênh lệch kế hoạch** và **hồ sơ đã rời lớp**. Các số lượng ở trên có thể trùng sinh viên giữa các vấn đề, không cộng thành tổng số sinh viên bị sai.

Đợt này thực hiện kiểm tra chỉ đọc trên dữ liệu API đã tiếp nhận, dịch vụ backend và mã giao diện; có tạo file Excel trong bộ nhớ để kiểm tra nội dung xuất. **Không gọi lại toàn bộ API bên ngoài, không kiểm thử thao tác trực quan trên trình duyệt và không sửa code/dữ liệu.** Không thể từ kiểm tra này khẳng định hệ thống đã hết mọi lỗi.

Bằng chứng dữ liệu và các trường hợp tái hiện: [student-display-readonly-audit-2026-10-17.json](student-display-readonly-audit-2026-10-17.json).

| Phát hiện | Vị trí xử lý/hiển thị chính |
| --- | --- |
| 1 | [student-dashboard.ts:217](</D:/Student Monitoring System/apps/backend/lib/services/student-dashboard.ts:217>), [export.ts:332](</D:/Student Monitoring System/apps/backend/lib/services/export.ts:332>) |
| 2–3 | [dashboard.ts:551](</D:/Student Monitoring System/apps/backend/lib/services/dashboard.ts:551>), [dashboard.ts:580](</D:/Student Monitoring System/apps/backend/lib/services/dashboard.ts:580>) |
| 4 | [ForecastDetail.tsx:319](</D:/Student Monitoring System/apps/frontend/components/graduation/ForecastDetail.tsx:319>), [ForecastDetail.tsx:438](</D:/Student Monitoring System/apps/frontend/components/graduation/ForecastDetail.tsx:438>), [ForecastDetail.tsx:1658](</D:/Student Monitoring System/apps/frontend/components/graduation/ForecastDetail.tsx:1658>) |
| 5 | [CompletionProgressTab.tsx:1171](</D:/Student Monitoring System/apps/frontend/components/training-progress/CompletionProgressTab.tsx:1171>) |
| 6 | [student-training-progress.ts:612](</D:/Student Monitoring System/apps/backend/lib/services/student-training-progress.ts:612>), [student-training-progress.ts:652](</D:/Student Monitoring System/apps/backend/lib/services/student-training-progress.ts:652>), [StudentProgressLookupTab.tsx:760](</D:/Student Monitoring System/apps/frontend/components/training-progress/StudentProgressLookupTab.tsx:760>) |
| 7 | [students.ts:484](</D:/Student Monitoring System/apps/backend/lib/services/students.ts:484>), [students/page.tsx:441](</D:/Student Monitoring System/apps/frontend/app/(dashboard)/students/page.tsx:441>) |
