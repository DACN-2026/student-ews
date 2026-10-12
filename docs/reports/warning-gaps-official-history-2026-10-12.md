# Tiêu chí chưa đánh giá được và lịch sử cảnh báo học vụ

Kiểm tra ngày 12/10/2026. Kỳ cảnh báo đang xét: HKII 2025-2026. Kỳ hiện tại: HKI 2026-2027. Rà soát chỉ đọc, không thay đổi kết quả đánh giá, quyết định hoặc trạng thái sinh viên.

## Phạm vi và cách đọc

- Lấy đúng kết quả mới nhất đang được trang Cảnh báo học tập sử dụng: 622 sinh viên được phân mức, 52 người có ít nhất một tiêu chí NOT_EVALUATED. Đây là tình trạng sau bản sửa v21, không dùng danh sách 200 người cũ.
- 41/52 người có ít nhất một kỳ trong quyết định cảnh báo học vụ; 23 người có chuỗi ít nhất 2 kỳ chính liên tiếp, 18 người chỉ có 1 kỳ cảnh báo được ghi nhận; 11 người không thấy cảnh báo học vụ trong nguồn.
- Không có người nào trong nhóm 52 có từ 3 kỳ cảnh báo liên tiếp. Tổng số kỳ bị cảnh báo không đồng nghĩa số kỳ liên tiếp: Võ Kim Phúc có 4 kỳ cảnh báo, Vũ Ngọc Phi và Cheng Ngọc Việt có 3 kỳ trong lịch sử nhưng chuỗi dài nhất đều là 2.
- Hai sinh viên có 3 kỳ liên tiếp và cứu xét đã nêu ở báo cáo trước (Đinh Minh Quang, Hán Đức Oanh) không thuộc nhóm 52 còn thiếu tiêu chí của kỳ đang xét.
- Dùng nội dung kỳ áp dụng trong FullText thay vì chỉ dùng bucket TermID hoặc nhãn Khác. Chỉ đếm quyết định có số/ngày ký; không đếm lại dòng chỉ ghi Cứu xét, không đếm màu nguy cơ nội bộ. Kỳ hè được kiểm tra dữ liệu học lại/cải thiện, không làm tăng số kỳ chính cảnh báo liên tiếp.
- Đã đọc API LayDanhSachQuyetDinh và LayBangDiemSinhVien cho cả 52 sinh viên. Không có lỗi gọi API, không có sai khác quyết định cảnh báo, số dòng đăng ký hoặc điểm số với dữ liệu hệ thống theo CTĐT hiện tại. Đối chiếu các chương trình trước chuyển ngành/trường chưa thuộc kết luận này.
- Không thấy cứu xét trong API chỉ có nghĩa chưa có bằng chứng trong dữ liệu đã đọc; không kết luận đã bị từ chối cứu xét hoặc là ngoại lệ được cho phép. Có dòng đăng ký chỉ chứng minh ghi nhận đăng ký; chưa chứng minh đang đi học. Điểm VT không được gọi là điểm số.
- HKI 2026-2027 đang diễn ra: chưa ghi nhận đăng ký là trạng thái tại thời điểm kiểm tra, không mặc định là kết luận cuối kỳ.

## Nhóm nguyên nhân (không trùng sinh viên)

| Nhóm | Số SV | Có cảnh báo học vụ | Có chuỗi từ 2 kỳ liên tiếp |
|---|---:|---:|---:|
| Thiếu tiêu chí khác (nợ, kỳ GPA liền trước, lịch sử chuyển trường/ngành) | 6 | 2 | 2 |
| Toàn VT, GPA học kỳ nguồn trống | 11 | 8 | 6 |
| Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | 35 | 31 | 15 |

## Theo từng tiêu chí (có thể trùng sinh viên)

