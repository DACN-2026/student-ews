# Hướng dẫn sử dụng SEWS

## 1. Đăng nhập và phạm vi dữ liệu

Đăng nhập tại `/login`. Dữ liệu hiển thị phụ thuộc role và phạm vi được phân:

- Ban chủ nhiệm/quản trị có thể xem toàn hệ thống hoặc toàn khoa.
- Cố vấn học tập chỉ xem các lớp đã được phân công.
- Nút tạo/cập nhật hỗ trợ và xuất báo cáo chỉ xuất hiện khi tài khoản có quyền tương ứng.

Nếu một sinh viên hoặc báo cáo nằm ngoài phạm vi, hệ thống trả `404` để không làm lộ sự tồn tại của hồ sơ.

Sinh viên có quyết định **thôi học, buộc thôi học hoặc chuyển đi** đã ký và có hiệu lực mang tag **Đã rời lớp**. Hệ thống ngừng đưa sinh viên vào theo dõi, cảnh báo, thống kê vận hành, tiến độ, dự kiến tốt nghiệp và hàng đợi hỗ trợ từ kỳ rời lớp trở đi. Không thể ghi hỗ trợ mới, hẹn theo dõi hay mở lại hồ sơ hỗ trợ cho sinh viên đã rời lớp. Hồ sơ, bảng điểm, quyết định, kết quả đánh giá và nhật ký hỗ trợ trước đây được giữ để tra cứu; chi tiết hỗ trợ ở chế độ chỉ đọc. Tiến độ cá nhân khi mở hiện tại dùng mốc lịch sử trước kỳ rời lớp, không tiếp tục dự báo ở các kỳ sau.

Quyết định **tiếp nhận chuyển trường đến** không được hiểu là rời lớp; nghỉ tạm thời/bảo lưu được xử lý theo hiệu lực nghỉ và không mang tag rời lớp. Quyết định rời lớp có kỳ hiệu lực trong tương lai chưa làm sinh viên rời lớp ngay hôm nay. Mốc và tag được đối chiếu từ quyết định, kể cả khi danh sách lớp nguồn vẫn ghi đang trong lớp; cờ nguồn và dữ liệu lịch sử được giữ nguyên. Khi quyết định bị hủy/xóa hoặc có quyết định tiếp nhận trở lại đã hiệu lực, cần đồng bộ lại trạng thái theo quyết định hiện có.

Sinh viên có quyết định **nghỉ học tạm thời / bảo lưu** đã ký, có hiệu lực mang tag **Đang nghỉ học tạm thời** và vẫn thuộc lớp. Từ kỳ bắt đầu nghỉ, hệ thống đóng băng hồ sơ: dừng phân mức cảnh báo, tính tiến độ và dự kiến tốt nghiệp cho các kỳ nghỉ; loại khỏi thống kê vận hành, hàng đợi và tính quá hạn can thiệp. Hồ sơ hỗ trợ cũ giữ nguyên trạng thái, nhật ký và chỉ đọc. Tiến độ cá nhân chỉ trình bày dữ liệu đến kỳ chính trước khi nghỉ, không gán các kỳ nghỉ thành chưa đăng ký hoặc chậm tiến độ. Bảng điểm, quyết định và cảnh báo trước khi nghỉ vẫn được tra cứu, ghi rõ là lịch sử.

Hết thời hạn nghỉ ghi trong văn bản không tự mở lại hồ sơ. Việc theo dõi khôi phục khi có quyết định tiếp nhận học lại hợp lệ và đến kỳ hiệu lực; quyết định học lại cho kỳ tương lai chưa mở lại hôm nay. Thay đổi quyết định và lịch học được đồng bộ tự động. Đây là quy tắc theo dõi của hệ thống; không tự kết luận thời gian nghỉ được trừ khỏi hạn đào tạo tối đa.

## 2. Theo dõi dashboard và báo cáo

Tại **Tổng quan**, chọn năm học, học kỳ, chương trình, lớp, mức cảnh báo hoặc trạng thái hỗ trợ. Mỗi chỉ số ghi rõ kỳ/cutoff và hiển thị “chưa có dữ liệu” thay vì suy diễn thành 0%.

Tại **Báo cáo**:

