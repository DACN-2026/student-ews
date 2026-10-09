# Đối chiếu cảnh báo HK02 (2025–2026) ngày 09/10/2026

Kiểm tra API thật và DB chỉ đọc. Thời điểm hoàn tất gọi nguồn: 2026-10-08T23:46:53.606Z (UTC). Không dùng response example để kết luận về sinh viên.

## 1. Sinh viên có hai hồ sơ can thiệp

**Phan Anh Minh — 2246B024 — ITK46B** (ID nội bộ e36890f2-e16e-40b0-83d9-2e4889419a4f). Chỉ một hồ sơ đang mở; hồ sơ còn lại đã hoàn tất.

| Hồ sơ | Nguồn lúc tạo | Tạo (UTC) | Trạng thái | Hoàn tất (UTC) |
|---|---|---|---|---|
| 144ac3ea-4356-49bd-8877-bedbd16b9353 | HK02 (2025–2026) | 2026-09-29T02:25:53.601Z | RESOLVED | 2026-09-30T05:51:39.849Z |
| e956f279-1849-4d0d-8507-be079682b9a0 | HK01 (2023–2024) | 2026-09-30T08:07:46.915Z | OPEN, sau đó cập nhật đến HK02 (2025–2026) | — |

Lịch sử ghi người dùng chuyển hồ sơ đầu OPEN → IN_PROGRESS → RESOLVED ngày 30/9. Khoảng 2 giờ 16 phút sau, hệ thống tạo hồ sơ thứ hai từ đợt đánh giá HK01 (2023–2024). Đây là phát lại kết quả học kỳ cũ sau khi hồ sơ mới hơn đã hoàn tất, không phải bằng chứng phát sinh nguy cơ mới ở học kỳ sau.

Nguyên nhân mã nguồn: AcademicWarningAutomationService.reconcilePastTermsWithGrades đồng bộ lại các kỳ cũ; InterventionCasesService.syncInterventionCasesForRun chỉ tìm hồ sơ đang mở, rồi tạo hồ sơ theo episodeKey chứa runId nếu không còn hồ sơ mở. Không có rào chắn so sánh học kỳ đã được xử lý/hoàn tất. Vì vậy một run lịch sử khác ID có thể tạo lại hồ sơ. Lỗi thuộc cơ chế đồng bộ trong hệ thống.

Con trỏ latestWarningRunId/latestWarningResultId của hồ sơ cũ không còn tìm thấy đợt/kết quả tương ứng. Tuy nhiên sourceWarningRunId/sourceWarningResultId lúc tạo **vẫn tồn tại** và xác định được HK02 (2025–2026). Mô tả trước đó “hồ sơ chưa liên kết được học kỳ” chỉ phản ánh con trỏ latest, chưa mô tả đầy đủ nguồn lúc tạo. Không có audit log đủ căn cứ khẳng định thao tác cụ thể nào đã xóa con trỏ đích.

Hai hồ sơ phải phân biệt lịch sử và nhu cầu xử lý hiện tại; không cộng thành hai sinh viên hiện tại. Biện pháp logic cần có: đối soát lại kỳ cũ không tạo lại hồ sơ sau một lần hoàn tất ở mốc bằng hoặc mới hơn; không lấy timestamp chạy lại thay cho thứ tự học kỳ; giữ lịch sử đã hoàn tất.

## 2. Đối chiếu 34 sinh viên chưa có kết quả HK2

