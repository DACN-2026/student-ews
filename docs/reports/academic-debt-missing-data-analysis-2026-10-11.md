# Giải thích các trường hợp chưa đánh giá được tín chỉ nợ

Rà soát dữ liệu đang lưu cho HKII 2025–2026: 622 kết quả, 9 sinh viên chưa đánh giá được tiêu chí nợ tích lũy; 613 kết quả còn lại đánh giá được. Không sửa dữ liệu hay mã chức năng trong lần rà soát này. Ảnh không có tên sinh viên nên không gán ảnh cho một người cụ thể.

Tiêu chí có thể tính trực tiếp khi biết các môn chưa đạt còn nợ tại mốc xét. Không cộng tất cả lần F/VT trong lịch sử: cùng môn không cộng lặp; học lại đạt và thay thế hợp lệ có thể giải quyết nợ. Không dùng kết quả sau kỳ xét để xóa nợ của kỳ cũ.

## 1. Chưa rõ kết quả — 4 sinh viên, 10 bản ghi

| Sinh viên | Dữ liệu đang vướng | Hướng xử lý |
| --- | --- | --- |
| 2448A014 — Lê Văn Quân | 20CT1201, 3 TC, HKI 2025–2026: `NotScore=true`, điểm trống | Xác minh điểm cuối cùng hoặc đăng ký đã hủy; không tự gán F |
| 2448B022 — Trịnh Tuấn Khanh | 20CT1103 (3 TC), 20CT1202 (4 TC), 20CT1203 (3 TC), 20TN1202 (4 TC), HKII 2024–2025: chờ điểm | Xác minh cả bốn học phần; đến mốc xét chưa có lần đạt được ghi nhận để giải quyết phần chưa rõ |
| 2448B030 — Phạm Văn Kiên | Cùng bốn học phần, cùng kỳ và trạng thái như Khanh | Xác minh điểm hoặc trạng thái đăng ký đã hủy |
| 2246A041 — Vũ Ngọc Phi | 20TN1201, 3 TC, HKII 2022–2023: điểm trống, trạng thái `unknown` | Đối chiếu kết quả lần học này. Các lần sau cùng môn ghi VT ở HKII 2023–2024 và F ở HKII 2024–2025; chúng không tự điền lại kết quả trống trước đó |

## 2. Không khớp CTĐT — 4 sinh viên, 6 bản ghi

| Sinh viên | Dữ liệu đang vướng | Hướng xử lý |
| --- | --- | --- |
| 2347A009 — Vương Đức Tuấn | TN1008D, Toán rời rạc, 4 TC, HK hè 2024–2025, VT. CTĐT CQ23CT-PM dùng 20TN1202 | Xác minh mã tương đương theo chương trình; nếu xác nhận thì gom cùng môn, không tính thêm 4 TC. Đã có 20TN1202 điểm F ở HKII 2023–2024 |
| 2347A065 — Trương Quang Tuấn | TN1008D cùng môn và tín chỉ, VT ở HK hè 2024–2025, không khớp CQ23CT. Có cả 20TN1202 VT trong cùng kỳ | Xác minh mã tương đương và bản ghi trùng; không cộng nợ hai lần cho cùng học phần. Hiện ánh xạ TN1008D → 20TN1202 chỉ được khai báo cho CQ22CT-PM |
| 2246A006 — Lưu Thị Nghĩa | 20CT3112D, Cấu trúc dữ liệu và thuật giải nâng cao, 3 TC, HKII 2024–2025: chờ điểm và chưa khớp danh mục CQ22CT-PM | Xác minh môn thuộc CTĐT/nhóm tự chọn hay đăng ký ngoài chương trình; bổ sung ánh xạ khi có căn cứ và xác minh kết quả |
| 2246B045 — Đỗ Văn Hiển | 20HN1201, 20HN1204 ở HKII 2022–2023: điểm trống; HN2103D ở HKI 2023–2024: chờ điểm. Cả ba không thuộc danh mục CNTT đang dùng | Có QĐ48 ngày 23/01/2024 ghi chuyển ngành HNK46 → CTK46B. Cần tách lịch sử ngành cũ, chỉ đưa môn được công nhận/tiếp tục yêu cầu vào nợ CTĐT mới. Hiện bộ tính nợ đọc toàn bộ lịch sử nên ba môn ngành cũ làm trạng thái nợ chưa đầy đủ |

Hai trường hợp mã Toán rời rạc cần xác nhận tương đương, không chỉ dựa vào tên giống nhau. Trường hợp Hiển cho thấy vấn đề phạm vi dữ liệu sau chuyển ngành, không đơn thuần thiếu bảng điểm CNTT.

## 3. Thiếu kỳ của điểm đã đạt — 1 sinh viên, 5 bản ghi

Hoàng Xuân Nghĩa, MSSV2347A048, có quyết định chuyển trường đến số978 ngày20/08/2024. Năm bản ghi gồm 20CT1101 (3 TC), 20CT1102 (4 TC), 20CT2102 (3 TC), LC1101D (3 TC), LC1102D (2 TC). Tất cả có điểm C/B, `IsPass=x`, `NotScore=0`, dấu `DiemChuyenMien=R`, nhưng `YearStudy` và `TermID` trống. Các trường `NamHoc/HocKy` là chỉ số, không xác định được một năm học thực tế; không tự gán từ số1.

Đây không phải năm môn đã xác nhận rớt. Bộ tính đang đánh dấu toàn bộ tiêu chí chưa đủ chỉ vì tồn tại bản ghi học thuật chưa xác định kỳ, kể cả bản ghi đã đạt. Cần nhận diện điểm công nhận/chuyển miễn riêng và xác định mốc công nhận nếu dùng để giải quyết nợ trước một kỳ cụ thể. Dữ liệu có kỳ hiện tại tính được 0 TC nợ, nhưng hệ thống vẫn chặn kết luận do năm bản ghi này.

## Điều cần sửa trong hệ thống

1. Tách ba loại vấn đề: thiếu kết quả, thiếu ánh xạ môn/CTĐT và thiếu kỳ của điểm công nhận. Không dùng một lời giải thích chung cho cả ba.
2. Hiển thị mã môn, kỳ, trường bị thiếu và phần nợ đã tính được. Phần nợ này chưa phải tổng đã xác nhận, nhất là khi học lại hoặc công nhận chưa rõ.
3. Bổ sung ánh xạ đã xác minh và xử lý chuyển ngành/điểm công nhận theo đúng phạm vi. Không sửa điểm trống thành F hoặc coi thiếu kỳ mặc nhiên là có nợ.

Trong kỳ được rà soát, không gặp trường hợp lệch số tín chỉ, thiếu toàn bộ CTĐT hoặc thiếu định mức nhóm tự chọn là nguyên nhân của 9 sinh viên này. Thông báo hiện tại nhắc đến học lại và tự chọn quá chung, không phản ánh đúng từng trường hợp.

[Danh sách bản ghi chi tiết](academic-debt-missing-data-2026-10-11.md) · [Dữ liệu JSON](academic-debt-missing-data-2026-10-11.json).