| Tiêu chí | Số SV chưa đánh giá | Có cảnh báo học vụ | Có chuỗi từ 2 kỳ |
|---|---:|---:|---:|
| Tín chỉ nợ tích lũy | 4 | 1 | 1 |
| GPA học kỳ theo ngưỡng học vụ | 47 | 39 | 21 |
| GPA học kỳ theo dõi sớm | 46 | 39 | 21 |
| GPA học kỳ suy giảm | 48 | 40 | 22 |
| Tỷ lệ tín chỉ không đạt học kỳ | 35 | 31 | 15 |
| Tỷ lệ tín chỉ không đạt theo dõi sớm | 35 | 31 | 15 |
| GPA tích lũy theo trình độ năm | 33 | 29 | 13 |
| GPA tích lũy sát ngưỡng | 33 | 29 | 13 |
| GPA tích lũy suy giảm | 34 | 29 | 13 |

## 13 người không đăng ký học phần có tín chỉ ở các kỳ chính sau chuỗi cảnh báo

Cả 13 có cảnh báo HKII 2024-2025 và HKI 2025-2026, theo quyết định 1209/QĐ-ĐHĐL (12/09/2025) và 340/QĐ-ĐHĐL (03/04/2026). HKII 2025-2026 và HKI 2026-2027 không có học phần có tín chỉ; kỳ hè 2025-2026 cũng không có. Không thấy quyết định cứu xét, nghỉ tạm thời hoặc rời chương trình trong API của nhóm này.

| MSSV | Họ tên | Lớp | HKII 2025-2026 | HKI 2026-2027 |
|---|---|---|---|---|
| 2246B029 | Trịnh Minh Thiện | ITK46B | Chỉ có hoạt động 0 tín chỉ | Không có dòng đăng ký |
| 2347C046 | Lâm Tuấn Trang | ITK47C | Không có dòng đăng ký | Không có dòng đăng ký |
| 2448A001 | Lý Ngọc Tùng | ITK48A | Không có dòng đăng ký | Không có dòng đăng ký |
| 2448A009 | Trương Thị Hải | ITK48A | Không có dòng đăng ký | Không có dòng đăng ký |
| 2448A010 | Đinh Xuân Tuấn | ITK48A | Không có dòng đăng ký | Không có dòng đăng ký |
| 2448A024 | Vũ Thúy Sơn | ITK48A | Không có dòng đăng ký | Không có dòng đăng ký |
| 2448A030 | Cao Xuân Chi | ITK48A | Không có dòng đăng ký | Không có dòng đăng ký |
| 2448A051 | Hoàng Hoàng Việt | ITK48A | Không có dòng đăng ký | Không có dòng đăng ký |
| 2448B004 | Lâm Thúy An | ITK48B | Không có dòng đăng ký | Không có dòng đăng ký |
| 2448B022 | Trịnh Tuấn Khanh | ITK48B | Không có dòng đăng ký | Không có dòng đăng ký |
| 2448B026 | Đoàn Mai Vỹ | ITK48B | Không có dòng đăng ký | Không có dòng đăng ký |
| 2448B033 | Đoàn Đức Lâm | ITK48B | Không có dòng đăng ký | Không có dòng đăng ký |
| 2448B048 | Cao Hoàng Phong | ITK48B | Không có dòng đăng ký | Không có dòng đăng ký |

Trịnh Minh Thiện có 3 dòng SHCD 0 tín chỉ ở HKII 2025-2026, không phải đăng ký môn học có tín chỉ.

## 7 người có chuỗi cảnh báo nhưng đã ghi nhận đăng ký ở kỳ hiện tại