- Roster nguồn có đủ 34 người, cùng mã CTĐT đang lưu; IsInClass=true cho cả 34.
- API bảng điểm cá nhân ALL/ALL theo mã CTĐT hiện tại có 949 lượt học. DB cũng có 949; đối chiếu mã môn/lớp học phần, tín chỉ, điểm 10/4/chữ/đặc biệt, IsPass và NotScore không có khác biệt.
- Cả 34 không có học phần HK02 (2025–2026) trong bảng điểm cá nhân; DB không có tổng kết học kỳ này theo CTĐT hiện tại. Đây là lý do kỹ thuật bộ đánh giá chưa tạo kết quả: điều kiện tham gia yêu cầu StudentTermSummary của kỳ và mã CTĐT.
- Endpoint bảng điểm lớp HK2 có dòng của cả 34 người. **33** người có STC/GPA null và Ranks=KXL. Không diễn giải KXL thành “bình thường” hoặc “GPA 0”.
- **2347A019 — Trương Xuân Thắng:** bảng điểm lớp HK2 có GPA4=0,64, GPA10=2,29, STC=14; bảng điểm cá nhân không có HK2 nhưng có HK3 năm 2025–2026 với GPA4=0,64/GPA10=2,29. Đã gọi lại bảng điểm lớp HK1/HK2/HK3 và bảng điểm cá nhân ALL/ALL; HK3 theo lớp lại null. Cả bucket ngoài và TermID từng học phần cá nhân đều ghi HK03. Dữ liệu hai endpoint chưa thống nhất về kỳ; cần xác minh, không tự chuyển điểm hè vào HK2.
- **2347B045 — Dương Minh Trung:** endpoint quyết định có QĐ 332/QÐ-ÐHÐL_03042026, ký 03/04/2026, “Nghỉ học tạm thời(HK2, 2025-2026 => HK2, 2026-2027) (Nghỉ 2 học kỳ)”. Đây là căn cứ trạng thái áp dụng đúng HK2; roster vẫn IsInClass=true nên chỉ dựa cờ thành viên lớp không đủ để xác định tham gia học kỳ.
- **2549C057 — Lưu Thị Phúc:** có QĐ 595/QÐ-ÐHÐL_27052026, ký 27/05/2026, nội dung nghỉ học tạm thời HK3 (2025–2026) và HK1 (2026–2027). Có tiếp nhận học lại theo QĐ 947/QÐ-ÐHÐL_23072026 ngày 23/07/2026, ghi HK1 (2026–2027). Các mốc trong quyết định không chứng minh việc nghỉ ở HK2 (2025–2026); không tự quy khoảng trống HK2 thành nghỉ học.
- **31 người còn lại:** API không trả học phần HK2, bảng điểm lớp không có điểm; endpoint quyết định chỉ có trúng tuyển/cảnh báo học vụ, không có quyết định nghỉ học/chuyển trường/bảo lưu giải thích khoảng trống. Chưa đủ căn cứ kết luận nghỉ học, không đăng ký hay lỗi nguồn chưa đồng bộ. Tính cả Lưu Thị Phúc là 32 người chưa có nguyên nhân nghiệp vụ được xác minh cho khoảng trống HK2.

Kiểm tra mã CTĐT khác cùng khóa: các truy vấn thành công không bổ sung học phần HK2. Có 36 truy vấn chuyên ngành K48 trả HTTP 502; **không** coi là phản hồi rỗng và không kết luận đã loại trừ mọi mã CTĐT. Kết luận 949 lượt khớp chỉ áp dụng truy vấn theo mã CTĐT hiện tại, đã khớp roster.

Không nên gộp cả 34 dưới một nguyên nhân nghiệp vụ “thiếu bảng điểm”: cần tách chưa có dữ liệu học kỳ, nguồn chưa nhất quán và nghỉ học tạm thời có quyết định. Việc bộ đánh giá chưa tạo kết quả không chứng minh các sinh viên không có nguy cơ.

## 3. Danh sách đầy đủ