1. Chọn loại dữ liệu: cảnh báo, tiến độ CTĐT, rèn luyện hoặc nhật ký hỗ trợ.
2. Chọn **Xuất Excel (.xlsx)** để tải workbook.
3. Chọn **Xuất PDF tổng hợp** để tải báo cáo cảnh báo dành cho ban chủ nhiệm khoa.
4. Trong biểu đồ/lớp, bấm vào nhóm để mở danh sách sinh viên chi tiết.

Mức Bình thường / Cần chú ý / Nguy cơ cao là phân mức theo dõi nội bộ. Xem riêng **Đối chiếu học vụ** để biết có tiêu chí đã chạm ngưỡng QĐ600, chưa chạm ngưỡng hay chưa đủ dữ liệu đối chiếu. Mức Bình thường chỉ phản ánh những tiêu chí đã đánh giá được; không bảo đảm mọi nguồn dữ liệu đều đầy đủ. Hệ thống không thay thế quyết định chính thức của trường.

Sinh viên đang được theo dõi, thuộc khóa/CTĐT cấu hình nhưng thiếu bảng tổng hợp đúng chương trình trong kỳ xét được đưa vào **Nguy cơ cao – cần ưu tiên xác minh**, kể cả khi chưa ghi nhận đăng ký. Đây là ưu tiên liên hệ và xử lý hồ sơ, không gán GPA bằng 0 hoặc tự kết luận vi phạm học vụ. Nếu có quyết định nghỉ hợp lệ bao phủ kỳ đó hoặc đã thôi học/chuyển khỏi chương trình, hệ thống loại khỏi phân tích theo hiệu lực quyết định. Quyết định khác, nguyện vọng học chậm, quyết định hết hiệu lực hoặc kỳ trước thời điểm nhập học không được suy diễn thành không đăng ký trái quy định.

TB1270 áp dụng riêng K45–K48 chính quy, HKII 2024–2025: theo dõi việc không đăng ký một kỳ, hai kỳ chính liên tiếp, lịch sử cảnh báo, cứu xét và hạn đào tạo. Mốc cảnh báo liên tiếp của đợt này là từ 2 kỳ; ngoài phạm vi đó đối chiếu QĐ600 Điều 18 khoản 2(a), quá 2 lần liên tiếp (từ 3). Mức nội bộ từ 2 kỳ ưu tiên hỗ trợ, không thay quyết định xử lý học vụ.

## 3. Hồ sơ sinh viên

Từ danh sách sinh viên, mở một hồ sơ để xem:

- tổng quan GPA, tín chỉ và tiến độ;
- kết quả rèn luyện tạm thời/công nhận;
- điểm học phần, quyết định, chính sách học phí và đăng ký;
- tiến độ CTĐT, nguyên nhân cảnh báo và nhật ký hỗ trợ;
- timeline hợp nhất cảnh báo, quyết định và hỗ trợ.

Chọn **Xuất PDF hồ sơ** để tạo bản tổng hợp đầy đủ. File luôn được tạo ở backend theo đúng data scope của tài khoản.

Chức năng **Cảnh báo học tập** chỉ xét học kỳ chính trước đã có kết quả; kỳ đang học không được đưa vào phân mức này. Chi tiết hiển thị rõ học kỳ của kết quả đã lưu. Không có khối theo dõi kỳ hiện tại hoặc khối đối chiếu đăng ký/quyết định riêng trong màn hình cảnh báo. **Thời gian đào tạo tối đa** không thuộc bộ tiêu chí cảnh báo và không tính vào số tiêu chí thiếu dữ liệu.

Quyết định nguồn vẫn được dùng ở backend để xác định phạm vi theo kỳ: nghỉ hợp lệ thì đóng băng, học lại hợp lệ thì khôi phục, thôi học/chuyển đi thì ngừng theo dõi. Xem văn bản tại tab **Quyết định** trong hồ sơ sinh viên. Hệ thống ưu tiên kỳ hiệu lực nêu rõ trong nội dung trước kỳ ghi nhận nguồn; khi chưa rõ cần đối chiếu văn bản. Bản ghi đã xóa/hủy không được dùng. Khi dữ liệu kỳ đã xét thay đổi, người có quyền tính cảnh báo **Chạy lại đánh giá** để cập nhật kết quả đã lưu; lịch sử cũ vẫn giữ.

