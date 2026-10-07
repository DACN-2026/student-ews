# Đối chiếu API nguồn và hệ thống ngày 06/10/2026

## Kết luận

Thiếu dữ liệu/cấu hình có nguyên nhân ở **cả hợp đồng nguồn và cách hệ thống xử lý**, không thể quy hết cho API. Phần lớn bảng điểm, hồ sơ và quyết định đã nhập đúng. Nhưng có lỗi mất ba học phần GDQP do khóa lưu, bỏ sót ba đăng ký hiện tại khi mã CTĐT giữa endpoint không nhất quán, và loại mã môn hợp lệ khi gộp danh mục theo tên. Chuẩn 150/104/46 đã được người dùng xác nhận; việc bộ tính chưa lấy được chuẩn này là trách nhiệm cấu hình của hệ thống, dù API không cung cấp ngưỡng.

Chốt nghiệp vụ bổ sung: công nhận hai mục chứng chỉ từ đủ học phần GDQP và 3 TC GDTC; không coi thiếu bản ghi chứng chỉ bên ngoài là trở ngại khi điểm đủ căn cứ. [Phương án triển khai](IMPLEMENTATION_PLAN_2026-10-06.md) đã bao gồm quy tắc này.

## Phạm vi thực hiện

- Đọc tài liệu đầy đủ 8 endpoint của [Portal Online DLU Proxy](https://kg8vuz7mh4.apidog.io/llms.txt), rồi gọi dữ liệu thật; không chỉ dùng response example trong tài liệu.
- 10 lớp được công bố, 625 sinh viên K46–K49. Danh sách API và DB khớp, không có chênh lệch mã CTĐT hiện tại của hồ sơ.
- Bảng điểm `ALL/ALL`, quyết định và miễn giảm của cả 625 người, dùng mã CTĐT từ endpoint danh sách sinh viên.
- 11 mã CTĐT trong hệ thống: 8 có danh mục từ API; 3 nhánh K48 trả rỗng. Không yêu cầu K48 chọn chuyên ngành trước HK2 năm 3; K50 ngoài phạm vi.
- 150 tổ hợp lớp/năm/kỳ: 10 lớp × 5 năm 2022–2023 đến 2026–2027 × HK01/HK02/HK03; đọc cả điểm theo lớp và rèn luyện. Có kỳ tương lai, nên bản ghi rỗng/chưa có điểm không tự là lỗi.
- Kiểm tra chéo 16 truy vấn mã PM/MMT cho 8 sinh viên K47 còn mã chung. Chỉ một người có thêm đăng ký khác với kết quả truy vấn mã hiện tại.
- Đối chiếu DB chỉ đọc và chạy service hiện tại để tái hiện kết quả đối chiếu sai. Không gọi script import hay sửa DB.

Đợt đọc chính thực hiện 2.196 request API nghiệp vụ, không có request thất bại; health trả app/db OK. Một đợt dò thêm mã không phải mã hiện tại trên diện rộng gặp timeout và đã dừng; không dùng timeout đó làm bằng chứng dữ liệu rỗng. Sau đó kiểm tra có giới hạn 16 truy vấn K47 hoàn tất. Không tuyên bố đã đọc mọi tổ hợp sinh viên/CTĐT có thể gửi hoặc dữ liệu bên trong Portal không được proxy cung cấp.

## 1. Kết quả theo endpoint

| Endpoint | Kết quả nguồn thật | Đối chiếu hệ thống |
| --- | --- | --- |
| `GET /health` | app/db OK | Nguồn truy cập được; không chứng minh mọi dữ liệu đầy đủ |
| `LayDanhSachSinhVienTheoLop` | 625 người, 10 lớp | DB 625 người; không thiếu/thừa hồ sơ hay khác mã CTĐT |
| `LayBangDiemSinhVien` | 31.141 lượt có kỳ, 13 lượt thiếu phạm vi kỳ, theo truy vấn mã hiện tại | DB 31.138 lượt có kỳ và 13 lượt unscoped; mất 3 môn khác nhau do va chạm khóa; các hàng còn lại khớp mã môn, chương trình, tín chỉ, điểm, pass/gather/pending/special |
| `LayBangDiemSinhVienTheoLop` | Đọc 150 tổ hợp | Dùng để kiểm tra chéo; script nhập chính không dùng endpoint này |
| `LayBangDiemRenLuyenTheoLop` | 9.384 bản ghi qua tiêu chí lọc của importer | 9.375 khớp DB, không khác LastScore/StudentScore; 9 còn lại thuộc 3 mã không có trong roster hiện tại |
| `LayDanhSachQuyetDinh` | 913 dòng, 912 duy nhất; một dòng trùng hoàn toàn | DB 912; payload khớp, không mất quyết định duy nhất |
| `LayDanhSachMienGiamHocPhi` | 41 dòng | DB 41, payload khớp |
| `LayDanhSachHocPhanTheoCTDT` | 355 dòng của 8 mã có dữ liệu; 3 nhánh K48 rỗng | Hệ thống có bổ sung kế hoạch/PDF và kế thừa khối chung; phát hiện 4 mã nguồn bị loại khi gộp theo tên |

Không nên đọc “31.138 hàng khớp” thành “không mất điểm”: khóa DB đã gộp 4 môn GDQP thành một trước khi đối chiếu theo cùng khóa. Đối chiếu thêm mã môn mới phát hiện 3 môn bị mất.

## 2. Thiếu cấu hình chuẩn: API không cung cấp, hệ thống chưa kết nối chuẩn PDF

Nguồn: [API CTĐT](https://kg8vuz7mh4.apidog.io/l%E1%BA%A5y-chi-ti%E1%BA%BFt-ch%C6%B0%C6%A1ng-tr%C3%ACnh-%C4%91%C3%A0o-t%E1%BA%A1o-42667626e0).

Phản hồi thực tế chỉ có `tbStudyPrograms`, `groupSelection`, `groupSelection2`; hai danh sách nhóm đều rỗng cho cả 11 truy vấn. Danh sách môn có `STC`, `BatBuoc`, `HocKy`, mã/tên môn, nhưng không có ngưỡng tổng 150, bắt buộc 104, tự chọn 46 hoặc mức tối thiểu từng nhóm. `GhiChu`, `HPHocTruoc`, `HPTienQuyet` rỗng trong các danh mục đã đọc. Không thể cộng mọi môn tự chọn trong danh sách để suy tổng tín chỉ yêu cầu.

Ví dụ `2448A001 – Lý Ngọc Tùng`, ITK48A: có bảng điểm và danh mục CTĐT, nhưng service trả tổng yêu cầu/TC còn thiếu/% toàn khóa là null, nhóm `CHUNG` chưa xác định mức tối thiểu. Bộ tính truy vấn rule active gắn `CQ24CT` nhưng không tìm thấy TOTAL_CREDITS/ELECTIVE_CREDITS.

**Phân định:** API thiếu biểu diễn các yêu cầu này. Tuy nhiên PDF và xác nhận người dùng đã cung cấp chuẩn áp dụng; hệ thống phải cấu hình hoặc kế thừa chuẩn chung, cùng các nhóm đúng CTĐT. Không cần chờ API trả một trường mà hợp đồng hiện tại không có. Thiếu ngưỡng tổng không đồng nghĩa thiếu bảng điểm và không tự làm sai mọi kết luận tiến độ học kỳ.

## 3. Hồ sơ 2347A052: lệch mã CTĐT giữa các truy vấn và importer không đối soát

Nguồn: [Danh sách sinh viên](https://kg8vuz7mh4.apidog.io/l%E1%BA%A5y-danh-s%C3%A1ch-sinh-vi%C3%AAn-theo-m%C3%A3-l%E1%BB%9Bp-42667620e0), [bảng điểm chi tiết](https://kg8vuz7mh4.apidog.io/l%E1%BA%A5y-b%E1%BA%A3ng-%C4%91i%E1%BB%83m-chi-ti%E1%BA%BFt-c%E1%BB%A7a-sinh-vi%C3%AAn-42667625e0).

`2347A052 – Trương Anh Minh`, ITK47A:

- Danh sách sinh viên trả `StudyProgramID=CQ23CT`.
- Truy vấn bảng điểm `p1=2347A052, p2=CQ23CT, p3=ALL, p4=ALL` trả HTTP 200/ok true nhưng `body=[]`.
- Dùng `CQ23CT-PM` hoặc `CQ23CT-MMT` đều trả cùng 3 đăng ký HK01 năm 2026–2027: `20CT1101` 3 TC, `20CT1102` 4 TC, `20LH0001` 3 TC.
- Cả 3 có `NotScore=1`, chưa có điểm/pass; đây là **đăng ký đang chờ kết quả**, không phải điểm đã đạt hay tín chỉ tích lũy. Đếm một bộ 3 môn, không cộng hai truy vấn PM/MMT thành 6 môn.
- API quyết định trả “Tiếp nhận Chuyển trường”, ký 25/06/2026. Vì vậy không tự suy thiếu cả ba năm học chỉ từ khóa K47; cần hồ sơ nhập học/công nhận tín chỉ nếu muốn xét lịch sử trước chuyển trường.

Script importer chỉ gọi một lần theo `student.StudyProgramID`. Kết quả rỗng bị chấp nhận, không có bước báo mâu thuẫn giữa roster và bảng điểm. Vì vậy DB vẫn có 0 đăng ký, 0 summary.

**Phân định:** nguồn không nhất quán về mã chương trình dùng để lấy đăng ký; adapter nội bộ chưa phát hiện/đối soát, nên bỏ sót 3 đăng ký có thể lấy được. Không tự gán PM hoặc MMT: hai truy vấn đều trả dữ liệu, chưa chứng minh chuyên ngành thực tế. Cần xác nhận ánh xạ với nguồn và lưu trạng thái cần đối soát.

Trong 16 truy vấn kiểm tra chéo cho 8 người K47 mã chung, chỉ người này có thêm lượt học; chưa phát hiện cùng hiện tượng ở 7 người còn lại.

## 4. Mất 3 học phần GDQP do khóa nhập không đủ phân biệt môn

`2347B017`, HK01 năm 2023–2024:

| Môn nguồn | Điểm | TC | DB hiện tại |
| --- | --- | ---: | --- |
| QP2101D | B, IsPass=x | 3 | Không còn lượt tương ứng |
| QP2102D | B, IsPass=x | 2 | Không còn lượt tương ứng |
| QP2103D | C, IsPass=x | 2 | Không còn lượt tương ứng |
| QP2104D | C, IsPass=x | 2 | Còn |

API cung cấp đủ mã môn/điểm nhưng `StudyUnitID` và `ScheduleStudyUnitID` đều rỗng. Importer dùng khóa `student + kỳ + StudyUnitID + ScheduleStudyUnitID`, không có mã môn; Map ghi đè 3 lần. Schema cũng unique cùng bốn thành phần, nên luồng upsert gặp cùng vấn đề.

**Phân định:** nguồn thiếu định danh lớp học phần, nhưng dữ liệu môn không thiếu. Mất học phần xảy ra ở hệ thống vì không có khóa dự phòng khi định danh nguồn rỗng. Phải giải quyết cách phân biệt lượt học và lưu đủ 4 môn, không coi chúng là duplicate chỉ vì khóa nguồn trống. GDQP không cộng vào 150 TC nhưng vẫn ảnh hưởng đối chiếu điều kiện/hồ sơ.

Vị trí: [import-apidog-data.cjs](../apps/backend/scripts/import-apidog-data.cjs) đoạn offeringMap; [grades.ts](../apps/backend/lib/services/grades.ts) đoạn ON CONFLICT; [schema.prisma](../apps/backend/prisma/schema.prisma) unique của StudentCourseOffering.

## 5. Mã môn hợp lệ bị loại khỏi CTĐT khi gộp theo tên

`deduplicateCurricula` gộp theo `MaCTDT + tên môn`, rồi chọn mã có nhiều điểm nhất **trên toàn bộ dữ liệu các khóa**, không chỉ trong đúng CTĐT. Các mã bị loại:

| CTĐT | Mã bị loại | Lượt điểm của chính CTĐT theo API |
| --- | --- | ---: |
| CQ22CT-PM | 20CT3102D | 0 |
| CQ22CT-PM | TN1008D | 0 |
| CQ22CT-PM | TN1001D | 2, thuộc 2 sinh viên |
| CQ25CT | 25TC1001 | 243, thuộc 239 sinh viên |

API có các mã cùng tên; có thể là mã cũ/mã thay thế, nhưng chưa đủ căn cứ coi cùng tên là cùng một yêu cầu mà được xóa một mã. Hệ thống không có bảng ánh xạ tương đương phù hợp trong bộ tiến độ (`COURSE_CODE_ALIASES` đang rỗng).

Tái hiện thật với `2549A001`: `25TC1001 – Giáo dục thể chất 1` đạt B/IsPass=true nhưng service đặt vào ngoài CTĐT, lý do **“Học phần không thuộc CTĐT của sinh viên”**. Điểm vẫn trong DB; danh mục/ánh xạ để công nhận bị lỗi. Không kết luận cả 239 người đều bị từ chối tốt nghiệp, nhưng họ đều có điểm theo mã đã bị loại khỏi CQ25CT.

**Phân định:** nguồn có các mã cùng tên chưa giải thích quan hệ; hệ thống chủ động loại mã và không giữ ánh xạ. Cần bảo toàn mã nguồn, xác minh tương đương/thay thế rồi đối soát đúng phạm vi chương trình.

## 6. Điện thoại: nguồn có, hệ thống chưa khai thác cho hồ sơ

Bảng điểm thực tế có `MobilePhone` ở **622 sinh viên** theo các truy vấn mã hiện tại. Mỗi người có một giá trị duy nhất trong snapshot đã đọc. DB vẫn giữ MobilePhone trong source_payload của 622 người; schema/DTO hồ sơ sinh viên và UI chưa đưa ra trường liên hệ này. Endpoint danh sách sinh viên không có điện thoại; chỉ đọc endpoint đó sẽ bỏ lỡ trường đã có trong bảng điểm.

**Phân định:** thiếu chức năng sử dụng dữ liệu ở hệ thống, không phải API không có số điện thoại. Hai người có bảng điểm nhưng trường rỗng và người có bảng điểm mã hiện tại rỗng cần xử lý riêng; không tự điền số. Các endpoint đã đọc không có trường email để đưa ra cùng kết luận.

## 7. Những khoảng trống nguồn cần diễn giải đúng

- **13 lượt điểm thiếu năm/kỳ:** API không trả phạm vi hợp lệ để đặt lên timeline; hệ thống giữ đủ 13 trong UnscopedGradeRecord. Không phải bị xóa, nhưng chưa thể dùng làm lịch sử theo kỳ nếu chưa xác minh phạm vi.
- **GPA kỳ rỗng:** 588/3.456 phạm vi sinh viên/chương trình/kỳ không có TB_HK_4; 42 thuộc năm trước kỳ hiện tại. Kiểm tra sâu không phát hiện phạm vi kỳ chính lịch sử vừa có điểm số học phần bằng số vừa thiếu GPA kỳ. Ví dụ `2246A050`, HK02 2025–2026: sáu môn đều VT, GPA kỳ null trong cả bảng điểm cá nhân và bảng điểm lớp. Kỳ đang học/chưa chốt, chỉ sinh hoạt công dân hoặc kỳ hè không được quy thành lỗi nhập. Có thể xét tín hiệu không đạt theo quy tắc VT độc lập với GPA.
- **Chín bản rèn luyện ngoài roster:** thuộc `2549A074`, `2549B037`, `2549B016`, mỗi người ba kỳ 2025–2026; có sáu bản có điểm và ba bản không có điểm. API danh sách hiện tại và DB đều không có ba mã này. Chưa phải mất chín bản của 625 người; cần đối soát danh sách lịch sử nếu mở rộng phạm vi, không tự tạo hồ sơ sinh viên.
- **Số dòng rèn luyện không chứng minh đủ điểm toàn khóa:** API có record chứa trạng thái nhưng điểm null, kể cả kỳ tương lai/trước nhập học. Phải kiểm tra điểm hợp lệ và kỳ áp dụng, không dùng số record hay số kế hoạch thay cho độ bao phủ.
- **Nhóm NC/DC/PC trong bảng điểm** có dữ liệu nhưng chưa mô tả ngưỡng các nhóm tự chọn. Có mã nhóm không đồng nghĩa có mức tối thiểu nhóm đã được xác nhận.
- **Ba CTĐT chuyên ngành K48 trả rỗng:** phù hợp thời điểm trước phân ngành theo phạm vi người dùng; kế hoạch HK6 có thể chuẩn bị từ PDF. Không đánh dấu toàn bộ K48 thiếu chuyên ngành.
- **Tiên quyết/lịch mở môn:** danh mục API chưa có giá trị tiên quyết/học trước; lịch môn tương lai và khả năng đăng ký không được bảo đảm chỉ bởi danh mục. Cần thêm nguồn nếu muốn dự kiến chắc thời điểm tốt nghiệp.

## 8. VT, học lại hè và nợ tín chỉ: chủ yếu là logic hệ thống

Nguồn có 1.239 lượt VT theo truy vấn hiện tại. Importer giữ trạng thái special và không đánh dấu đạt; lỗi đưa VT vào pending nằm ở `graduation-forecast.ts`. Phải áp VT = chưa đạt/chưa hoàn thành/không tích lũy, như người dùng xác nhận.

Nguồn và DB đều có F→D hè ở ví dụ `2246A021`, `20CT1201`, HK01/HK03 năm 2023–2024; service tiến độ công nhận môn đã đạt và lưu attemptCount=2. UI gộp lượt học là hạn chế hiển thị, không phải API xóa F. Đồng thời lỗi va chạm khóa tại mục 4 chứng minh vẫn cần bảo vệ lưu mọi lượt trong các trường hợp định danh nguồn thiếu.

Capability nợ đọng vẫn hard-code UNVERIFIED trong hệ thống. Khi đã có các lượt học và quy ước người dùng, phần giải quyết nợ sau lần đạt phải được triển khai nội bộ; không chờ nguồn gửi một trường “nợ đọng” tổng hợp. Với tự chọn thay thế, tương đương và công nhận tín chỉ chuyển trường, cần cấu hình/căn cứ riêng. Mốc cảnh báo lịch sử phải giữ F tại lúc xét; lần đạt hè chỉ giải quyết nợ từ mốc đạt trở đi.

Ngoại ngữ ngoài phạm vi hệ thống theo xác nhận người dùng, không liệt kê thành dữ liệu thiếu cần khắc phục.

## 9. Thứ tự xử lý

1. Sửa khóa dự phòng cho định danh lớp học phần trống; khôi phục có kiểm soát ba môn GDQP của `2347B017`, giữ nguồn/audit.
2. Dừng loại mã CTĐT chỉ theo tên; xác minh ánh xạ các mã đã loại, ưu tiên `25TC1001` và `TN1001D`.
3. Đối soát roster/bảng điểm rỗng, đặc biệt `2347A052`; không tự chọn chuyên ngành từ một truy vấn có kết quả. Gắn trạng thái cần đối soát và hồ sơ chuyển trường.
4. Kết nối chuẩn K44 chung 150/104/46, GPA và nhóm tự chọn vào bộ tính; loại fallback 145. Không cộng danh sách mọi lựa chọn để suy tổng.
5. Sửa VT trong dự kiến tốt nghiệp; triển khai nợ theo mốc và giữ lịch sử F/hè; cho giáo viên xem mọi lượt học.
6. Đưa MobilePhone có nguồn vào hồ sơ và tiếp tục phân biệt dữ liệu nguồn rỗng với dữ liệu hệ thống chưa sử dụng.

Đây là kết quả rà soát, chưa thực hiện các sửa đổi/nhập lại. Snapshot API, thống kê và script đối chiếu được lưu cục bộ trong `.codex-qa/audit-2026-10-06/`; không đưa dữ liệu thô hay khóa API vào báo cáo/Git.
