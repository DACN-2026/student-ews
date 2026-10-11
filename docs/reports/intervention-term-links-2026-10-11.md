# Đối chiếu 289 sinh viên có nguy cơ và 62 hồ sơ — 11/10/2026

Đã xác nhận lỗi đồng bộ liên kết học kỳ, không phải chỉ 62 sinh viên cần hỗ trợ. Báo cáo HKII 2025–2026 có 289 sinh viên có nguy cơ (179 nguy cơ cao, 110 cần chú ý), cả 289 đều đã có hồ sơ đang mở. Khi tính lại các kỳ cũ, hệ thống dùng thời điểm hoàn tất lần chạy để chọn kết quả hiện hành, khiến 229 hồ sơ đang mở của nhóm này bị chuyển về kỳ trước. Bảng can thiệp HKII vì vậy chỉ đếm 60 hồ sơ đang mở và 2 đã hoàn tất.

## Sửa và áp dụng

Đồng bộ ưu tiên thứ tự học kỳ trước thời điểm chạy lại. Trong cùng một kỳ vẫn ưu tiên run mới hơn. Run của kỳ cũ không được ghi đè liên kết/mức nguy cơ kỳ mới hoặc tạo thêm đợt sau khi hồ sơ kỳ sau đã hoàn tất. Hồ sơ hiện hành có thể được sửa về đúng kỳ mới ngay cả khi run kỳ mới hoàn tất trước lần tính lại kỳ cũ.

Đã dùng lại 7 run OFFICIAL mới nhất của HKII, không tính lại điểm hoặc thay đổi ngưỡng. Có 268 hồ sơ được cập nhật liên kết/mức nguy cơ hiện hành, gồm 229 hồ sơ nguy cơ bị lùi kỳ và 39 hồ sơ khác cần đối chiếu kết quả mới. Không tạo hồ sơ mới. Các hồ sơ không còn nguy cơ vẫn được giữ để tra cứu và không tự hoàn tất trạng thái hỗ trợ.

| Đối chiếu HKII sau sửa | Kết quả |
| --- | --- |
| Sinh viên có nguy cơ | 289 |
| Sinh viên có hồ sơ trong kỳ | 289 |
| Hồ sơ đang mở | 289 |
| Hồ sơ đã hoàn tất từ đợt trước của hai sinh viên trong nhóm | 2 |
| Tổng hồ sơ trong kỳ | 291 |
| Hồ sơ được giữ nguyên | 336 |
| Sự kiện lịch sử được giữ nguyên | 10.311 |
| Sự kiện hệ thống bổ sung | 51 |
| Đồng bộ lặp 7 run | 0 tạo mới, 0 cập nhật |
| Chạy lại 4 run kỳ cũ từng gây lùi liên kết | 0 tạo mới, 0 cập nhật; số liệu HKII giữ nguyên |

Đã đối chiếu tập ID của 289 sinh viên có nguy cơ với tập ID sinh viên có hồ sơ OPEN trong kỳ: khớp hoàn toàn. Trạng thái xử lý, ghi chú, phân công, lịch hẹn, căn cứ tạo hồ sơ và lịch sử trước sửa đều giữ nguyên. Có audit `academic_warning.intervention_links.repair`; chi tiết trước/sau tại [tệp đối chiếu](intervention-term-links-2026-10-11.json).

Kiểm thử backend: 343 test, 342 đạt, 1 bỏ qua; TypeScript và build backend đạt. Có kiểm thử riêng việc tính lại kỳ cũ, sửa liên kết bị lùi, bảo vệ hồ sơ đã hoàn tất và bảo vệ kết quả mới trong cùng kỳ. Backend cục bộ đã khởi động lại với bản sửa. Không kiểm tra giao diện trực quan bằng trình duyệt trong đợt này.
