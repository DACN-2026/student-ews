# Rà soát cảnh báo học vụ liên tiếp và tiếp tục học ở kỳ sau

Ngày kiểm tra: 12/10/2026. Chỉ đọc dữ liệu; không thay đổi trạng thái sinh viên hoặc quyết định.

## Căn cứ và phạm vi

- QĐ600, Điều 18 khoản 2(a), trang 22 quy chế (trang 26 PDF): bị cảnh báo học tập **quá 2 lần liên tiếp**, tương ứng từ 3 lần. Khoản 3(b) quy định trình Hiệu trưởng ra quyết định buộc thôi học.
- TB1270, mục 2.2, trang 1: từ **02 học kỳ liên tiếp trở lên**, áp dụng đợt HKII 2024-2025 cho sinh viên K45-K48 chính quy. Mục 3.2, trang 2 nêu tư vấn, đơn cứu xét đối với sinh viên thuộc đối tượng buộc thôi học lần đầu và các trường hợp không giải quyết cứu xét.
- Hai văn bản có cách ghi mốc khác nhau. Không tự suy diễn TB1270 áp dụng cho mọi kỳ hoặc dùng số lần cảnh báo để thay thế quyết định buộc thôi học.
- Rà soát 625 sinh viên và 912 dòng quyết định. Ghép kỳ theo nội dung quyết định, chỉ xét hai kỳ chính liên tiếp; kỳ hè không tạo thêm một kỳ cảnh báo chính.
- Loại hai dòng chỉ ghi "Cảnh báo học vụ(Cứu xét HK2, 2025-2026)" khỏi số lần cảnh báo mới. Màu nguy cơ của hệ thống không được tính là quyết định học vụ.
- Đối chiếu trực tiếp API LayDanhSachQuyetDinh và LayBangDiemSinhVien cho toàn bộ 29 sinh viên khớp; không có sai khác số dòng đăng ký/điểm số hoặc thiếu số quyết định trong các cặp được kiểm tra.
- Đây là quan sát kết quả ở kỳ học ngay sau các kỳ nêu trong quyết định; không suy ra mọi sinh viên vẫn đang học tại thời điểm kiểm tra, cũng không suy ra ngày đăng ký sau ngày ký quyết định.

## Kết quả

- 29 sinh viên có học phần có tín chỉ ở kỳ chính ngay sau ít nhất hai kỳ cảnh báo liên tiếp.
- Trong đó 24 sinh viên có điểm số học phần kỳ sau, tương ứng 27 chuỗi quan sát. Một sinh viên có thể xuất hiện ở nhiều chuỗi lịch sử.
- 5 sinh viên còn lại có dòng học phần nhưng toàn VT, không dùng để khẳng định đã tham gia học/thi bình thường.
- Riêng chuỗi HKII 2024-2025 -> HKI 2025-2026 -> kỳ sau HKII 2025-2026: 16 sinh viên có đăng ký có tín chỉ, gồm 11 người có điểm số và 5 người toàn VT.

## Trường hợp có cứu xét khớp kỳ tiếp tục học

| MSSV | Họ tên | Chuỗi cảnh báo đến trước kỳ học tiếp | Kỳ học tiếp | GPA kỳ học tiếp (thang 4) | Căn cứ cứu xét từ API |
|---|---|---|---|---|---|
| 2246B008 | Võ Kim Phúc | HK01 (2024-2025) -> HK02 (2024-2025) | HK01 (2025-2026) | 0.95 | 1209/QÐ-ÐHÐL_12092025: Cảnh báo học vụ(HK 2, 2024-2025 - Cứu xét HKI, 2025-2026) |
| 2347B008 | Đinh Minh Quang | HK02 (2023-2024) -> HK01 (2024-2025) -> HK02 (2024-2025) | HK01 (2025-2026) | 1.21 | 1209/QÐ-ÐHÐL_12092025: Cảnh báo học vụ(HK 2, 2024-2025 - Cứu xét HKI, 2025-2026) |
| 2347C036 | Hán Đức Oanh | HK02 (2023-2024) -> HK01 (2024-2025) -> HK02 (2024-2025) | HK01 (2025-2026) | 1 | 1209/QÐ-ÐHÐL_12092025: Cảnh báo học vụ(HK 2, 2024-2025 - Cứu xét HKI, 2025-2026) |

Đinh Minh Quang và Hán Đức Oanh có 3 kỳ cảnh báo liên tiếp: HKII 2023-2024, HKI 2024-2025, HKII 2024-2025; các quyết định tương ứng 1318/QĐ-ĐHĐL (28/10/2024), 309/QĐ-ĐHĐL (26/03/2025), 1209/QĐ-ĐHĐL (12/09/2025). Quyết định 1209 ghi cứu xét HKI 2025-2026. Đó là bằng chứng giải thích việc học tiếp trong API; chưa thay thế bản quyết định ký số/bản giấy đầy đủ khi cần kết luận pháp lý.