Khi đối chiếu dữ liệu của kỳ đã xét, cần rà soát thiếu bảng điểm, GPA chưa được nguồn cung cấp, lệch kỳ giữa bảng điểm lớp/cá nhân hoặc lịch sử học phần chưa đủ kết quả. Các vấn đề nguồn cần xác minh không tự thay thế quyết định học vụ.

Điểm trống được giữ là chưa rõ kết quả, khác với điểm 0, VT và cờ chờ điểm. Học phần SHCD 0 tín chỉ không đủ để xác nhận đã đăng ký học thuật. GDTC/GDQP chưa rõ kết quả vẫn cần xử lý điều kiện tương ứng, nhưng không làm thiếu đánh giá nợ và tiến độ học thuật. Kết quả học thuật cũ chưa rõ vẫn làm tiêu chí liên quan chưa đầy đủ, trừ khi đã có bằng chứng đạt học phần đó trước kỳ xét.

Lý do chính đáng và quyết định nghỉ được chấp thuận, có hiệu lực trong kỳ, là căn cứ giải thích việc không đăng ký; mong muốn nghỉ chưa được phê duyệt không đủ. TB1270 còn có hạn chế cứu xét với trường hợp không đăng ký và cứu xét nhiều lần nhưng không cải thiện. Hệ thống không bảo đảm mọi trường hợp đều được cứu xét hay không bị buộc thôi học; cần xử lý kịp thời với đơn vị có thẩm quyền.

## 4. Ghi nhận và xử lý hỗ trợ

Học phần **VT** được theo dõi riêng bằng số học phần, số tín chỉ và danh sách môn của kỳ xét, kể cả học phần điều kiện. GVCN/CVHT cần xác minh lý do vắng thi, phê duyệt hoãn thi và kết quả bổ sung; hệ thống không tự quy VT thành GPA 0 hoặc tín chỉ F. Khi còn VT chưa xác minh, tỷ lệ tín chỉ không đạt chưa được đối chiếu QĐ600; VT lịch sử chưa được giải quyết cũng không dùng để kết luận tổng nợ F. Đây là tín hiệu hỗ trợ, không phải quyết định cảnh báo học vụ.

Học phần **đang học / chờ điểm** không tự phát sinh nợ F và không tự xóa nợ đã xác định. Kết quả đạt trước mốc xét vẫn được giữ khi học cải thiện; học lại chỉ giải quyết nợ khi có kết quả đạt hoặc thay thế hợp lệ. Chi tiết cảnh báo hiển thị riêng các môn chờ điểm và kết quả đã biết. Điểm trống không có cờ chờ điểm vẫn là kết quả chưa rõ cần đối chiếu. Sinh viên chưa ghi nhận đăng ký kỳ trước tiếp tục chưa có dữ liệu để đánh giá GPA và tỷ lệ tín chỉ không đạt.

Trong tab **Cảnh báo học vụ**, chọn **Ghi nhận can thiệp mới**, nhập loại hành động và nội dung. Quy trình trạng thái hợp lệ:

`OPEN → IN_PROGRESS → RESOLVED`, có thể chuyển `ESCALATED`; hồ sơ đã giải quyết có thể `REOPENED` rồi quay lại xử lý.

`RESOLVED` chỉ có nghĩa hồ sơ hỗ trợ đã hoàn tất, không đồng nghĩa sinh viên hết nguy cơ. Mọi lần tạo/cập nhật đều lưu người thao tác và lịch sử trạng thái.

Chi tiết cảnh báo hiển thị gợi ý hỗ trợ theo từng nguyên nhân, người phụ trách nếu đã phân công và thao tác đặt ngày theo dõi tiếp. Ngày theo dõi được lưu trong hồ sơ hỗ trợ.

## 5. Quản trị và vận hành

- Quản trị viên phân role, permission và lớp cố vấn tại **RBAC**.
- Quyền `report.export` cho phép tải báo cáo nhưng vẫn chịu giới hạn phạm vi dữ liệu.
- Thay đổi quyền, phân công, xóa dữ liệu, ghi hỗ trợ và xuất file đều được ghi audit.
- Khi dữ liệu nguồn thay đổi, tạo đợt đánh giá mới; không sửa lịch sử run đã hoàn tất.