| MSSV | Họ tên | Chuỗi cảnh báo gần nhất | HKII 2025-2026 | HKI 2026-2027 | Cứu xét |
|---|---|---|---|---|---|
| 2246A041 | Vũ Ngọc Phi | HK01 (2023-2024) -> HK02 (2023-2024) | Có điểm số học phần | 3 HP / 14 TC, chưa có điểm số | Chưa thấy trong API |
| 2246B008 | Võ Kim Phúc | HK01 (2024-2025) -> HK02 (2024-2025) | Có đăng ký nhưng toàn VT | 6 HP / 19 TC, chưa có điểm số | Có: HKI và HKII 2025-2026 |
| 2347A019 | Trương Xuân Thắng | HK01 (2024-2025) -> HK02 (2024-2025) | Không có dòng đăng ký | 7 HP / 21 TC, chưa có điểm số | Chưa thấy trong API |
| 2347A049 | Hà Thị Trung | HK02 (2024-2025) -> HK01 (2025-2026) | Chỉ có hoạt động 0 tín chỉ | 4 HP / 13 TC, chưa có điểm số | Chưa thấy trong API |
| 2347C026 | Đặng Minh Việt | HK02 (2024-2025) -> HK01 (2025-2026) | Có điểm số học phần | 5 HP / 15 TC, chưa có điểm số | Chưa thấy trong API |
| 2347C044 | Cheng Ngọc Việt | HK02 (2024-2025) -> HK01 (2025-2026) | Có đăng ký nhưng toàn VT | 8 HP / 25 TC, chưa có điểm số | Chưa thấy trong API |
| 2448A027 | Lưu Văn Cường | HK02 (2024-2025) -> HK01 (2025-2026) | Có đăng ký nhưng toàn VT | 5 HP / 16 TC, chưa có điểm số | Chưa thấy trong API |

- Vũ Ngọc Phi: hai kỳ liên tiếp HKI/HKII 2023-2024; các kỳ chính sau có điểm số. Có thêm cảnh báo HKII 2024-2025 nhưng không nối liên tiếp chuỗi cũ.
- Đặng Minh Việt: sau cảnh báo HKII 2024-2025/HKI 2025-2026, HKII 2025-2026 có 1 học phần có điểm số trong 4 học phần có tín chỉ. Tiêu chí thiếu chỉ là so sánh GPA kỳ chính liền trước.
- Trương Xuân Thắng: sau cảnh báo HKI/HKII 2024-2025, HKI 2025-2026 có điểm; HKII 2025-2026 không đăng ký; kỳ hè đăng ký 6 học phần, trong đó 4 có điểm số; HKI 2026-2027 có 7 HP/21 TC.
- Hà Thị Trung: HKII 2025-2026 chỉ có 3 SHCD 0 TC; kỳ hè 2025-2026 đăng ký 2 học phần, trong đó 1 có điểm số; HKI 2026-2027 có 4 HP/13 TC. Vì vậy không xếp là không học tất cả kỳ sau.
- Võ Kim Phúc: quyết định 1209/QĐ-ĐHĐL (12/09/2025) ghi Cứu xét HKI 2025-2026, quyết định 340/QĐ-ĐHĐL (03/04/2026) ghi Cứu xét HKII 2025-2026. HKI có 4 môn có điểm số; HKII có 7 môn/23 TC toàn VT, GPA trống; HKI 2026-2027 có 6 HP/19 TC. Dòng chỉ ghi cứu xét HKII không được tính là một cảnh báo mới.
- Cheng Ngọc Việt và Lưu Văn Cường: HKII 2025-2026 toàn VT; HKI 2026-2027 có đăng ký chưa có điểm. Chưa có nội dung cứu xét trong API. Không suy ra đã được chấp thuận ngoại lệ chỉ từ đăng ký.

## 3 người có đăng ký kỳ sau nhưng toàn VT, rồi chưa có đăng ký kỳ hiện tại

Cả 3 có chuỗi cảnh báo HKII 2024-2025 -> HKI 2025-2026; chưa thấy cứu xét trong API.

| MSSV | Họ tên | HKII 2025-2026 | HKI 2026-2027 |
|---|---|---|---|
| 2448A021 | Nguyễn Tuấn Bình | 6 HP / 18 TC toàn VT | Không có đăng ký |
| 2448A036 | Hán Tuấn Mạnh | 6 HP / 19 TC toàn VT | Không có đăng ký |
| 2448B030 | Phạm Văn Kiên | 5 HP / 16 TC toàn VT | Không có đăng ký |

Trong 23 người có chuỗi liên tiếp, 1 người có cứu xét ghi rõ (Võ Kim Phúc), 22 người chưa thấy cứu xét. Không thấy quyết định thôi học/chuyển trường hoặc nghỉ tạm thời giải thích kỳ sau của nhóm 23.