| STT | MSSV | Họ tên | Lớp | Căn cứ/nhóm |
|---|---|---|---|---|
| 1 | 2347A019 | Trương Xuân Thắng | ITK47A | Bảng điểm lớp và cá nhân khác kỳ |
| 2 | 2347A036 | Đoàn Thị Bình | ITK47A | Chưa rõ nguyên nhân ở nguồn |
| 3 | 2347A065 | Trương Quang Tuấn | ITK47A | Chưa rõ nguyên nhân ở nguồn |
| 4 | 2347B045 | Dương Minh Trung | ITK47B | Nghỉ học tạm thời theo QĐ 332 |
| 5 | 2347B047 | Thái Anh Hạnh | ITK47B | Chưa rõ nguyên nhân ở nguồn |
| 6 | 2347C040 | Đỗ Thúy Tài | ITK47C | Chưa rõ nguyên nhân ở nguồn |
| 7 | 2347C046 | Lâm Tuấn Trang | ITK47C | Chưa rõ nguyên nhân ở nguồn |
| 8 | 2448A001 | Lý Ngọc Tùng | ITK48A | Chưa rõ nguyên nhân ở nguồn |
| 9 | 2448A009 | Trương Thị Hải | ITK48A | Chưa rõ nguyên nhân ở nguồn |
| 10 | 2448A010 | Đinh Xuân Tuấn | ITK48A | Chưa rõ nguyên nhân ở nguồn |
| 11 | 2448A024 | Vũ Thúy Sơn | ITK48A | Chưa rõ nguyên nhân ở nguồn |
| 12 | 2448A030 | Cao Xuân Chi | ITK48A | Chưa rõ nguyên nhân ở nguồn |
| 13 | 2448A051 | Hoàng Hoàng Việt | ITK48A | Chưa rõ nguyên nhân ở nguồn |
| 14 | 2448A056 | Hán Tuấn An | ITK48A | Chưa rõ nguyên nhân ở nguồn |
| 15 | 2448B004 | Lâm Thúy An | ITK48B | Chưa rõ nguyên nhân ở nguồn |
| 16 | 2448B022 | Trịnh Tuấn Khanh | ITK48B | Chưa rõ nguyên nhân ở nguồn |
| 17 | 2448B026 | Đoàn Mai Vỹ | ITK48B | Chưa rõ nguyên nhân ở nguồn |
| 18 | 2448B033 | Đoàn Đức Lâm | ITK48B | Chưa rõ nguyên nhân ở nguồn |
| 19 | 2448B048 | Cao Hoàng Phong | ITK48B | Chưa rõ nguyên nhân ở nguồn |
| 20 | 2549A010 | Trương Hương Lâm | ITK49A | Chưa rõ nguyên nhân ở nguồn |
| 21 | 2549A014 | Cheng Văn Hải | ITK49A | Chưa rõ nguyên nhân ở nguồn |
| 22 | 2549A038 | Cheng Đức Nghĩa | ITK49A | Chưa rõ nguyên nhân ở nguồn |
| 23 | 2549A053 | Đỗ Thị Bảo | ITK49A | Chưa rõ nguyên nhân ở nguồn |
| 24 | 2549A065 | Trọng Thị Minh | ITK49A | Chưa rõ nguyên nhân ở nguồn |
| 25 | 2549B008 | Đoàn Văn Nam | ITK49B | Chưa rõ nguyên nhân ở nguồn |
| 26 | 2549B020 | Phạm Tuấn Sơn | ITK49B | Chưa rõ nguyên nhân ở nguồn |
| 27 | 2549B025 | Phùng Thị Vỹ | ITK49B | Chưa rõ nguyên nhân ở nguồn |
| 28 | 2549B035 | Ngô Quang Bình | ITK49B | Chưa rõ nguyên nhân ở nguồn |
| 29 | 2549B062 | Bùi Thị Thanh | ITK49B | Chưa rõ nguyên nhân ở nguồn |
| 30 | 2549C036 | Hoàng Văn Nghĩa | ITK49C | Chưa rõ nguyên nhân ở nguồn |
| 31 | 2549C047 | Bùi Xuân Thắng | ITK49C | Chưa rõ nguyên nhân ở nguồn |
| 32 | 2549C057 | Lưu Thị Phúc | ITK49C | Có QĐ nghỉ từ HK3, chưa rõ thiếu HK2 |
| 33 | 2549C063 | Phan Hương Tài | ITK49C | Chưa rõ nguyên nhân ở nguồn |
| 34 | 2549C068 | Võ Hữu Huy | ITK49C | Chưa rõ nguyên nhân ở nguồn |

Theo lớp: ITK47A: 3; ITK47B: 2; ITK47C: 2; ITK48A: 7; ITK48B: 5; ITK49A: 5; ITK49B: 5; ITK49C: 5. Tổng 34.

## Nguồn kiểm tra

- [Tài liệu API bảng điểm cá nhân](https://kg8vuz7mh4.apidog.io/l%E1%BA%A5y-b%E1%BA%A3ng-%C4%91i%E1%BB%83m-chi-ti%E1%BA%BFt-c%E1%BB%A7a-sinh-vi%C3%AAn-42667625e0.md)
- [Tài liệu API bảng điểm theo lớp](https://kg8vuz7mh4.apidog.io/l%E1%BA%A5y-danh-s%C3%A1ch-%C4%91i%E1%BB%83m-h%E1%BB%8Dc-t%E1%BA%ADp-theo-l%E1%BB%9Bp-42667621e0.md)
- [Tài liệu API quyết định](https://kg8vuz7mh4.apidog.io/l%E1%BA%A5y-danh-s%C3%A1ch-quy%E1%BA%BFt-%C4%91%E1%BB%8Bnh-c%E1%BB%A7a-sinh-vi%C3%AAn-42667623e0.md)
- [Snapshot đối chiếu đã lược dữ liệu](warning-source-current-HK02-2025-2026-2026-10-09.json)
- [CSV 34 sinh viên, UTF-8 có BOM](warning-source-current-HK02-2025-2026-2026-10-09.csv)
