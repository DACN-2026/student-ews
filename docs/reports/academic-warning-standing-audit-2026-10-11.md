# Rà soát dữ liệu cảnh báo học tập — 11/10/2026

Báo cáo này ghi nhận đợt rà soát trước bản sửa nguồn v15. Kết quả sau đối chiếu toàn bộ API và sửa trạng thái điểm xem tại [báo cáo chất lượng dữ liệu nguồn](warning-source-quality-2026-10-11.md). Các số liệu độ phủ bên dưới thuộc thời điểm trước sửa; phân mức và kết luận nhóm 34 sinh viên vẫn được giữ.

Đã rà soát 625 hồ sơ sinh viên, 912 bản ghi quyết định và kết quả cảnh báo HKII 2025–2026. Có 624 sinh viên đang trong lớp thuộc 7 nhóm khóa/chương trình cấu hình. Sau sửa và tính lại, 622 sinh viên được phân tích; 1 sinh viên nghỉ hợp lệ và 1 sinh viên đã thôi học được loại.

## Quyết định nghỉ học, tiếp nhận trở lại và thôi học

Nguồn có 6 bản ghi mang tên “Nghỉ học tạm thời”: 5 chưa có chỉ dấu xóa/hủy và 1 đã bị xóa. Có 4 quyết định tiếp nhận học lại và 1 quyết định thôi học. Chưa thấy bản ghi có tên riêng “bảo lưu” hoặc “tạm hoãn chương trình” trong bộ dữ liệu này. Quyết định nghỉ trong quá khứ không có nghĩa sinh viên được miễn theo dõi mọi kỳ sau đó.

| Sinh viên | Quyết định từ nguồn | Đối chiếu HKII 2025–2026 và kỳ hiện tại |
| --- | --- | --- |
| 2347B045 — Dương Minh Trung | 332, ký 03/04/2026: nghỉ từ HKII 2025–2026 → HKII 2026–2027, ghi “nghỉ 2 học kỳ” | Miễn vắng dữ liệu HKII 2025–2026 và HKI 2026–2027. Mốc HKII 2026–2027 cần đối chiếu văn bản trước khi xác nhận bao phủ. |
| 2549A044 — Bùi Lan Phong | 230, ký 19/03/2026: xin thôi học | Loại khỏi phân tích từ HKII 2025–2026. Cờ đang trong lớp ở hồ sơ vẫn là true; cần đồng bộ trạng thái hồ sơ tại nguồn, nhưng cảnh báo đã dùng quyết định để loại. |
| 2549C057 — Lưu Thị Phúc | 595, ký 27/05/2026: nghỉ HKIII 2025–2026 và HKI 2026–2027; 947, ký 23/07/2026: tiếp nhận học lại | Quyết định nghỉ được ghi nhận ở HKII nhưng **không bao phủ HKII**. Thiếu dữ liệu HKII nên cần ưu tiên xác minh. Đã được tiếp nhận trở lại và có đăng ký HKI 2026–2027, tiếp tục theo dõi kỳ hiện tại. |
| 2347B037 — Hồ Kim Long | 121, ký 22/02/2024: nghỉ HKII 2023–2024 đến hết HKI 2025–2026; 265, ký 30/03/2026: tiếp nhận học lại | Tiếp tục phân tích HKII 2025–2026, có kết quả học tập và mức nguy cơ cao. HKI 2026–2027 chưa ghi nhận đăng ký: cần liên hệ/xác minh, không tự kéo dài quyết định nghỉ cũ. |
| 2347C029 — Cao Văn Linh | 1220, ký 07/10/2024: nghỉ năm học 2024–2025; 1045, ký 06/08/2025: tiếp nhận học lại | Tiếp tục theo dõi; HKII 2025–2026 mức bình thường. Kỳ hiện tại có đăng ký. |
| 2347A016 — Vũ Anh Tân | 579, ký 23/05/2024: nghỉ 2 học kỳ, chưa ghi rõ khoảng kỳ; 647, ký 11/06/2024: tiếp nhận học lại | Không kéo dài miễn theo dõi từ quyết định nghỉ cũ. HKII 2025–2026 mức cần chú ý; kỳ hiện tại có đăng ký. |
| 2347C017 — Lâm Thị Tiến | 931, ký 08/08/2023: nội dung “[Xóa quyết định…]” | Không dùng bản ghi đã xóa để miễn phân tích; vẫn theo dõi. |

