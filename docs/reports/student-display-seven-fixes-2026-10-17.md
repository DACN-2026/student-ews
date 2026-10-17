# Đã sửa 7 điểm hiển thị thông tin sinh viên — 17/10/2026

**Đã xử lý cả 7 phát hiện của đợt rà soát trước. Không thay đổi dữ liệu API nguồn, điểm, `isPass`, GPA hoặc lịch sử học.** Các sửa đổi tập trung vào chọn đúng kết quả, đúng mốc đánh giá và diễn đạt đúng ý nghĩa dữ liệu.

| Điểm đã sửa | Kết quả kiểm tra |
| --- | --- |
| **1. Hồ sơ và xuất báo cáo chọn lẫn đợt dự kiến tốt nghiệp** | Chỉ lấy đợt tiến độ chuẩn đã hoàn tất, đang áp dụng; chọn theo kỳ đánh giá thay vì thời điểm chạy lại. Hiện rõ kỳ nguồn trong hồ sơ và thêm kỳ vào báo cáo xuất. **616 hồ sơ và 616 dòng Excel khớp đợt chuẩn**, gồm 435 trường hợp chờ kết quả; 316 trường hợp từng bị hiển thị thành chậm đã được trả về đúng trạng thái. |
| **2. Dashboard lấy tiến độ hiện tại cho kỳ quá khứ** | Truyền kỳ và mốc cuối kỳ vào bộ đối chiếu lịch sử; tách bộ nhớ đệm theo mốc, giới hạn bằng chứng học tập/công nhận đến kỳ xét, loại khóa chưa nhập học theo tên khóa nguồn. HK02 2024–2025 chỉ có **383 hồ sơ đối chiếu**, không còn K49. |
| **3. Chưa xác định bị tính vào chậm** | Giữ riêng nhóm cần đối soát và hiển thị trên biểu đồ. Dashboard hiện tại: **300 đáp ứng, 321 chậm, 1 cần đối soát**. `2347A048` vẫn cần đối chiếu học phần; không tự công nhận tương đương hoặc tự chuyển thành chậm. |
| **4. VT bị gọi là điểm F** | Nhãn, danh sách cần xử lý và lời khuyên giữ VT. Chỉ gọi F khi ký hiệu nguồn thực sự là F. Đối chiếu **779 học phần của 180 sinh viên**; `isPass` vẫn quyết định kết quả đạt/chưa đạt. VT hướng đến xác nhận phương án thi, không tự buộc học lại cả môn. |
| **5. Phương án tự chọn bị gọi là nợ môn** | **878 dòng** hiện là môn lựa chọn chưa tích lũy, không gắn nhãn nợ từng môn. Tách chờ kết quả, chưa đến hạn và chưa hoàn thành yêu cầu; phần thiếu tín chỉ vẫn được xét theo nhóm và định mức hiện có. |
| **6. Vừa đúng tiến độ vừa “Chậm X TC”** | Đổi nhãn thành **“Đáp ứng yêu cầu đến mốc”** và **“Thấp hơn/cao hơn kế hoạch”**, có giải thích hai phép so sánh. Giữ nguyên số liệu của **10 trường hợp**. `2246B045` vẫn chênh −2 TC so với kế hoạch nhưng không bị diễn giải thành khoản nợ đã xác nhận. |
| **7. Đã rời lớp vẫn hiện Bình thường** | Không mặc định xanh khi chưa có đánh giá; danh sách ghi **“Đã ngừng theo dõi”** cho 2 hồ sơ đã rời lớp. Lịch sử và cơ chế chặn hỗ trợ mới được giữ nguyên. |

## Kiểm tra tính đúng theo kỳ

| Mốc trên dashboard | Hồ sơ đối chiếu | Đáp ứng yêu cầu | Chậm | Cần đối soát |
| --- | ---: | ---: | ---: | ---: |
| Trước HK01 2026–2027 | 622 | 300 | 321 | 1 |
| Đến hết HK02 2025–2026 | 622 | 294 | 328 | 0 |
| Đến hết HK02 2024–2025 | 383 | 199 | 184 | 0 |

Dashboard và bảng tiến độ chuẩn có **mốc đối chiếu khác nhau**: dashboard kỳ hiện tại xét yêu cầu trước kỳ đang học; đợt chuẩn có thể bao gồm học phần của kỳ đang chờ điểm. Giao diện ghi rõ căn cứ và mốc; không ép hai loại kết quả thành một trạng thái.

## Kiểm chứng

- **455 test đạt**, 1 test bỏ qua theo cấu hình. TypeScript và build production đạt; lint 0 lỗi, 16 cảnh báo có sẵn.
- **62 kiểm tra API có xác thực đạt** qua backend và frontend; kiểm tra cả kỳ lịch sử, hồ sơ chuyển ngành, nghỉ tạm thời, miễn M, nhóm cần đối soát và chi tiết tiến độ.
- Kiểm tra dịch vụ dự kiến tốt nghiệp của **622 sinh viên**; kiểm tra render phần cần xử lý VT, bảng học phần bắt buộc và màn hình chênh lệch kế hoạch đạt. Smoke test đạt. Chưa kiểm thử thao tác trực quan trên trình duyệt trong đợt này.
- Dấu vân tay **9 nhóm dữ liệu nguồn** trước/sau khớp hoàn toàn. Không cần sửa bản ghi hoặc tính lại các đợt đã lưu để áp dụng các sửa đổi này; các màn hình đọc đúng nguồn và diễn đạt lại dữ liệu hiện có.

Bằng chứng: [đối chiếu dữ liệu và API sau sửa](student-display-seven-fixes-verification-2026-10-17.json). Báo cáo phát hiện ban đầu: [7 điểm cần sửa](student-display-readonly-audit-2026-10-17.md).
