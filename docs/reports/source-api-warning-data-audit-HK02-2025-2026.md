# Đối chiếu API nguồn cho 35 sinh viên chưa được đánh giá

Ngày kiểm tra: 07/10/2026. Phạm vi: đúng 35 sinh viên hiển thị chưa đủ dữ liệu trong Cảnh báo học tập, HK02 (2025–2026). Chỉ đọc API và DB; không nhập lại dữ liệu, đổi mã chương trình hoặc chạy lại cảnh báo.

## Kết quả kỳ cảnh báo

API `LayBangDiemSinhVien` được gọi với MSSV, mã CTĐT đang lưu và `ALL/ALL`. Đối chiếu tất cả kỳ trả về, không chỉ kỳ đang xét:

- 35/35 sinh viên khớp dữ liệu theo mã CTĐT hiện tại.
- API và hệ thống cùng có 949 lượt học; không có lượt thiếu/thừa hoặc khác tín chỉ, điểm hệ 10/4, điểm chữ/đặc biệt, pass/gather/pending và cờ không tính điểm trung bình.
- Tổng kết GPA kỳ, GPA tích lũy và tín chỉ đạt ở các kỳ có dữ liệu khớp.
- API và hệ thống đều không có đăng ký học phần/tổng kết cho HK02 (2025–2026) của cả 35 người.
- Bộ đánh giá yêu cầu có `StudentTermSummary` trong kỳ và chương trình đang xét nên chưa tạo kết quả cho họ. Báo cáo lấy 625 hồ sơ trừ 590 người đã đánh giá, hiển thị 35 dưới nhãn “Chưa đủ dữ liệu”.

## Trường hợp chưa khớp ngoài kỳ cảnh báo: 2347A052

Trương Anh Minh, ITK47A, đang lưu mã `CQ23CT`. API với mã này trả rỗng, giống DB. Tuy nhiên, kiểm tra lại hai mã đã được ghi nhận trong báo cáo API ngày 06/10/2026 cho cùng MSSV:

| Mã truy vấn | Kỳ | Kết quả |
|---|---|---|
| CQ23CT | ALL/ALL | Rỗng |
| CQ23CT-PM | HK01 (2026–2027) | 3 môn, 10 TC, chưa có điểm |
| CQ23CT-MMT | HK01 (2026–2027) | Cùng 3 môn, 10 TC, chưa có điểm |

Ba môn là `20CT1101` (3 TC), `20CT1102` (4 TC), `20LH0001` (3 TC). Đều có `NotScore=true`, `IsPass=false`, điểm 10/4 null. Đây là đăng ký đang học, không phải tín chỉ đã đạt. Không cộng hai mã truy vấn thành 6 môn hoặc 20 TC; chưa có căn cứ tự xác định chuyên ngành PM/MMT.

Hệ thống đang bỏ sót bộ 3 đăng ký này vì importer chỉ gọi bảng điểm theo mã CTĐT của hồ sơ. Việc này không bổ sung dữ liệu cho HK02 (2025–2026), nên không làm thay đổi nhóm 35 người ở kỳ cảnh báo đó.

Nhận định “Anh Minh không có dữ liệu ở bất kỳ kỳ nào” trong lần kiểm tra DB trước chỉ mô tả dữ liệu hiện đang lưu và kết quả API theo CQ23CT; không phản ánh đầy đủ dữ liệu API có thể trả dưới mã khác.

Không dùng việc API không trả một kỳ để kết luận sinh viên nghỉ học hoặc xác định nguyên nhân nguồn chưa cung cấp.

Chi tiết máy đọc: [JSON đối chiếu](source-api-warning-data-audit-HK02-2025-2026.json). Danh sách: [CSV 35 sinh viên](academic-warning-missing-data-HK02-2025-2026.csv).