Hai bản ghi “Tiếp nhận Chuyển trường” là chuyển **đến**, không được hiểu thành rời chương trình. Sinh viên 2347A048 tiếp tục thuộc phạm vi; 2347A052 không thuộc danh sách đang trong lớp. Không sửa cờ hồ sơ nguồn hoặc tự ban hành quyết định trong đợt rà soát này.

## Đính chính nhóm 34 sinh viên thiếu dữ liệu

Kết quả trước đây “32 nguy cơ cao, 2 nghỉ hợp lệ” đã loại nhầm Lưu Thị Phúc theo kỳ ghi nhận của quyết định. Kết quả đúng sau đối chiếu nội dung là **33 nguy cơ cao và 1 nghỉ hợp lệ (Dương Minh Trung)**. Có 33 hồ sơ ưu tiên hỗ trợ đang mở, liên kết với kết quả mới. GPA thiếu được giữ null.

Đối chiếu trực tiếp API nguồn trong đợt này: quyết định của 13 sinh viên cần rà soát khớp dữ liệu đang lưu; bảng điểm cá nhân của cả 34 sinh viên vẫn không có học phần HKII 2025–2026 đúng chương trình hiện tại. Không có bản ghi không đồng nghĩa đã xác nhận 0 đăng ký: bằng chứng vẫn là `UNVERIFIED`, cần xác minh với sinh viên và đơn vị quản lý.

## Chất lượng dữ liệu dùng cho cảnh báo

Đã sửa ba vấn đề: đọc kỳ hiệu lực trong nội dung trước kỳ ghi nhận; nhận diện 171 quyết định cảnh báo có tiêu đề trong nội dung dù loại chung là “Quyết định khác”, tách kỳ cảnh báo và cứu xét; bỏ qua 5 bản ghi có chỉ dấu xóa/hủy và chặn lưu xác minh những bản ghi này. Không thay các ngưỡng GPA, nợ tín chỉ và chậm tiến độ đang cấu hình.

| Kiểm tra sau tính lại | Kết quả |
| --- | --- |
| GPA kỳ, GPA tích lũy, tín chỉ đăng ký/không đạt, bằng chứng nợ, thiếu tiến độ, số kỳ cảnh báo chính thức và phạm vi loại trừ | Không phát hiện chênh lệch giữa nguồn DB hiện tại và kết quả mới trong các phép đối chiếu này |
| Phân mức nội bộ | 179 nguy cơ cao; 110 cần chú ý; 333 bình thường |
| Độ phủ các tiêu chí học vụ đang triển khai | 570 đầy đủ; 51 một phần; 1 không đủ. Không đồng nghĩa đã triển khai toàn bộ QĐ600 |
| GPA kỳ chưa có | 46/622: 33 thiếu tổng hợp và 13 có tổng hợp nhưng chưa có GPA hệ 4 |
| Bằng chứng nợ học phần | 615 đầy đủ; 7 một phần do học phần lịch sử chưa rõ kết quả hoặc chưa gắn được phạm vi |
| Tiến độ CTĐT | 621 đầy đủ; 1 một phần do còn kết quả cần xác minh |
| Rèn luyện và xu hướng điểm | Tín hiệu bổ sung hiện chưa bật; chưa cấu hình mã trạng thái công nhận rèn luyện. Chưa thể nói phân mức hiện tại phản ánh đầy đủ rèn luyện hoặc xu hướng giảm điểm |

