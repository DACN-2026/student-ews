# Kế hoạch đào tạo năm học 2026–2027

Nguồn: `2026-Ke-hoach-giang-day-nh-26-27 (1).pdf`, trang 2–7. Trang 1 là K50 (năm nhất), không có dữ liệu sinh viên tương ứng nên không lập kế hoạch.

| Khóa | Học kỳ năm học | Học kỳ lộ trình | CTĐT / chuyên ngành | Tín chỉ tự chọn tối thiểu | Trạng thái |
| --- | --- | ---: | --- | ---: | --- |
| K49 | HK01 | 3 | CQ25CT | 6 đại cương + 1 GDTC 3 | Đã khóa |
| K49 | HK02 | 4 | CQ25CT | 3 đại cương | Đã khóa |
| K48 | HK01 | 5 | CQ24CT (chung) | 3 | Đã khóa |
| K48 | HK02 | 6 | CQ24CT-MMT | 3 bổ trợ + 4 chuyên ngành | Dự thảo |
| K48 | HK02 | 6 | CQ24CT-PM | 3 bổ trợ + 6 chuyên ngành | Dự thảo |
| K48 | HK02 | 6 | CQ24CT-KHDL | 3 bổ trợ + 3 chuyên ngành | Dự thảo |
| K47 | HK01 | 7 | CQ23CT-MMT, CQ23CT-PM | 9 mỗi chuyên ngành | Đã khóa |
| K47 | HK02 | 8 | CQ23CT-MMT, CQ23CT-PM | 12 mỗi chuyên ngành | Đã khóa |
| K46 | HK01 | 9 | CQ22CT-MMT, CQ22CT-PM | 0 | Đã khóa, cuối CTĐT |

Các nhóm lựa chọn lưu theo dạng `TÊN_NHÓM:SỐ_TC_TỐI_THIỂU`. Bộ tính tiến độ kiểm tra mức tối thiểu của từng nhóm, ngoài tổng tín chỉ tự chọn. Vì vậy K49 phải chọn một học phần GDTC 3, dù đã đủ tín chỉ đại cương.

K48 hiện có 111 sinh viên cùng mã `CQ24CT` và chưa có dữ liệu chuyên ngành. Ba kế hoạch HK02 được tạo ở CTĐT riêng, ở trạng thái dự thảo để tránh áp sai cho sinh viên. K47 còn 8 sinh viên mang mã CTĐT chung `CQ23CT`; PDF chỉ có kế hoạch cho hai chuyên ngành MMT và PM. Cần xác định chuyên ngành của các sinh viên này trước khi gắn kế hoạch tương ứng. Lớp học không thể dùng để suy ra chuyên ngành vì một lớp có nhiều mã CTĐT.

34 kế hoạch trước đây được chuyển sang `archived`, không xuất hiện trong danh sách chính. Các lần tính tiến độ cũ vẫn được giữ để truy vết. Bản sao dữ liệu kế hoạch trước thay đổi nằm tại `backups/training-plans-before-2026-2027.json`.

Chạy `node apps/backend/scripts/rebuild-2026-2027-plans.cjs` để kiểm tra danh sách học phần và chạy thêm `--apply` để ghi; lệnh ghi có thể chạy lại mà không tạo trùng kế hoạch.
