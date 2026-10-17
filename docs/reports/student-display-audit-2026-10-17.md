# Rà soát tính chính xác thông tin sinh viên — 17/10/2026

**Đã rà soát và sửa 9 nhóm vấn đề hiển thị/xử lý.** Phạm vi gồm hồ sơ, bảng điểm, GPA, rèn luyện, quyết định, miễn giảm học phí, đăng ký, tiến độ, cảnh báo, dự kiến tốt nghiệp, tổng quan và xuất hồ sơ.

Đối chiếu **625 hồ sơ, 31.141 lượt học và 3.456 tổng hợp học kỳ** trong dữ liệu API đã tiếp nhận. Không phát hiện chênh `isPass` giữa trường nguồn và trường đã chuẩn hóa; GPA cảnh báo của **622 sinh viên khớp nguồn, 0 chênh lệch**.

| Vấn đề | Đã sửa |
| --- | --- |
| **1. Bảng điểm dùng bảng đối chiếu CTĐT, gộp các lần học** | Hiển thị từng lượt theo **kỳ thực học**, giữ học lại/cải thiện, kỳ hè và môn ngoài CTĐT. Dữ liệu có 310 sinh viên với nhiều lượt cùng mã; lịch sử giờ có thể tra cứu đầy đủ. |
| **2. VT bị gắn F; kết quả chưa xác định có thể hiện Đạt** | Phân biệt Đạt, Không đạt, Chờ kết quả, Chưa xác định theo dữ liệu API. Giữ ký hiệu VT; không tự đổi thành F/0. API bảng điểm lấy lượt học của chính sinh viên, bỏ điều kiện phụ thuộc điểm của sinh viên khác. |
| **3. Chuyển/miễn chưa thống nhất giữa các phân hệ** | R được dùng trong tiến độ, hoàn thành và tốt nghiệp theo mốc tiếp nhận. Môn điều kiện miễn **M** đã đạt được ghi nhận trong góc nhìn hiện tại, ghi rõ không gán kỳ gốc; không đưa ngược vào kỳ lịch sử. Bảng điểm có mục nguồn riêng cho các bản ghi này. |
| **4. Trung bình rèn luyện các kỳ bị gọi là kết quả toàn khóa** | Gỡ điểm suy diễn khỏi trường kết quả rèn luyện toàn khóa của **622 kết quả tốt nghiệp hiện hành**. Trường này chỉ hiển thị kết quả được công nhận; giữ điểm từng kỳ để tra cứu. Đợt cũ vẫn lưu lịch sử, có giải thích khi mở. |
| **5. Tự ghép môn theo tên hoặc đuôi D** | Chỉ dùng mã và ánh xạ đã xác nhận. Không tự nâng tín chỉ nguồn. Môn đúng mã đã đạt không bị treo vì mã cũ trùng tên. Các kế hoạch chưa khớp mã được đánh dấu đối chiếu cấu hình. |
| **6. GPA và kỳ “có kết quả gần nhất” chưa rõ** | Chọn kỳ gần nhất thực sự có GPA và đúng CTĐT; giữ giá trị 0 hợp lệ. Tổng tích lũy hồ sơ/bảng điểm được chọn theo CTĐT hiện tại. Có 569 hồ sơ có kỳ mới chưa có GPA nhưng đã có GPA kỳ trước; không gọi kỳ chưa có GPA là kỳ có kết quả. |
| **7. Thiếu số liệu bị biến thành 0 TC; tự mặc định chuẩn 150 TC** | Hiển thị chưa xác định/chưa có định mức, chỉ tính tỷ lệ khi có đủ số liệu và quy tắc của đợt. Bỏ việc tự coi môn ngoài CTĐT là tự chọn 3 TC. |
| **8. Năm đào tạo gắn cứng theo khóa; đánh giá cũ có thể lấy đăng ký hiện tại** | Tính nhãn năm học theo **kỳ của đợt đánh giá**. Hoàn thành CTĐT dùng đăng ký đúng mốc đang xét. Học lại chờ kết quả giữ bằng chứng lần không đạt trước đó. |
| **9. Trạng thái chưa tải và hồ sơ PDF dễ gây hiểu nhầm** | Chưa tải được cảnh báo không hiện Bình thường. PDF lấy một kết quả chính thức mới nhất cho mỗi kỳ, có nhãn kỳ/trạng thái và dùng đối chiếu tiến độ hiện tại; không lặp các lần chạy thành nhiều cảnh báo. |

## Phần cấu hình đã đối chiếu và xử lý bổ sung

**Cập nhật sau rà soát:** đã xác minh các kế hoạch liên kết đúng ID học phần, nhưng mã lưu kèm thiếu `D`. Đã sửa 41 dòng trong 10 kế hoạch và tính lại các phạm vi bị ảnh hưởng; **378 kết quả hiện hành không còn vướng lỗi cấu hình**. Có 316 kết quả chờ điểm và 62 kết quả chậm tiến độ theo kỳ xét. Điểm/GPA nguồn và cảnh báo học tập không đổi. Xem [báo cáo đối chiếu cấu hình](plan-configuration-reconciliation-2026-10-17.md).

Các phát hiện dưới đây ghi nhận tình trạng **trước khi sửa cấu hình**:

**5 phạm vi kế hoạch, ảnh hưởng 378 kết quả ở HK01 2026–2027**, còn mã kế hoạch chưa khớp CTĐT:

| CTĐT | Điểm cần đối chiếu |
| --- | --- |
| CQ23CT-PM | `20CT4103` trong kế hoạch chưa khớp danh mục CTĐT. |
| CQ22CT-PM, CQ22CT-MMT | `20CT4201`, `20CT4202` trong kế hoạch; CTĐT dùng `20CT4201D`, `20CT4202D`. |
| CQ23CT-MMT | `20CT3220` trong kế hoạch; CTĐT dùng `20CT3220D`. |
| CQ24CT | `20CT3107`, `20CT3108` cần đối chiếu; phần tự chọn kỳ lộ trình 5 chưa khớp định mức 3 TC. |

Tại thời điểm rà soát ban đầu, hệ thống chuyển các kết quả này sang **Cần đối chiếu cấu hình**, tránh kết luận nợ môn/chậm tiến độ từ mã chưa khớp. Đối chiếu sau đó xác nhận đây là lỗi nhãn mã của cùng ID học phần, **không phải API thiếu dữ liệu hoặc trường hợp cần công nhận môn tương đương**; việc sửa đã hoàn tất theo báo cáo bổ sung ở trên.

## Kết quả kiểm tra

- Đã cập nhật **7 phạm vi tốt nghiệp** và **40 phạm vi hoàn thành CTĐT**; giữ các đợt cũ và định nghĩa quy tắc. Dấu vân tay 6 nhóm dữ liệu nguồn trước/sau không đổi.
- **445 test đạt**, 1 test bỏ qua theo cấu hình; TypeScript và build production đạt; lint 0 lỗi, 16 cảnh báo có sẵn.
- **118 kiểm tra API có xác thực đạt** qua backend/frontend trên 5 hồ sơ biên và các API tổng hợp; gồm xuất PDF. Kiểm tra render bảng điểm và smoke test đạt.
- Đã kiểm tra dữ liệu đang lưu và mã hiển thị; chưa gọi lại toàn bộ API bên ngoài hoặc thao tác kiểm thử trực quan trên trình duyệt. Không gửi thông báo tới sinh viên.

Bằng chứng: [dữ liệu trước sửa](student-display-audit-2026-10-17.json), [các đợt cập nhật](student-display-refresh-2026-10-17.json), [đối chiếu sau sửa và API](student-display-verification-2026-10-17.json).