## Trường hợp của đợt HKII 2024-2025 chưa thấy cứu xét trong API

| MSSV | Họ tên | Hai kỳ cảnh báo | Kỳ học tiếp | Số học phần có điểm số | GPA kỳ học tiếp |
|---|---|---|---|---:|---:|
| 2347A019 | Trương Xuân Thắng | HK01 (2024-2025) -> HK02 (2024-2025) | HK01 (2025-2026) | 3 | 1.08 |
| 2347B049 | Đỗ Mai Giang | HK01 (2024-2025) -> HK02 (2024-2025) | HK01 (2025-2026) | 4 | 1.16 |
| 2347C015 | Cheng Ngọc Bảo | HK01 (2024-2025) -> HK02 (2024-2025) | HK01 (2025-2026) | 4 | 1.11 |

Ba sinh viên này là Trương Xuân Thắng, Đỗ Mai Giang và Cheng Ngọc Bảo. API không có dòng quyết định cứu xét giải thích kỳ học tiếp trong dữ liệu đã kiểm tra; không kết luận không được cứu xét hoặc dữ liệu trái quy chế. Cần hồ sơ Phòng CTSV/quyết định đầy đủ hoặc quy định áp dụng đúng khóa và kỳ.

## Toàn bộ các chuỗi có học phần có tín chỉ ở kỳ sau

