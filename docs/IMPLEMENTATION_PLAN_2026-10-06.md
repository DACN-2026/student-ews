# Phương án sửa sau rà soát dữ liệu và chốt nghiệp vụ

## Quy ước đã chốt

- Phạm vi K46–K49; không thêm K50. Giữ cấu hình năm học/học kỳ hiện tại vốn chính xác.
- CTĐT K44 là chuẩn áp dụng từ K44 đến nay: 150 TC học thuật, 104 bắt buộc, 46 tự chọn, đúng yêu cầu khối/nhóm, không cộng GDQP/GDTC/SHCD vào 150.
- Ngoại ngữ xử lý ngoài hệ thống.
- VT là chưa đạt, chưa hoàn thành, không tích lũy; không phải pending.
- F ở kỳ chính rồi D ở hè: công nhận học phần/tín chỉ từ lần đạt, giữ F và cảnh báo tại mốc cũ.
- Chuyên ngành bắt đầu HK2 năm 3; mã chung trước mốc đó là bình thường.
- **Mới chốt:** đạt toàn bộ học phần GDQP và đủ 3 TC GDTC được công nhận thì đạt hai mục chứng chỉ tương ứng trong Dự kiến tốt nghiệp. Không bắt buộc có bản ghi chứng chỉ bên ngoài để công nhận trường hợp này.

Logic và các sửa dữ liệu có căn cứ đã được triển khai ngày 07/10/2026. Xem [kết quả và kiểm chứng](IMPLEMENTATION_RESULTS_2026-10-07.md). Theo yêu cầu giữ nguyên giao diện sau đó của người dùng, các đề xuất thêm bảng/tóm tắt/liên hệ/chế độ hiển thị mới bên dưới không thuộc lần triển khai này.

## 1. Phân định nguồn và tạo bộ cấu hình có phiên bản