## Quyết định nghỉ và học lại trong nhóm còn thiếu tiêu chí

- Lưu Thị Phúc (2549C057): chỉ có cảnh báo HKI 2025-2026, không có chuỗi 2 kỳ. Có quyết định nghỉ học tạm thời 595/QĐ-ĐHĐL ngày 27/05/2026, nêu HKIII 2025-2026 và HKI 2026-2027; sau đó có quyết định 947/QĐ-ĐHĐL ngày 23/07/2026, Tiếp nhận học lại, ghi nhận HKI 2026-2027. Kỳ hiện tại có 9 học phần có tín chỉ. Đây là trường hợp có hồ sơ giải thích việc nghỉ/học lại, khác với cứu xét.
- Dương Minh Trung đang được đóng băng và không thuộc 52 sinh viên được phân mức còn thiếu tiêu chí; không đưa vào các số trên.

## Toàn bộ 52 sinh viên và tiêu chí thiếu

| MSSV | Họ tên | Nhóm | Các tiêu chí chưa đánh giá | Các kỳ cảnh báo học vụ | Chuỗi dài nhất | Đăng ký HKI 2026-2027 | Cứu xét trong API |
|---|---|---|---|---|---:|---|---|
| 2246A006 | Lưu Thị Nghĩa | Thiếu tiêu chí khác (nợ, kỳ GPA liền trước, lịch sử chuyển trường/ngành) | Tín chỉ nợ tích lũy | Chưa ghi nhận | 0 | 4 HP / 24 TC | Chưa thấy |
| 2246A041 | Vũ Ngọc Phi | Thiếu tiêu chí khác (nợ, kỳ GPA liền trước, lịch sử chuyển trường/ngành) | Tín chỉ nợ tích lũy | HK01 (2023-2024); HK02 (2023-2024); HK02 (2024-2025) | 2 | 3 HP / 14 TC | Chưa thấy |
| 2246A050 | Vương Quang Thông | Toàn VT, GPA học kỳ nguồn trống | GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm | HK02 (2024-2025) | 1 | 0 HP / 0 TC | Chưa thấy |
| 2246B008 | Võ Kim Phúc | Toàn VT, GPA học kỳ nguồn trống | GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm | HK01 (2022-2023); HK02 (2022-2023); HK01 (2024-2025); HK02 (2024-2025) | 2 | 6 HP / 19 TC | HK02 (2025-2026); HK01 (2025-2026) |
| 2246B029 | Trịnh Minh Thiện | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK02 (2024-2025); HK01 (2025-2026) | 2 | 0 HP / 0 TC | Chưa thấy |
| 2246B045 | Đỗ Văn Hiển | Thiếu tiêu chí khác (nợ, kỳ GPA liền trước, lịch sử chuyển trường/ngành) | Tín chỉ nợ tích lũy | Chưa ghi nhận | 0 | 2 HP / 18 TC | Chưa thấy |
| 2347A019 | Trương Xuân Thắng | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK01 (2024-2025); HK02 (2024-2025) | 2 | 7 HP / 21 TC | Chưa thấy |
| 2347A036 | Đoàn Thị Bình | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | Chưa ghi nhận | 0 | 6 HP / 19 TC | Chưa thấy |
| 2347A048 | Hoàng Xuân Nghĩa | Thiếu tiêu chí khác (nợ, kỳ GPA liền trước, lịch sử chuyển trường/ngành) | GPA học kỳ theo ngưỡng học vụ; Tín chỉ nợ tích lũy | Chưa ghi nhận | 0 | 8 HP / 25 TC | Chưa thấy |
| 2347A049 | Hà Thị Trung | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK02 (2024-2025); HK01 (2025-2026) | 2 | 4 HP / 13 TC | Chưa thấy |
| 2347A054 | Phạm Hương Tân | Toàn VT, GPA học kỳ nguồn trống | GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm | Chưa ghi nhận | 0 | 4 HP / 12 TC | Chưa thấy |
| 2347A057 | Phạm Thị Quang | Toàn VT, GPA học kỳ nguồn trống | GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm | Chưa ghi nhận | 0 | 0 HP / 0 TC | Chưa thấy |
| 2347A065 | Trương Quang Tuấn | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK02 (2023-2024) | 1 | 0 HP / 0 TC | Chưa thấy |
| 2347B037 | Hồ Kim Long | Thiếu tiêu chí khác (nợ, kỳ GPA liền trước, lịch sử chuyển trường/ngành) | GPA học kỳ suy giảm; GPA tích lũy suy giảm | Chưa ghi nhận | 0 | 0 HP / 0 TC | Chưa thấy |
| 2347B047 | Thái Anh Hạnh | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK02 (2024-2025) | 1 | 0 HP / 0 TC | Chưa thấy |
| 2347C026 | Đặng Minh Việt | Thiếu tiêu chí khác (nợ, kỳ GPA liền trước, lịch sử chuyển trường/ngành) | GPA học kỳ suy giảm | HK02 (2024-2025); HK01 (2025-2026) | 2 | 5 HP / 15 TC | Chưa thấy |
| 2347C040 | Đỗ Thúy Tài | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK01 (2025-2026) | 1 | 0 HP / 0 TC | Chưa thấy |
| 2347C044 | Cheng Ngọc Việt | Toàn VT, GPA học kỳ nguồn trống | GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm | HK02 (2023-2024); HK02 (2024-2025); HK01 (2025-2026) | 2 | 8 HP / 25 TC | Chưa thấy |
| 2347C046 | Lâm Tuấn Trang | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK02 (2024-2025); HK01 (2025-2026) | 2 | 0 HP / 0 TC | Chưa thấy |
| 2448A001 | Lý Ngọc Tùng | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK02 (2024-2025); HK01 (2025-2026) | 2 | 0 HP / 0 TC | Chưa thấy |
| 2448A009 | Trương Thị Hải | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK02 (2024-2025); HK01 (2025-2026) | 2 | 0 HP / 0 TC | Chưa thấy |
| 2448A010 | Đinh Xuân Tuấn | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK02 (2024-2025); HK01 (2025-2026) | 2 | 0 HP / 0 TC | Chưa thấy |
| 2448A021 | Nguyễn Tuấn Bình | Toàn VT, GPA học kỳ nguồn trống | GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm | HK02 (2024-2025); HK01 (2025-2026) | 2 | 0 HP / 0 TC | Chưa thấy |
| 2448A024 | Vũ Thúy Sơn | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK02 (2024-2025); HK01 (2025-2026) | 2 | 0 HP / 0 TC | Chưa thấy |
| 2448A027 | Lưu Văn Cường | Toàn VT, GPA học kỳ nguồn trống | GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm | HK02 (2024-2025); HK01 (2025-2026) | 2 | 5 HP / 16 TC | Chưa thấy |
| 2448A028 | Cao Mai Thiện | Toàn VT, GPA học kỳ nguồn trống | GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm | HK01 (2025-2026) | 1 | 0 HP / 0 TC | Chưa thấy |
| 2448A030 | Cao Xuân Chi | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK02 (2024-2025); HK01 (2025-2026) | 2 | 0 HP / 0 TC | Chưa thấy |
| 2448A036 | Hán Tuấn Mạnh | Toàn VT, GPA học kỳ nguồn trống | GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm | HK02 (2024-2025); HK01 (2025-2026) | 2 | 0 HP / 0 TC | Chưa thấy |
| 2448A051 | Hoàng Hoàng Việt | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK02 (2024-2025); HK01 (2025-2026) | 2 | 0 HP / 0 TC | Chưa thấy |
| 2448A056 | Hán Tuấn An | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK01 (2025-2026) | 1 | 0 HP / 0 TC | Chưa thấy |
| 2448B004 | Lâm Thúy An | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK02 (2024-2025); HK01 (2025-2026) | 2 | 0 HP / 0 TC | Chưa thấy |
| 2448B022 | Trịnh Tuấn Khanh | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK02 (2024-2025); HK01 (2025-2026) | 2 | 0 HP / 0 TC | Chưa thấy |
| 2448B026 | Đoàn Mai Vỹ | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK02 (2024-2025); HK01 (2025-2026) | 2 | 0 HP / 0 TC | Chưa thấy |
| 2448B030 | Phạm Văn Kiên | Toàn VT, GPA học kỳ nguồn trống | GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm | HK02 (2024-2025); HK01 (2025-2026) | 2 | 0 HP / 0 TC | Chưa thấy |
| 2448B033 | Đoàn Đức Lâm | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK02 (2024-2025); HK01 (2025-2026) | 2 | 0 HP / 0 TC | Chưa thấy |
| 2448B048 | Cao Hoàng Phong | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK02 (2024-2025); HK01 (2025-2026) | 2 | 0 HP / 0 TC | Chưa thấy |
| 2549A010 | Trương Hương Lâm | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK01 (2025-2026) | 1 | 0 HP / 0 TC | Chưa thấy |
| 2549A014 | Cheng Văn Hải | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK01 (2025-2026) | 1 | 0 HP / 0 TC | Chưa thấy |
| 2549A038 | Cheng Đức Nghĩa | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | Chưa ghi nhận | 0 | 0 HP / 0 TC | Chưa thấy |
| 2549A053 | Đỗ Thị Bảo | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK01 (2025-2026) | 1 | 0 HP / 0 TC | Chưa thấy |
| 2549A065 | Trọng Thị Minh | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | Chưa ghi nhận | 0 | 0 HP / 0 TC | Chưa thấy |
| 2549B008 | Đoàn Văn Nam | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK01 (2025-2026) | 1 | 0 HP / 0 TC | Chưa thấy |
| 2549B020 | Phạm Tuấn Sơn | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | Chưa ghi nhận | 0 | 0 HP / 0 TC | Chưa thấy |
| 2549B025 | Phùng Thị Vỹ | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK01 (2025-2026) | 1 | 0 HP / 0 TC | Chưa thấy |
| 2549B030 | Võ Thị Đức | Toàn VT, GPA học kỳ nguồn trống | GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm | Chưa ghi nhận | 0 | 0 HP / 0 TC | Chưa thấy |
| 2549B035 | Ngô Quang Bình | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK01 (2025-2026) | 1 | 9 HP / 23 TC | Chưa thấy |
| 2549B062 | Bùi Thị Thanh | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK01 (2025-2026) | 1 | 0 HP / 0 TC | Chưa thấy |
| 2549C036 | Hoàng Văn Nghĩa | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK01 (2025-2026) | 1 | 0 HP / 0 TC | Chưa thấy |
| 2549C047 | Bùi Xuân Thắng | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK01 (2025-2026) | 1 | 0 HP / 0 TC | Chưa thấy |
| 2549C057 | Lưu Thị Phúc | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK01 (2025-2026) | 1 | 9 HP / 22 TC | Chưa thấy |
| 2549C063 | Phan Hương Tài | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK01 (2025-2026) | 1 | 0 HP / 0 TC | Chưa thấy |
| 2549C068 | Võ Hữu Huy | Không có học phần học thuật kỳ xét (33 thiếu tổng hợp, 2 chỉ có SHCD 0 TC) | Tỷ lệ tín chỉ không đạt học kỳ; GPA tích lũy theo trình độ năm; GPA tích lũy sát ngưỡng; GPA học kỳ theo ngưỡng học vụ; GPA học kỳ theo dõi sớm; GPA học kỳ suy giảm; GPA tích lũy suy giảm; Tỷ lệ tín chỉ không đạt theo dõi sớm | HK01 (2025-2026) | 1 | 0 HP / 0 TC | Chưa thấy |

Tệp JSON cùng tên lưu từng tiêu chí, lý do thiếu, các quyết định với nguyên văn, lịch sử đăng ký theo kỳ chính/kỳ hè, ví dụ điểm và kết quả đối chiếu API.