| MSSV | Họ tên | Lớp | Kỳ cảnh báo 1 | Kỳ cảnh báo 2 | Kỳ sau | Số kỳ cảnh báo liên tiếp đã ghi nhận | Học phần có tín chỉ | Học phần có điểm số | Cứu xét khớp kỳ sau |
|---|---|---|---|---|---|---:|---:|---:|---|
| 2246A001 | Lâm Anh Vỹ | ITK46A | HK01 (2022-2023) | HK02 (2022-2023) | HK01 (2023-2024) | 2 | 9 | 9 | Chưa thấy trong API |
| 2246B008 | Võ Kim Phúc | ITK46B | HK01 (2022-2023) | HK02 (2022-2023) | HK01 (2023-2024) | 2 | 10 | 8 | Chưa thấy trong API |
| 2246A041 | Vũ Ngọc Phi | ITK46A | HK01 (2023-2024) | HK02 (2023-2024) | HK01 (2024-2025) | 2 | 10 | 6 | Chưa thấy trong API |
| 2347C010 | Lưu Xuân Hà | ITK47C | HK01 (2023-2024) | HK02 (2023-2024) | HK01 (2024-2025) | 2 | 6 | 6 | Chưa thấy trong API |
| 2347C030 | Phạm Hoàng Minh | ITK47C | HK01 (2023-2024) | HK02 (2023-2024) | HK01 (2024-2025) | 2 | 8 | 7 | Chưa thấy trong API |
| 2246B008 | Võ Kim Phúc | ITK46B | HK01 (2024-2025) | HK02 (2024-2025) | HK01 (2025-2026) | 2 | 7 | 4 | Có |
| 2347A019 | Trương Xuân Thắng | ITK47A | HK01 (2024-2025) | HK02 (2024-2025) | HK01 (2025-2026) | 2 | 5 | 3 | Chưa thấy trong API |
| 2347B008 | Đinh Minh Quang | ITK47B | HK01 (2024-2025) | HK02 (2024-2025) | HK01 (2025-2026) | 3 | 10 | 9 | Có |
| 2347B049 | Đỗ Mai Giang | ITK47B | HK01 (2024-2025) | HK02 (2024-2025) | HK01 (2025-2026) | 2 | 6 | 4 | Chưa thấy trong API |
| 2347C015 | Cheng Ngọc Bảo | ITK47C | HK01 (2024-2025) | HK02 (2024-2025) | HK01 (2025-2026) | 2 | 7 | 4 | Chưa thấy trong API |
| 2347C036 | Hán Đức Oanh | ITK47C | HK01 (2024-2025) | HK02 (2024-2025) | HK01 (2025-2026) | 3 | 5 | 3 | Có |
| 2246A024 | Đỗ Hoàng Giang | ITK46A | HK02 (2023-2024) | HK01 (2024-2025) | HK02 (2024-2025) | 2 | 6 | 6 | Chưa thấy trong API |
| 2347A022 | Trương Thúy Khôi | ITK47A | HK02 (2023-2024) | HK01 (2024-2025) | HK02 (2024-2025) | 2 | 7 | 7 | Chưa thấy trong API |
| 2347A050 | Hồ Phương Trí | ITK47A | HK02 (2023-2024) | HK01 (2024-2025) | HK02 (2024-2025) | 2 | 7 | 7 | Chưa thấy trong API |
| 2347B008 | Đinh Minh Quang | ITK47B | HK02 (2023-2024) | HK01 (2024-2025) | HK02 (2024-2025) | 2 | 10 | 9 | Chưa thấy trong API |
| 2347C036 | Hán Đức Oanh | ITK47C | HK02 (2023-2024) | HK01 (2024-2025) | HK02 (2024-2025) | 2 | 6 | 1 | Chưa thấy trong API |
| 2246A028 | Hán Quang Dũng | ITK46A | HK02 (2024-2025) | HK01 (2025-2026) | HK02 (2025-2026) | 2 | 14 | 11 | Chưa thấy trong API |
| 2246B024 | Phan Anh Minh | ITK46B | HK02 (2024-2025) | HK01 (2025-2026) | HK02 (2025-2026) | 2 | 4 | 2 | Chưa thấy trong API |
| 2347B030 | Dương Quang Bảo | ITK47B | HK02 (2024-2025) | HK01 (2025-2026) | HK02 (2025-2026) | 2 | 5 | 5 | Chưa thấy trong API |
| 2347C026 | Đặng Minh Việt | ITK47C | HK02 (2024-2025) | HK01 (2025-2026) | HK02 (2025-2026) | 2 | 4 | 1 | Chưa thấy trong API |
| 2347C033 | Trọng Xuân Sơn | ITK47C | HK02 (2024-2025) | HK01 (2025-2026) | HK02 (2025-2026) | 2 | 6 | 1 | Chưa thấy trong API |
| 2347C044 | Cheng Ngọc Việt | ITK47C | HK02 (2024-2025) | HK01 (2025-2026) | HK02 (2025-2026) | 2 | 5 | 0 | Chưa thấy trong API |
| 2448A005 | Ngô Ngọc Tân | ITK48A | HK02 (2024-2025) | HK01 (2025-2026) | HK02 (2025-2026) | 2 | 5 | 5 | Chưa thấy trong API |
| 2448A013 | Phạm Lan Phúc | ITK48A | HK02 (2024-2025) | HK01 (2025-2026) | HK02 (2025-2026) | 2 | 6 | 2 | Chưa thấy trong API |
| 2448A014 | Lê Văn Quân | ITK48A | HK02 (2024-2025) | HK01 (2025-2026) | HK02 (2025-2026) | 2 | 5 | 2 | Chưa thấy trong API |
| 2448A017 | Phạm Lan Thanh | ITK48A | HK02 (2024-2025) | HK01 (2025-2026) | HK02 (2025-2026) | 2 | 6 | 2 | Chưa thấy trong API |
| 2448A021 | Nguyễn Tuấn Bình | ITK48A | HK02 (2024-2025) | HK01 (2025-2026) | HK02 (2025-2026) | 2 | 6 | 0 | Chưa thấy trong API |
| 2448A027 | Lưu Văn Cường | ITK48A | HK02 (2024-2025) | HK01 (2025-2026) | HK02 (2025-2026) | 2 | 5 | 0 | Chưa thấy trong API |
| 2448A036 | Hán Tuấn Mạnh | ITK48A | HK02 (2024-2025) | HK01 (2025-2026) | HK02 (2025-2026) | 2 | 6 | 0 | Chưa thấy trong API |
| 2448B003 | Trịnh Hương Quang | ITK48B | HK02 (2024-2025) | HK01 (2025-2026) | HK02 (2025-2026) | 2 | 5 | 5 | Chưa thấy trong API |
| 2448B030 | Phạm Văn Kiên | ITK48B | HK02 (2024-2025) | HK01 (2025-2026) | HK02 (2025-2026) | 2 | 5 | 0 | Chưa thấy trong API |
| 2448B050 | Phùng Văn Thông | ITK48B | HK02 (2024-2025) | HK01 (2025-2026) | HK02 (2025-2026) | 2 | 6 | 3 | Chưa thấy trong API |

## Đề xuất cho hệ thống

- Giữ sinh viên còn hoạt động trong các chức năng theo dõi; ưu tiên hỗ trợ khi có 2 kỳ cảnh báo chính liên tiếp.
- Hiển thị cứu xét theo đúng kỳ được nêu, không coi cứu xét là miễn mọi nguy cơ ở các kỳ sau.
- Chỉ chuyển tag "đã rời lớp" khi có quyết định thôi học/chuyển trường hợp lệ và đến kỳ có hiệu lực.
- Những trường hợp toàn VT cần liên hệ xác minh; có dòng học phần không đồng nghĩa đã học/thi bình thường.
- Tệp JSON cùng tên lưu số quyết định, nguyên văn nội dung từ API, điểm ví dụ, xác minh API và các chuỗi kỳ để tra cứu.