| Nguồn | Mục đích |
| --- | --- |
| [CTĐT K44](2020_CTDT_K44.pdf) | Tổng/bắt buộc/tự chọn, khối kiến thức, yêu cầu học phần và nhóm tốt nghiệp |
| [Kế hoạch giảng dạy 2026–2027](<2026-Ke-hoach-giang-day-nh-26-27 (1).pdf>) | Môn/nhóm lựa chọn mở theo khóa, chuyên ngành và kỳ trong năm học |
| [QĐ600](Quyet-dinh-so-600-QD-DHDL-ve-viec-ban-hanh-Quy-che-dao-tao-trinh-do-dai-hoc-cua-Truong-Dai-hoc-Da-Lat-VER1.pdf) | Quy tắc cảnh báo, GPA và mốc đánh giá |
| [API](https://kg8vuz7mh4.apidog.io/) | Hồ sơ, lượt đăng ký/điểm, rèn luyện, quyết định và mã môn thực tế |
| Xác nhận người dùng | Phạm vi áp CTĐT, ngoại ngữ, chứng chỉ từ điểm, VT/hè và thời điểm phân ngành |

Tạo rule pack K44 áp dụng cho các chương trình hiện có, có nguồn và phiên bản; resolver kế thừa chuẩn chung khi không có override hợp lệ. Thiếu/xung đột vẫn được báo rõ, không có fallback 145 và không đoán ngưỡng từ tổng danh sách tự chọn.

Cấu hình yêu cầu theo khối CTĐT, gồm tổng 150/104/46; các mức tự chọn A6=9, A7=6, B2=25, B3=6. Danh mục/mapping phải xác định môn thuộc đúng nhóm. Môn thừa nhóm này không bù nhóm khác; tín chỉ thừa hiển thị riêng. Dùng GPA tối thiểu 2,0 cho tốt nghiệp theo QĐ600 và chuẩn đang áp dụng. Không tự đặt ngưỡng rèn luyện mới khi chưa có căn cứ; sửa độ bao phủ và nhãn đang không thống nhất.

Kế hoạch năm học không thay toàn bộ cấu trúc CTĐT hoặc định mức các năm trước. Đối chiếu chênh lệch kế hoạch/CTĐT bằng phiên bản và mapping, không lấy HK1 của K50 làm HK1 lịch sử của mọi khóa.

## 2. Sửa danh mục và bảo toàn từng lượt học

Tách ba lớp: mã môn nguồn, yêu cầu học phần chuẩn và lượt học. Giữ nguyên mọi mã API; dừng xóa mã chỉ vì trùng tên. Bảng mapping có phạm vi CTĐT/khóa/phiên bản, phân biệt tương đương/thay thế và các lựa chọn cùng nhóm.

Ưu tiên đối soát các cặp `25TC1001/TC1001D`, `TN1001D/20TN1201`, `TN1008D/20TN1202`, `20CT3102D/20CT3132D`. Dựa trên CTĐT, tín chỉ, yêu cầu và kế hoạch để xác nhận mapping; tên chỉ là bằng chứng hỗ trợ. Không tự bỏ hậu tố D/D2 hoặc gộp mọi tên giống nhau. Các mã chưa giải quyết vẫn được giữ và trình bày cần đối soát, không bị xóa.

Sửa định danh lượt học để không va chạm khi StudyUnitID/ScheduleStudyUnitID trống. Mã môn phải tham gia cách phân biệt lượt; giữ định danh nguồn gốc. Nếu nhiều lượt cùng môn/kỳ vẫn không phân biệt được thì lưu nguồn và đưa vào hàng đợi đối soát, không ghi đè im lặng. Dùng cùng quy tắc trong script import và endpoint grades/import.

Khôi phục có kiểm soát ba lượt QP2101D/2D/3D của `2347B017` từ snapshot đã đối chiếu. Đối soát `2347A052` trước khi bổ sung ba đăng ký: API mã chung rỗng nhưng hai mã chuyên ngành cùng trả bộ ba môn pending; không tự chọn PM/MMT. Gắn quyết định chuyển trường và vấn đề mã CTĐT để giáo viên hiểu tình trạng. Các bản rèn luyện ngoài roster không tự tạo thành sinh viên mới.

Chỉ backfill các bản ghi được chứng minh sai/thiếu. Không chạy importer có nhánh truncate hoặc sync --force để thay toàn bộ DB.

## 3. Một bộ đánh giá kết quả học phần dùng chung

Tiến độ, tốt nghiệp và cảnh báo dùng chung cách chuẩn hóa/matching/trạng thái:

| Dữ liệu ở mốc xét | Trạng thái học phần và tín chỉ |
| --- | --- |
| F, VT và chưa có lần đạt | Chưa đạt; không tích lũy |
| Đăng ký được nguồn xác nhận chưa có kết quả | Pending; chưa tích lũy |
| Không có đăng ký/lượt học cho một yêu cầu | Chưa hoàn thành; không tự coi pending |
| Có lần đạt hợp lệ trước/đúng mốc xét, kể cả D ở hè | Đã đạt; công nhận một lần theo yêu cầu chuẩn |
| Chưa ánh xạ hoặc thiếu phạm vi kỳ | Cần đối soát; không biến thành đã đạt/0 điểm |

Giữ tất cả F/VT/lần đạt trong lịch sử. Kết quả học phần tổng hợp được tính riêng, không dùng để thay bảng điểm lịch sử. GPA nguồn và GPA tính lại (nếu có) phải phân biệt; không biến null thành 0 một cách mặc định.

## 4. Tự công nhận GDQP/GDTC trong Dự kiến tốt nghiệp

Thay cách chỉ đọc trạng thái từ StudentGraduationRequirement bằng bộ suy ra từ các lượt học và yêu cầu CTĐT tại cutoff của đợt xét. Kết quả lưu nguồn tính và bằng chứng trong snapshot của đợt, không giả lập số hiệu chứng chỉ.

**GDQP:** phải đạt đủ các yêu cầu QP1–QP4, tính một lần cho từng yêu cầu dù học lại hay đổi mã. PDF ghi 8,5 TC, API hiện cho 3+2+2+2=9 TC; hoàn thành đủ bốn học phần là căn cứ, không áp một số 9 toàn cục rồi loại trường hợp hợp lệ theo CTĐT 8,5. Giữ nguyên tín chỉ nguồn để truy vết. Thiếu một học phần không được bù bằng học lại/đạt lặp học phần khác.

**GDTC:** công nhận đủ 3 TC theo yêu cầu GDTC của CTĐT. Các mã cũ/mới và các lựa chọn cùng một phần GDTC được ánh xạ để chỉ công nhận một lần; không cộng ba lượt cùng môn hoặc các lựa chọn thay thế để tạo đủ 3 TC giả.

UI giữ hai mục “Chứng chỉ GDQP/GDTC” như người dùng yêu cầu, thể hiện Đạt/Chưa đạt/Đang chờ điểm/Cần đối soát cùng các môn và tín chỉ làm căn cứ; khi đạt ghi “Công nhận từ học phần đã đạt”. Chỉ dùng trạng thái chờ khi các đăng ký chưa có điểm thực sự có thể đáp ứng phần còn thiếu; có VT/F chưa được giải quyết thì chỉ rõ học phần chưa đạt. Không cộng GDQP/GDTC vào 150/104/46.

Ngoại ngữ tiếp tục nằm ngoài đánh giá. Nếu có kết quả công nhận riêng trước đó, giữ nguyên nguồn; trường hợp mâu thuẫn nguồn phải đối soát chứ không âm thầm ghi đè.

## 5. Sửa mốc tiến độ, cảnh báo và góc nhìn giáo viên

- Giữ học kỳ hiện tại hệ thống; tách mốc chuẩn theo khóa, lộ trình cá nhân và học phần đang học lại. Công bố mốc dùng cho nhãn tiến độ, không để pending môn cũ tự xóa nợ của mốc chuẩn.
- Trước HK6: đánh giá khối chung; phân ngành chưa đến hạn là trạng thái bình thường. Dự kiến tốt nghiệp vẫn biết chuẩn chung 150 nhưng trình bày phần lộ trình chuyên ngành chưa xác định, không gắn lỗi dữ liệu chỉ vì chưa chọn.
- Áp ngưỡng QĐ600 và tính nợ còn tồn tại tại mốc từ các lượt học đã xác minh. Khi học hè đạt, giải quyết nợ từ mốc đạt, không thay F hoặc snapshot cảnh báo cũ. Phân biệt cảnh báo quy chế với tín hiệu tiến độ hỗ trợ nội bộ.
- Dữ liệu chuyển trường/thiếu lịch sử không tự chứng minh kỳ đầu khóa học. Chỉ áp ngưỡng kỳ đầu khi xác định được căn cứ; chưa đủ thì công khai phần chưa đánh giá.
- Sửa rèn luyện: số kế hoạch một năm không phải số kỳ toàn khóa; hiện đủ kỳ có điểm và thiếu kỳ nào, tách điểm tạm tính/kết quả toàn khóa.
- Hồ sơ có phần tóm tắt chung mốc, nợ bắt buộc, thiếu tự chọn từng nhóm, pending, trạng thái chứng chỉ, nguồn cập nhật và hành động can thiệp tiếp theo.
- Bảng điểm cho xem toàn bộ lần học và chế độ tổng hợp. Đưa MobilePhone có nguồn vào hồ sơ thay vì chỉ giữ trong payload thô; thiếu/không nhất quán hiện rõ. Hoàn thiện phân trang và thông báo lỗi API.

## 6. Kết quả cũ và triển khai

Thứ tự: nền tảng dữ liệu/mapping → bộ quy tắc chung → chứng chỉ/tốt nghiệp → tiến độ/cảnh báo → UI và đợt tính mới.

Giữ sáu đợt tốt nghiệp và lịch sử cảnh báo cũ; gắn phiên bản để truy vết. Tạo đợt mới sau khi chuẩn hóa cấu hình và các lỗi đầu vào, không đổi trạng thái/threshold của snapshot cũ thành kết quả mới. Các sửa dữ liệu có báo cáo trước/sau, nguồn và audit.

## 7. Các trường hợp nghiệm thu bắt buộc

1. `2347B017`: đủ bốn môn GDQP từ nguồn, không va chạm khóa; công nhận GDQP; không cộng vào 150.
2. Thiếu một phần GDQP, nhưng học lại phần khác nhiều lần: vẫn chưa đạt chứng chỉ.
3. Đạt 3 TC GDTC hợp lệ: chứng chỉ đạt; cùng yêu cầu đổi mã/học lại không tăng tín chỉ lặp.
4. `2549A001`: 25TC1001 đạt B được nhận đúng yêu cầu GDTC1, không còn báo ngoài CTĐT.
5. `2448A001`: chuẩn yêu cầu toàn khóa biết là 150; nhóm đúng mức; không lỗi phân ngành ở HK5.
6. `2347A052`: phát hiện lệch mã/đăng ký pending và chuyển trường, không suy đã đạt hoặc tự gán chuyên ngành.
7. VT: failed, 0 earned, 0 pending cho chính lượt VT; chưa công nhận học phần/chứng chỉ.
8. `2246A021`: HK01 còn F tại mốc đó; sau D hè học phần đạt và hết nợ tương ứng; lịch sử còn cả hai; tín chỉ tính một lần.
9. Thừa TC nhóm A không bù thiếu nhóm B; 150 TC tổng chưa đủ nếu còn yêu cầu bắt buộc/nhóm chưa hoàn thành.
10. Đợt xét trước lần đạt hè không dùng điểm hè; snapshot cũ giữ nguyên.
11. Nguồn thiếu kỳ/không có dữ liệu khác với không đạt và khác với pending; có bằng chứng trạng thái trên UI.
12. Test, typecheck, lint đạt; kiểm tra có xác thực các vai trò cho tra cứu, tính đợt, chi tiết, can thiệp và xuất báo cáo. Không chỉ chạy unit tests.