**Mâu thuẫn nguồn cần ưu tiên:** 2347A019 — Trương Xuân Thắng. API bảng điểm lớp ITK47A khi yêu cầu HKII 2025–2026 trả GPA 0,64 và STC 14; API bảng điểm cá nhân không có HKII, ghi GPA 0,64 ở HKIII. Giữ kỳ của bảng điểm cá nhân và yêu cầu đối chiếu nguồn; không tự chuyển điểm HKIII sang HKII hoặc lấy GPA 0,64 để lấp dữ liệu thiếu. Sinh viên đang ở nhóm ưu tiên xác minh.

Danh sách 7 trường hợp nợ một phần: 2448A025, 2347A065, 2347A009, 2347A048, 2549A055, 2246A041, 2246B045. Trường hợp tiến độ một phần: 2246B008 — Võ Kim Phúc. Chi tiết bằng chứng và 13 trường hợp chưa có GPA nằm trong tệp kiểm tra DB bên dưới.

Các nguồn đã được dùng nhất quán hơn sau sửa, nhưng còn thiếu và có mâu thuẫn cần giải quyết. Danh sách bình thường chỉ phản ánh tiêu chí đánh giá được. Chưa tự xác định hạn đào tạo tối đa khi hồ sơ chưa đủ căn cứ, và không suy mọi loại nghỉ đều được trừ khỏi thời gian đào tạo.

## Việc GVCN/CVHT cần xử lý

1. Liên hệ 33 sinh viên thiếu dữ liệu, xác minh đã đăng ký/chưa học, lý do, chương trình và quyết định nghỉ nếu có; ưu tiên 2347A019 và 2549C057.
2. Đối chiếu mốc kết thúc quyết định 332 của Dương Minh Trung; cập nhật trạng thái thôi học của Bùi Lan Phong tại nguồn; xác minh đăng ký kỳ hiện tại của Hồ Kim Long.
3. Kiểm tra 13 trường hợp chưa có GPA, 7 trường hợp nợ một phần và 1 trường hợp tiến độ một phần trước khi dùng số liệu để kết luận học vụ.
4. Nếu muốn cảnh báo dùng rèn luyện, xác nhận mã trạng thái được công nhận và bật ngưỡng đã được đơn vị phụ trách thống nhất trong cấu hình.

## Bằng chứng và kiểm thử

Đã tính lại thành công 7/7 nhóm HKII 2025–2026 bằng engine v14, giữ các lần chạy cũ và đồng bộ hồ sơ hỗ trợ. Backend: 326 kiểm thử đạt, 1 bỏ qua; frontend: 20 đạt. Kiểm tra kiểu dữ liệu cả hai ứng dụng đạt; lint không có lỗi, còn cảnh báo có sẵn.

- [Đối chiếu DB và kết quả cảnh báo](academic-warning-standing-audit-before-source-repair-2026-10-11.json): danh sách thiếu dữ liệu, quyết định, hiệu lực kỳ hiện tại, dữ liệu chưa đầy đủ và phép đối chiếu.
- [Đối chiếu API nguồn](academic-warning-source-recheck-2026-10-11.json): 13 hồ sơ quyết định, 34 bảng điểm cá nhân và mâu thuẫn của 2347A019. Đây là phạm vi kiểm tra trực tiếp API, không phải xác minh mới toàn bộ 625 bảng điểm.

Chạy lại kiểm tra chỉ đọc từ thư mục `apps/backend`:

```powershell
node --env-file=.env.local -r ./scripts/node-test-shim.cjs --import tsx scripts/audit-academic-warning-standing.ts
```

Có thể chỉ định `--term=<id-kỳ>`; mỗi lần kiểm tra ghi báo cáo JSON theo ngày Việt Nam. Script không tạo quyết định, không tính lại cảnh báo và không cập nhật DB.