Tại **Cấu hình Cảnh báo học tập**, tài khoản có quyền `academic_warning.policy.manage` có thể điều chỉnh ngưỡng hỗ trợ sớm và bật riêng các tiêu chí GPA thấp/suy giảm, tỷ lệ tín chỉ không đạt, học phần không đạt nhiều lần và rèn luyện thấp/suy giảm. GPA là điểm trung bình học tập, TC là tín chỉ. Tín hiệu mới mặc định tắt; các ngưỡng hiện tại vẫn là nợ 13 / 19 TC, chậm tiến độ 4 / 12 TC và khoảng GPA tích lũy 0,2.

Ở đầu trang, **Quy chế đào tạo trình độ đại học** giải thích tài liệu đối chiếu của Trường Đại học Đà Lạt, ban hành theo Quyết định 600/QĐ-ĐHĐL. Chọn **Xem Điều 18** để mở đúng trang liên quan trong tab mới hoặc **Tải quy chế PDF** để lưu nguyên bản. Bảng bên cạnh hiển thị các ngưỡng học vụ chỉ để đối chiếu. Các mức hỗ trợ sớm được cấu hình riêng và không tự ban hành quyết định học vụ.

Ví dụ phân mức nợ tín chỉ, chậm tiến độ và khoảng GPA cập nhật ngay theo giá trị đang nhập. Tỷ lệ tín chỉ không đạt nhập theo phần trăm, ví dụ nhập 30 cho 30%. Lỗi hiện dưới từng ô; ngưỡng Nguy cơ cao phải lớn hơn ngưỡng Cần chú ý. **Hủy thay đổi** khôi phục cấu hình vừa tải hoặc vừa lưu. Nút **Lưu cấu hình** chỉ bật khi có thay đổi hợp lệ.

Theo dõi rèn luyện yêu cầu cấu hình mã trạng thái đã xác minh là điểm được công nhận trong phần **Nguồn điểm rèn luyện được công nhận**. Nếu chưa xác minh được nguồn, giữ các tiêu chí rèn luyện ở trạng thái tắt. So sánh xu hướng cần dữ liệu của hai kỳ chính liền nhau; thiếu dữ liệu thì tiêu chí không được đánh giá. Khi lưu, hệ thống tạo phiên bản chính sách mới dùng cho lượt đánh giá tiếp theo. Mở báo cáo không tự áp dụng chính sách mới lên các kỳ đã hoàn tất; dùng **Chạy lại đánh giá** nếu muốn áp dụng cho một kỳ cũ, kết quả cũ vẫn được giữ trong lịch sử.

## 6. Xử lý sự cố thường gặp

- **Không thấy nút xuất:** tài khoản chưa có `report.export`; nhờ quản trị cấp quyền rồi đăng nhập lại để nhận token mới.
- **File trống:** kiểm tra kỳ, lớp/CTĐT và data scope; dữ liệu có thể chưa có run hoàn tất.
- **Không chuyển được trạng thái hỗ trợ:** tải lại hồ sơ và chọn đúng bước chuyển hợp lệ.
- **Xám/chưa đủ dữ liệu:** kiểm tra tổng hợp GPA của kỳ; không được coi trạng thái này là an toàn.

Học phần có trong danh mục CTĐT chung nhưng chưa xác nhận thuộc chuyên ngành được hiển thị tại **Học phần chờ xác nhận phạm vi CTĐT**, kèm mã môn, tín chỉ, kỳ học, danh mục nguồn và trạng thái điểm. CVHT đối chiếu môn được phép học, thay thế hoặc CTĐT cá nhân; môn chờ điểm chưa tạo nợ F. Cấu trúc dữ liệu và thuật giải nâng cao không được ghép với môn cơ bản.

Các lượt Toán rời rạc kỳ hè K47 mang mã `TN1008D` được nhóm với `20TN1202` để tính một nghĩa vụ 4 TC. Bảng điểm giữ từng lượt học; VT vẫn cần xác minh. Kết quả học lại đạt chỉ giải quyết nợ tại mốc xét sau kết quả đó, không sửa ngược cảnh báo của kỳ trước.
