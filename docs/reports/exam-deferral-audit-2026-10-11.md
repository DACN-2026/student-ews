# Rà soát hoãn thi và học phần VT

Thời điểm kiểm tra API: 2026-10-11T06:06:02.672Z. Đọc dữ liệu, không thay đổi điểm, quyết định hoặc kết quả cảnh báo.

**Chưa tìm thấy bằng chứng hoãn thi trong dữ liệu hệ thống hoặc API công khai đang sử dụng của 625 sinh viên. Không thể suy ra rằng ngoài API không có quyết định/đơn được duyệt.**

| Phạm vi | Kết quả |
| --- | --- |
| Quyết định trong hệ thống | 912; không có tên/nội dung/lý do đề cập hoãn thi, thi bù, vắng thi có lý do hoặc cấm thi |
| Quyết định API | 913 dòng; 625/625 yêu cầu thành công; không có nội dung liên quan |
| Bảng điểm hệ thống | 31141 dòng có kỳ; 16 dòng chưa xác định kỳ |
| Bảng điểm API theo CTĐT hiện tại | 31154 dòng; 625/625 yêu cầu thành công |
| Mã VT | 1239 lượt học phần của 236 sinh viên; số lượt của từng sinh viên khớp hệ thống |
| VT tại HK02 (2025-2026) | 481 lượt học phần của 128 sinh viên |
| Mã I (hoãn thi theo QĐ600) | 0 |
| Mã X | 0 |
| Note / ghi chú điểm API | 0 dòng có nội dung |

## Dữ liệu API có và chưa có

Đã kiểm tra tất cả trường văn bản của quyết định và bảng điểm; loại trường tên sinh viên/người ký khỏi tìm kiếm từ khóa để tránh tên riêng trùng với cụm “hoãn thi”. Kiểm tra DiemTK_10, DiemTK_4, DiemTK_Chu để tìm mã I/X và mã khác. NotScore chỉ là cờ chưa có điểm, không đủ chứng minh hoãn thi.

Danh mục 8 endpoint công khai không có endpoint riêng cho đơn hoãn thi, phê duyệt lý do vắng thi hoặc lịch thi bù. Schema của LayDanhSachQuyetDinh và LayBangDiemSinhVien cũng chưa có trường riêng liên kết phê duyệt hoãn thi tới học phần/lần thi. Đã đọc trực tiếp llms.txt và hai trang OpenAPI; cả ba trả HTTP 200.

Ngoài VT, API có 6 dòng điểm chữ M ở các học phần Giáo dục quốc phòng, không có năm/kỳ và bị loại khỏi GPA. Đây không phải mã I; tài liệu API không giải thích M nên chưa gán ý nghĩa hoãn thi:

- 2448A025 — Nguyễn Thị Kiên: 4 học phần, mã M.
- 2549A055 — Phùng Hữu Minh: 2 học phần, mã M.

Số dòng quyết định API và hệ thống chênh lệch: [{"student":"2246B027","name":"Lê Quang Trâm","api":4,"system":3}]. Chênh lệch số dòng không được coi là bằng chứng hoãn thi; nội dung toàn bộ dòng API đã được kiểm tra. Bảng điểm API gọi theo CTĐT hiện tại, còn hệ thống lưu lịch sử nhập và bản ghi chưa xác định kỳ nên không dùng chênh lệch tổng số dòng để kết luận mất dữ liệu.

## Đối chiếu QĐ600

Điều 13 khoản 4 điểm e: vắng thi không có lý do chính đáng hoặc bị cấm thi nhận điểm 0 của buổi thi/đánh giá; vắng có lý do chính đáng được Hiệu trưởng duyệt được thi ở đợt khác và tính lần đầu. Điều 13 khoản 5 điểm c quy định I cho chưa có điểm do được hoãn thi; X cho điểm chưa hoàn thiện do chưa đủ dữ liệu. Điểm học phần tổng hợp từ các thành phần theo khoản 5, nên điểm 0 của một buổi thi không tự động đồng nghĩa điểm học phần 0.

Nguồn: [QĐ600, trang in 15 / trang PDF 19](../Quyet-dinh-so-600-QD-DHDL-ve-viec-ban-hanh-Quy-che-dao-tao-trinh-do-dai-hoc-cua-Truong-Dai-hoc-Da-Lat-VER1.pdf).

## Hệ quả cho chức năng cảnh báo

courseOutcome hiện xếp VT vào không đạt; dữ liệu tính tỷ lệ tín chỉ không đạt cũng coi VT không có cờ NotScore là kết quả cuối. Chưa có bước đối chiếu phê duyệt hoãn thi theo học phần/lần thi. Đây là giả định cần làm rõ với bên cung cấp dữ liệu trước khi coi mọi VT là kết quả không đạt cuối cùng hoặc quy đổi thành GPA 0.

Nếu bổ sung dữ liệu, cần ít nhất MSSV, học phần/lớp học phần, năm/kỳ, lần thi, trạng thái và ngày phê duyệt, văn bản/chứng cứ phê duyệt, kết quả thay thế sau thi bù. Hoãn thi hợp lệ chỉ trì hoãn đánh giá học phần liên quan, không đóng băng toàn bộ hồ sơ như nghỉ học tạm thời. Khi chưa có bằng chứng, giữ VT là tín hiệu cần theo dõi/xác minh, không tự gán hoãn thi và không suy ra vắng không có lý do.

[Kết quả API chi tiết](exam-deferral-source-audit-2026-10-11.json) · [Kết quả hệ thống chi tiết](exam-deferral-system-audit-2026-10-11.json)
