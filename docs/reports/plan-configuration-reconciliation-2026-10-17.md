# Đối chiếu và sửa cấu hình kế hoạch — 17/10/2026

**Đã xử lý xong 5 phạm vi từng báo “Cần đối chiếu cấu hình”, ảnh hưởng 378 kết quả HK01 2026–2027.**

Nguyên nhân nằm ở bước tạo kế hoạch của hệ thống: **ID học phần đã đúng**, nhưng mã lưu kèm thiếu chữ `D` so với danh mục và CTĐT. Ví dụ, cùng ID của `20CT4201D` lại được lưu nhãn `20CT4201`. Đã đối chiếu cả ID, tín chỉ, loại yêu cầu và học kỳ; không cần tạo ánh xạ tương đương giữa hai môn khác nhau.

## Những gì đã sửa

- Kiểm tra **12 kế hoạch chưa lưu trữ**, sửa **41 dòng trong 10 kế hoạch**: 5 kế hoạch kỳ hiện tại, 4 kế hoạch kỳ sau đã khóa và 1 bản nháp. Giữ nguyên tín chỉ, nhóm lựa chọn, yêu cầu đăng ký, học kỳ và trạng thái kích hoạt.
- Tạo phiên bản kế hoạch mới, giữ nguyên nội dung phiên bản cũ để tra cứu. Bản nháp vẫn là bản nháp; kế hoạch tương lai giữ đúng kỳ áp dụng.
- Sửa lỗi gốc ở script dựng kế hoạch. Khi tạo/sửa/sao chép, mã và tên được lấy theo ID học phần đã chọn; bước khóa chặn nhãn không khớp ID.
- Tính lại 5 đợt kiểm tra đăng ký, 5 phạm vi tiến độ/hoàn thành và 5 phạm vi dự kiến tốt nghiệp bị ảnh hưởng. Các đợt cũ được giữ lại.

## Kết quả sau sửa

| CTĐT | Tổng kết quả | Chờ kết quả học tập | Chậm tiến độ theo kỳ xét |
| --- | ---: | ---: | ---: |
| CQ23CT-PM | 116 | 102 | 14 |
| CQ22CT-PM | 84 | 70 | 14 |
| CQ23CT-MMT | 47 | 37 | 10 |
| CQ24CT | 111 | 88 | 23 |
| CQ22CT-MMT | 20 | 19 | 1 |
| **Tổng** | **378** | **316** | **62** |

**Không còn kết quả hiện hành nào vướng lỗi đối chiếu cấu hình này.** Việc sửa cấu hình không đồng nghĩa sinh viên tự động đạt: hệ thống tiếp tục phân biệt chờ điểm và phần chưa đáp ứng theo đúng kỳ xét.

Điểm, `isPass`, GPA, lịch sử học và CTĐT nguồn không đổi; đối chiếu dấu vân tay **9 nhóm dữ liệu nguồn** trước/sau khớp hoàn toàn. Toàn bộ kết quả cảnh báo học tập được giữ nguyên; GPA của 378 kết quả tính lại và kết luận dự kiến tốt nghiệp không thay đổi. Trường hợp chuyển ngành `2246B045` vẫn đối chiếu sẵn sàng và thiếu ròng 2 TC; không thêm công nhận tương đương cho các môn trùng tên.

## Kiểm tra

**449 test đạt**, 1 test bỏ qua theo cấu hình; TypeScript, build production và smoke test đạt. Lint 0 lỗi, 16 cảnh báo có sẵn. **100 kiểm tra API có xác thực đạt** qua backend và frontend, kiểm tra đủ 378 kết quả trên mỗi phía, cả kế hoạch mới/lịch sử và các hồ sơ chuyển ngành, công nhận R, miễn M. Chạy lại đối chiếu: **0 dòng cần sửa, 0 vướng mắc**. Chưa kiểm thử thao tác trực quan trên trình duyệt trong đợt này.

Bằng chứng: [các phiên bản và thay đổi](plan-configuration-reconciliation-applied-2026-10-17.json), [kết quả tính lại](plan-configuration-reconciliation-results-2026-10-17.json), [kiểm tra API](plan-configuration-reconciliation-verification-2026-10-17.json), [đối chiếu lại sau sửa](plan-configuration-reconciliation-plan-2026-10-17.json).
