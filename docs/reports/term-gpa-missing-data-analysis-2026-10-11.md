# Phân tích tiêu chí GPA học kỳ chưa đánh giá được

Rà soát dữ liệu đã lưu cho HKII 2025–2026: 47/622 kết quả có tiêu chí `QD600_TERM_GPA` ở trạng thái `NOT_EVALUATED`. Trong đó 46 người có GPA nguồn trống; một người đã có GPA3,00 nhưng chưa xác định được học kỳ chính đầu tiên để chọn ngưỡng. Lần rà soát chỉ đọc dữ liệu và lập báo cáo; không thay đổi mã chức năng, điểm hoặc kết quả đánh giá.

| Trường hợp | Số sinh viên | Nguyên nhân và hướng xử lý |
| --- | ---: | --- |
| Thiếu bảng tổng hợp kỳ xét | 33 | Không có bảng tổng hợp của HKII 2025–2026 và không có môn học thuật đăng ký trong kỳ. Đối chiếu đăng ký, tình trạng sinh viên và lỗi nguồn; không tự gán GPA0. Đây là 33 người còn lại trong nhóm34 trước đây; Dương Minh Trung đã nghỉ hợp lệ và được loại khỏi đánh giá. |
| Toàn bộ môn học thuật VT | 11 | Nguồn có bảng tổng hợp nhưng `TB_HK_4` và `TB_HK_10` trống; mỗi môn học thuật chỉ có VT, không có điểm hệ4. Hệ thống đã dùng VT làm kết quả không đạt, nhưng không tự ghi GPA0. Cần xác nhận cách nguồn tổng hợp GPA của kỳ chỉ có VT; nếu tự tính phải có quy tắc rõ và tách giá trị tính khỏi GPA chính thức nguồn. |
| Chỉ có SHCD0 tín chỉ | 2 | Trịnh Minh Thiện2246B029 và Hà Thị Trung2347A049 chỉ có SHCD-CD1/CD2/CD3, tổng đăng ký học thuật0 TC. Không có mẫu số tín chỉ để tính GPA học thuật. Nên trình bày là không phát sinh GPA do không có học phần học thuật, thay vì nói chỉ có VT. Vẫn đối chiếu việc không đăng ký học thuật. |
| Chưa xác định học kỳ đầu | 1 | Hoàng Xuân Nghĩa2347A048 đã có GPA hệ4=3,00 và hệ10=7,68 của HKII 2025–2026; sáu môn có điểm số. Bị chặn bởi `FIRST_MAIN_SEMESTER_UNRESOLVED`, không phải thiếu GPA. Nghĩa chuyển trường đến, thiếu dữ liệu kỳ đầu năm nhập học của khóa ở trường này. Cần dùng lịch sử tiếp nhận/chuyển trường và các kỳ học trước để xác định kỳ đầu theo phạm vi đúng. |

## Danh sách chỉ có VT

| MSSV | Sinh viên | Số môn học thuật ghi VT / tổng số |
| --- | --- | ---: |
| 2246A050 | Vương Quang Thông | 6/6 |
| 2246B008 | Võ Kim Phúc | 7/7 |
| 2347A054 | Phạm Hương Tân | 6/6 |
| 2347A057 | Phạm Thị Quang | 6/6 |
| 2347C044 | Cheng Ngọc Việt | 5/5 |
| 2448A021 | Nguyễn Tuấn Bình | 6/6 |
| 2448A027 | Lưu Văn Cường | 5/5 |
| 2448A028 | Cao Mai Thiện | 5/5 |
| 2448A036 | Hán Tuấn Mạnh | 6/6 |
| 2448B030 | Phạm Văn Kiên | 5/5 |
| 2549B030 | Võ Thị Đức | 4/4 |

## Những vấn đề trong cách xử lý hiện tại

1. `evaluateTermGpa` sử dụng GPA từ bảng tổng hợp đúng kỳ/chương trình; không tính thay từ các môn. Nguồn để trống thì tiêu chí GPA chưa đánh giá, dù VT đã đủ để đánh giá tín chỉ không đạt.
2. Kiểm tra học kỳ đầu diễn ra trước kiểm tra giá trị GPA. Sinh viên chuyển trường có thể bị chặn dù đã có GPA hợp lệ, như Hoàng Xuân Nghĩa. Bộ tìm kỳ đầu hiện yêu cầu bảng tổng hợp HKI trong năm nhập học của khóa.
3. Thông báo thiếu GPA dùng một lời giải thích chung về VT/thiếu điểm. Nó chưa phân biệt thiếu cả bảng tổng hợp với không có môn học thuật. Không thể suy từ lời giải thích đó rằng mọi sinh viên đều vắng thi.
4. Hai sinh viên chỉ có SHCD nên dùng trạng thái không phát sinh GPA, đồng thời giữ tín hiệu cần xác minh đăng ký. Thiếu bảng tổng hợp và thiếu phân loại học kỳ đầu cần có hướng xử lý khác.

Trong kỳ này không thấy nhóm có bảng tổng hợp GPA trống nhưng có môn học thuật chờ điểm, hoặc có điểm số hệ4 mà thiếu GPA tổng hợp, ngoại trừ trường hợp Nghĩa đã có GPA và bị chặn bởi phân loại kỳ đầu.

Danh sách đủ47 người, lớp, CTĐT và chi tiết từng môn nằm trong [báo cáo dữ liệu](term-gpa-missing-data-2026-10-11.md). [JSON](term-gpa-missing-data-2026-10-11.json) lưu mã nguyên nhân và trường GPA nguồn để đối chiếu.
