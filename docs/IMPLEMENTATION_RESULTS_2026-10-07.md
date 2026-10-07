# Kết quả cập nhật logic ngày 07/10/2026

Giữ bố cục, màu sắc, điều hướng và thành phần giao diện hiện có. Chỉ sửa dữ liệu tính, trạng thái/nhãn và dữ liệu bảng điểm trong các thành phần sẵn có. Không thêm giao diện chứng chỉ, liên hệ hay tóm tắt mới.

## Nguồn và phạm vi

- Snapshot API ngày 06/10/2026: 625 sinh viên K46–K49; 31.141 lượt học có phạm vi kỳ. [Đối chiếu API trước sửa](API_DATA_AUDIT_2026-10-06.md).
- [CTĐT K44](2020_CTDT_K44.pdf), được người dùng xác nhận áp dụng đến nay: 150 tín chỉ học thuật, 104 bắt buộc, 46 tự chọn; nhóm A6=9, A7=6, B2=25, B3=6.
- [Kế hoạch giảng dạy 2026–2027](<2026-Ke-hoach-giang-day-nh-26-27 (1).pdf>): định mức đúng khóa/kỳ và nhóm lựa chọn trong năm học. Không dùng kế hoạch K50 cho các kỳ trước của K46–K49.
- [QĐ600](Quyet-dinh-so-600-QD-DHDL-ve-viec-ban-hanh-Quy-che-dao-tao-trinh-do-dai-hoc-cua-Truong-Dai-hoc-Da-Lat-VER1.pdf): ngưỡng quy chế, GPA và mốc đánh giá. Giữ học kỳ hiện tại đã đúng.

## Thay đổi đã thực hiện

1. Dùng quy tắc kết quả học phần chung: VT là chưa đạt, không pending, không tích lũy. Lần đạt D ở hè giải quyết nợ học phần từ mốc đạt; F và toàn bộ các lần học vẫn được giữ.
2. Loại GDTC/GDQP/SHCD khỏi tín chỉ học thuật trong tổng kỳ, kế hoạch, đối chiếu tốt nghiệp và tỷ lệ tín chỉ không đạt của cảnh báo. Giữ nguyên điểm/GPA nguồn, không sửa GPA kỳ chính bằng kết quả hè.
3. Công nhận hai mục chứng chỉ đang có từ học phần: GDQP đủ bốn phần QP1–QP4; GDTC đủ ba yêu cầu một tín chỉ. Mã thay thế/học lại không tạo tín chỉ lặp. Chấp nhận chênh lệch QP3 1,5 tín chỉ trong PDF và 2 trong API bằng điều kiện đủ phần, không áp một ngưỡng 9 tín chỉ toàn cục.
4. Giữ mọi mã môn nguồn. Sửa importer bỏ mã theo tên; khôi phục bốn mã CTĐT bị bỏ. Các tương đương đã xác minh có phạm vi chương trình; các cặp hậu tố chỉ mở rộng khi có căn cứ mã/tên phù hợp. Không gộp mọi tên giống nhau.
5. Khóa lượt học có thêm mã môn, bảo toàn các lượt có StudyUnitID/ScheduleStudyUnitID trống. Khôi phục đủ QP1–QP4 của `2347B017`; không xóa các lượt VT riêng của sinh viên này. Import xung đột danh tính/phạm vi chương trình báo cần đối soát; import một phần không xóa lịch sử chưa được gửi trong lần đó.
6. Thêm 44 quy tắc có nguồn/phiên bản cho 11 chương trình hiện có, giữ quy tắc và đợt xét trước đó. K49 có phiên bản kế hoạch mới: 6 tín chỉ tự chọn học thuật, yêu cầu GDTC3 riêng, không cộng thành 7 tín chỉ học thuật.
7. Tiến độ dùng mốc khóa/kỳ, không lùi mốc vì đang học lại môn cũ. Kỳ có kế hoạch năm học đã khóa dùng định mức đó. Kỳ chưa có kế hoạch năm học dùng các yêu cầu bắt buộc và mốc tối thiểu khối tự chọn có căn cứ trong CTĐT; không suy định mức kỳ cũ từ năm 2026–2027. Nhãn lịch sử phân biệt “Đạt bắt buộc” với “Đạt kỳ”. Mốc cuối của chương trình là 132 tín chỉ trước 18 tín chỉ cuối, không tạo một chương trình 155 tín chỉ do trộn kế hoạch.
8. Tự chọn thừa nhóm này không bù thiếu nhóm khác. Môn chưa xác định được khối vẫn hiện kết quả nguồn, nhưng không cộng vào tín chỉ yêu cầu đã được xác minh.
9. K48 ở HK5 và K49 trước HK6 không bị coi là thiếu ánh xạ chuyên ngành. Tám sinh viên K47 còn mã chung được đối soát riêng theo hồ sơ thực tế; không tự gán PM/MMT.
10. Cảnh báo tính nợ còn tồn tại tại đúng cutoff, không thay lịch sử F hoặc các đợt cảnh báo cũ. Thiếu bằng chứng kỳ đầu/thiếu dữ liệu không được tự chứng nhận không có nợ hoặc đủ điều kiện. Cảnh báo quy chế và tín hiệu tiến độ vẫn được phân biệt; trạng thái thiếu dữ liệu của các nhánh quy chế chưa được xác minh không được nâng thành kết luận chính thức đầy đủ.
11. Ngoại ngữ tiếp tục nằm ngoài điều kiện chứng chỉ của hệ thống. Học phần Tiếng Anh chuyên ngành `20CT2103` vẫn là học phần học thuật bắt buộc trong CTĐT, không bị loại theo điều kiện ngoại ngữ bên ngoài.

## Dữ liệu sau sửa và kết quả nghiệm thu

| Kiểm tra | Kết quả |
| --- | --- |
| Lượt học / bản ghi điểm | 31.141 / 31.141; không còn điểm mồ côi do sửa lượt học |
| Quy tắc / dòng danh mục CTĐT | 52 / 593, gồm dòng nguồn và dòng bổ sung từ kế hoạch trước đó |
| Tổng tín chỉ đăng ký kỳ so với tổng học thuật từ lượt học | 0 chênh lệch |
| Các mục chứng chỉ đạt tại cutoff hiện tại | GDTC 337; GDQP 563 |
| Đợt tốt nghiệp mới | 7 đợt, đủ 625 sinh viên; giữ nguyên 6 đợt cũ với 617 bản đánh giá |
| Lịch sử cảnh báo | Giữ 282 đợt trước sửa |
| `2347B017` | Chứng chỉ GDQP PASS từ đủ bốn phần; tín chỉ học thuật không cộng GDQP |
| `2549A001` | Mã `25TC1001` nhận đúng GDTC1; môn `25BC0001` còn chưa xác minh khối |
| `2448A001` | HK5, chuẩn toàn khóa 150; không lỗi chọn chuyên ngành trước hạn |
| `2347A052` | Tín chỉ đã đạt chưa xác định, không hiển thị 0 như kết luận; ba đăng ký mâu thuẫn phạm vi giữ để đối soát |
| `2246A021` | Bảng điểm đợt mới giữ cả F và D môn `20CT1201`; nợ môn này được giải quyết sau lần D hè |
| Kiểm thử backend | 153 trường hợp: 152 đạt, 1 bỏ qua theo điều kiện bộ kiểm thử, 0 lỗi |
| Typecheck / build | Backend và frontend đạt |
| Lint theo lệnh dự án | 0 lỗi; backend 2 và frontend 23 cảnh báo |
| API có xác thực | Ba vai trò quản trị/khoa/cố vấn: tra cứu, đợt xét, chi tiết, danh sách can thiệp đọc thành công; cố vấn không đọc được sinh viên ngoài phạm vi |
| Tính đợt và xuất báo cáo | Tạo đợt mới qua API với quyền quản trị; xuất XLSX/PDF thành công |

Kiểm tra tích hợp API dùng token do chính ứng dụng phát hành cho các tài khoản và quyền đang có, không đổi mật khẩu/quyền. Chưa xác minh thao tác đăng nhập bằng mật khẩu hiện tại. Công cụ trình duyệt không khởi động được do đường dẫn runtime không tồn tại; không có kiểm tra trực quan bằng ảnh. Đã đối chiếu diff frontend: không sửa CSS, lớp bố cục hoặc cấu trúc màn hình.

## Những thiếu hụt còn phải phân biệt

- **Nguồn API không thống nhất:** `2347A052` có mã hồ sơ CQ23CT trả bảng điểm rỗng; hai mã PM/MMT cùng trả ba đăng ký pending. Đã giữ ba bản ghi nguồn với lý do `API_PROGRAM_SCOPE_CONFLICT`, không chọn hộ chuyên ngành.
- **Nguồn thiếu phạm vi kỳ:** 13 bản ghi cũ thiếu kỳ vẫn được giữ riêng; không trộn vào kỳ bất kỳ để cộng tín chỉ hay tính GPA/nợ chính thức.
- **Chưa có căn cứ nhóm môn mới:** `25BC0001` có trong API nhưng chưa có khối tương ứng được xác nhận trong CTĐT K44. Đây là khoảng trống cấu hình cần căn cứ bổ sung, không phải sinh viên chưa đạt môn đó. Không tự gán A6 hay coi tương đương một môn khác.
- **Chuyên ngành chưa đến hạn:** K48/K49 chưa HK6 không cần gán chuyên ngành. Chuẩn 150 vẫn biết; chưa thể xác nhận danh mục chuyên ngành đầy đủ của từng sinh viên trước khi có lựa chọn.
- **Kế hoạch các năm trước:** tài liệu năm 2026–2027 không xác nhận định mức đăng ký của từng kỳ các năm trước. Hệ thống ghi rõ khi đối chiếu theo mốc CTĐT thay vì một kế hoạch năm học đã khóa.

Các snapshot API, bản sao trước sửa và log kiểm chứng chứa dữ liệu sinh viên được giữ trong thư mục QA bỏ qua bởi Git; không đưa khóa API hay thông tin xác thực vào báo cáo.

## Bổ sung sau phản hồi về HK4

Ảnh của sinh viên `2246A006` bộc lộ lỗi dự phòng định mức: chỉ lấy 13 tín chỉ bắt buộc, bỏ yêu cầu chọn 3/9 tín chỉ tự chọn. Đã thêm đối chiếu bộ bảy môn phần chung HK4 đúng với kế hoạch và xác nhận của người dùng: **13 bắt buộc + 3 tự chọn = 16 tín chỉ**. Chỉ áp khi mã, tín chỉ và loại yêu cầu của toàn bộ bộ môn khớp; không áp một định mức chung cho mọi kỳ có danh mục khác.

Giao diện dùng cùng kết quả đánh giá kỳ từ API, thay vì tự coi mọi môn tự chọn F là nợ kỳ. Cả ba vị trí nhãn trạng thái thống nhất; không còn “Nợ môn” đi kèm “Thiếu 0 TC”. Đã giữ nguyên bố cục/CSS và kết quả F của từng môn.

- Tái hiện đúng ảnh: `2246A006` trả **13/16 TC, còn thiếu 3 TC tự chọn** trên API đang chạy và bản render của thành phần giao diện.
- Đối chiếu cả 625 sinh viên: bộ môn phần chung HK4 khớp và định mức là 16; chín trường hợp đủ môn thay thế được công nhận đạt kỳ dù vẫn giữ F ở một lựa chọn khác.
- Ba kiểm thử hồi quy mới: thiếu tự chọn trong ảnh; đạt môn thay thế nhưng giữ F; thừa tự chọn không bù môn bắt buộc còn thiếu.
- Bộ kiểm thử sau bổ sung: 156 trường hợp, 155 đạt, 1 bỏ qua theo điều kiện, không lỗi. Typecheck/build hai ứng dụng đạt; lint không lỗi.

## Rà soát toàn bộ bảng học kỳ sau phản hồi về HK2

Đã xem đủ bảy trang kế hoạch giảng dạy 2026–2027, gồm ghi chú lựa chọn và các phần chuyên ngành. Sửa chung bộ đối chiếu cho HK1–HK9, thay thế ngoại lệ chỉ dành cho HK4 và cách lấy riêng tín chỉ bắt buộc làm định mức. Bảng học kỳ dùng định mức tham chiếu của tài liệu theo yêu cầu người dùng; danh mục và điểm vẫn lấy từ chương trình của từng sinh viên, không thêm sinh viên K50 hoặc sửa lịch sử điểm.

| Học kỳ lộ trình | Bắt buộc học thuật | Tự chọn tối thiểu | Kế hoạch học thuật |
| --- | ---: | ---: | ---: |
| HK1 | 13 | 0 | 13 |
| HK2 | 10 | 6 | 16 |
| HK3 | 12 | 6 | 18 |
| HK4 | 13 | 3 | 16 |
| HK5 | 13 | 3 | 16 |
| HK6 MMT | 10 | 3 bổ trợ + 4 chuyên ngành | 17 |
| HK6 PM | 10 | 3 bổ trợ + 6 chuyên ngành | 19 |
| HK6 KHDL | 10 | 3 bổ trợ + 3 chuyên ngành | 16 |
| HK7 MMT/PM | 9 | 9 | 18 |
| HK8 MMT/PM | 6 | 12 | 18 |
| HK9 | 18 | 0 | 18 |

- GDTC/GDQP/SHCD không cộng vào tử số hoặc mẫu số học thuật; vẫn giữ dòng điều kiện trong bảng. Không lấy tổng tín chỉ của tất cả lựa chọn làm số tín chỉ phải đạt.
- HK6 kiểm tra riêng nhóm bổ trợ và chuyên ngành. Ví dụ PM đạt 19 TC nhưng chưa đạt Python vẫn thiếu 3 TC bổ trợ; thanh tiến độ không lên 100% chỉ vì thừa tín chỉ ở nhóm chuyên ngành.
- Đủ một lựa chọn hợp lệ không làm mất F ở lựa chọn khác. Điểm hiển thị và lượt học nguồn giữ nguyên. Môn học trước ở kỳ tương lai hiển thị đúng tín chỉ đã đạt thay vì luôn hiển thị 0.
- HK2 lịch sử K46–K48 có ba môn tự chọn; vẫn chọn tối thiểu 6 TC. K49 còn có `25BC0001`, được xác nhận là một lựa chọn của kỳ theo PDF. Việc xác nhận lựa chọn **trong kỳ** không tự gán môn mới vào khối tín chỉ **toàn khóa K44** khi chưa có căn cứ tương ứng.
- Các kỳ chưa có danh mục hoặc chưa xác định chuyên ngành không được đánh dấu hoàn thành. Mẫu số chưa xác định hiển thị “—”; kỳ đã qua cần đối soát. K48/K49 trước HK6 vẫn là thời điểm chưa phải chọn chuyên ngành, không tự gán MMT/PM.
- Chuẩn tốt nghiệp toàn khóa vẫn theo CTĐT K44 là 150 TC và các khối tối thiểu của CTĐT. Không cộng các bảng tham chiếu của nhiều khóa/năm để thay đổi chuẩn tốt nghiệp hoặc mốc tổng tiến độ.

Kiểm chứng:

- Đúng sinh viên trong ảnh `2246A003`: HK2 **16/16 TC, còn thiếu 0, Đạt kỳ**; đã xác minh qua dịch vụ, API có xác thực trên cổng frontend 3000 và render thành phần giao diện.
- Kiểm tra **625 sinh viên / 5.625 bảng HK1–HK9**. Các bộ môn HK1–HK4 đều khớp; danh mục chưa có của các kỳ tương lai giữ rõ phạm vi chưa xác định. Có 55 bảng đã đạt dù còn F ở một lựa chọn tự chọn khác.
- Kiểm tra trực tiếp API năm sinh viên đại diện K46–K49, gồm `2246A006`: HK4 vẫn **13/16, thiếu 3 TC tự chọn**.
- Bộ kiểm thử: **161 trường hợp, 160 đạt, 1 bỏ qua theo điều kiện, 0 lỗi**. Backend/frontend typecheck và production build đạt; lint 0 lỗi (2/22 cảnh báo hiện có); diff không lỗi khoảng trắng.
- Không sửa CSS, bố cục hay cấu trúc bảng. Đã khởi động lại backend bằng build mới để API đang chạy dùng kết quả sửa.

## Sửa trùng mục ở “Chọn đợt đánh giá”

Nguyên nhân: sau khi tính lại theo quy tắc mới, hệ thống giữ bảy lần đánh giá mới và sáu lần cũ để truy vết. Màn hình lấy tất cả đợt `completed`, nên cùng K46/PM và K46/MMT xuất hiện hai lần.

API hỗ trợ `latestPerScope=true` cho bộ chọn, lấy lần mới nhất theo khóa + CTĐT + kỳ đánh giá + chuyên ngành + nhóm đối tượng. Lọc quyền và trạng thái trước, chọn bản mới nhất trước phân trang; tổng số mục cũng tính theo danh sách đã chọn. Màn hình Dự kiến tốt nghiệp sử dụng tùy chọn này, không đổi bố cục/CSS. API lịch sử mặc định và việc đọc đợt cũ theo ID vẫn giữ nguyên.

Đã kiểm tra dữ liệu thực và API đang chạy: quản trị thấy 7 mục thay cho 13 lần tính; cố vấn lớp K46 thấy đúng **2 mục CQ22CT-MMT và CQ22CT-PM** thay cho 4. Các mục là bản tính mới nhất. Phân trang không trùng/làm mất phạm vi; 13 bản lịch sử vẫn còn và bản cũ đọc được. Bộ kiểm thử 160 đạt/1 bỏ qua; build hai ứng dụng đạt; lint các file sửa không lỗi.

## Gộp mức “Đã đánh giá một phần” vào “Bình thường” theo yêu cầu

Đã bỏ mức riêng trên nhãn và bộ lọc sinh viên. Bộ đánh giá mới trả `NORMAL` khi các tiêu chí đánh giá được chưa phát hiện nguy cơ và phạm vi đánh giá còn một phần; phiên bản máy đánh giá tăng lên v9. Các trạng thái `MONITORING`, `HIGH_RISK`, `VERIFY_REQUIRED`, `INSUFFICIENT_DATA` giữ nguyên.

Kết quả cũ `PARTIAL_NO_RISK` được quy về `NORMAL` khi đọc danh sách, hồ sơ, lịch sử cảnh báo, báo cáo, dashboard và hồ sơ can thiệp. Bộ lọc “Bình thường” gồm cả nhóm cũ, thống kê cộng nhóm này vào Bình thường. Mã lọc cũ được chấp nhận như bí danh tương thích; không hiển thị mức riêng. Không sửa/xóa bản ghi lịch sử: `regulatoryCoverage`, `ruleResults`, lý do và tiêu chí chưa đủ dữ liệu vẫn nguyên vẹn để xem chi tiết. Không cần tính lại đợt cũ để đổi nhãn.

Kiểm chứng `2246A003`: API đang chạy trả `NORMAL`/`green`, bộ lọc Bình thường của cố vấn chứa sinh viên này và 37 sinh viên của lớp ITK46A. 590 kết quả trong báo cáo không còn trả trạng thái riêng `PARTIAL_NO_RISK`. So sánh trước/sau xác nhận lịch sử điểm đánh giá và bằng chứng không đổi. 176 kiểm thử: 175 đạt, 1 bỏ qua theo điều kiện, không lỗi; typecheck/build hai ứng dụng đạt; lint không lỗi. Bố cục giữ nguyên, nhãn nhóm được gộp sử dụng màu xanh của Bình thường.

## Nhãn chữ thuần và thao tác trong bảng

Theo yêu cầu mới, các nhãn trạng thái, mức cảnh báo, loại học phần, kỳ hoàn thành, lớp, giới tính và số lượng chuyển sang chữ thuần: bỏ nền, viền, bo góc, icon và chấm trang trí. Dùng thành phần `TextLabel` chung để giữ màu chữ theo trạng thái và tránh tái xuất hiện khung từ các bảng màu cũ. Áp dụng đồng bộ tại danh sách/hồ sơ sinh viên, cảnh báo, tốt nghiệp, tiến độ, đào tạo và các nhãn tương tự ở màn hình quản trị.

Thao tác trong bảng như Hồ sơ, Chi tiết, Bảng điểm dùng chữ có phản hồi gạch chân khi rê chuột và chỉ báo focus khi dùng bàn phím. Thao tác trước đây chỉ có icon và tiêu đề nay có tên bằng chữ. Bộ lọc trạng thái bỏ khung/icon, đánh dấu lựa chọn bằng gạch chân và `aria-pressed`. Nút xóa từng bộ lọc vẫn thực hiện được; không thay đổi dữ liệu, thuật toán hay API.

Kiểm chứng: frontend typecheck và production build đạt; lint 0 lỗi (19 cảnh báo hiện có); diff không lỗi khoảng trắng. Render bốn mức cảnh báo và chín bảng học kỳ của dữ liệu mẫu xác nhận nhãn không còn nền/viền/icon. HK2 vẫn 16/16 TC, Đạt kỳ; dữ liệu đầu vào không đổi. Công cụ trình duyệt không có browser khả dụng trong phiên này, nên kiểm chứng bằng render HTML và build, chưa kiểm tra ảnh chụp trình duyệt.

## Căn giữa các cột bảng theo yêu cầu

Rà soát 36 bảng viết trực tiếp và thành phần DataTable dùng chung cho danh sách sinh viên, hàng đợi/lịch sử can thiệp. Căn giữa tiêu đề, dữ liệu, các cụm số liệu và nút thao tác. Các cột tên/mã sinh viên và tên/mã học phần giữ căn trái, bao gồm cột gộp tên và MSSV. Nội dung dạng flex, nhóm trạng thái nhiều dòng và thanh tiến độ được căn theo cùng cột. Các hàng mở rộng chứa màn hình chi tiết giữ bố cục riêng.

Bổ sung tiêu đề Thao tác còn thiếu ở bảng quyết định trong hồ sơ sinh viên để đủ bảy tiêu đề tương ứng bảy ô dữ liệu. Kiểm tra toàn bộ khai báo ô bảng đạt (70 ô tiêu đề/dữ liệu nhận diện căn trái, 366 ô căn giữa). Render bảng sinh viên đủ bốn mức cảnh báo xác nhận hai cột nhận diện căn trái, sáu cột còn lại căn giữa ở cả tiêu đề và nội dung; render chín bảng học kỳ vẫn đạt và HK2 giữ 16/16 TC. Typecheck, production build, diff check đạt; lint 0 lỗi, 19 cảnh báo hiện có.

## Bỏ chức năng rà soát tiến độ trùng trong Dự kiến tốt nghiệp

Gỡ nút chuyển giữa “Góc nhìn tốt nghiệp” và “Rà soát tiến độ CTĐT”, cùng phần hiển thị, bộ lọc và trạng thái riêng của chế độ rà soát. Các đợt đã chọn sử dụng bảng đánh giá điều kiện tốt nghiệp; giữ nhóm đối tượng, bộ lọc trạng thái dạng combo box, bộ lọc lớp/tên, chi tiết sinh viên, bảng điểm và xuất báo cáo. Nhãn tổng sinh viên và tiêu đề bảng dùng chung cho các nhóm khóa. Chức năng tiến độ đào tạo tiếp tục ở tab Tiến độ đào tạo.

Kiểm chứng: frontend typecheck và production build đạt; lint file sửa không lỗi (một cảnh báo `formatNumber` đã có từ trước); kiểm tra căn cột của 35 bảng còn lại đạt. Trang `/graduation-forecast` đang chạy trả HTTP 200; bundle mới không còn chế độ rà soát, vẫn có bảng tốt nghiệp, combo box trạng thái và nút xuất Excel/PDF. Không thay đổi API, bản ghi đánh giá hay lịch sử điểm.

## Bù nợ tự chọn theo CTĐT K44 và loại SHCD khỏi tỷ lệ không đạt — v10

Danh sách môn tự chọn được đối chiếu trang 23–30 của CTĐT K44: A6, A7, B3 dùng chung; B2 theo từng chuyên ngành PM, MMT, KHDL. Chỉ môn nằm trong danh sách đúng khối mới dùng để bù; tên giống nhau hoặc mã cùng tiền tố không đủ để xác nhận thay thế. Các biến thể mã đã xác nhận dùng chung khóa tín chỉ để tránh cộng trùng, không sửa bản ghi nguồn.

Trong v10, nợ tự chọn đối chiếu theo tổng yêu cầu khối. Cách tính này đã được thay bằng v11 dưới đây sau khi người dùng bổ sung quy tắc từng học kỳ. Tín chỉ khác khối không bù được nợ; môn chưa từng học thuộc thiếu tiến độ, không tự động trở thành nợ do rớt. Môn bắt buộc vẫn phải đạt môn đó hoặc môn tương đương đã được xác nhận. Các lần F/VT được giữ nguyên; kết quả học lại ở hè chỉ giải quyết nợ tại các mốc xét từ kỳ hè đó trở đi.

Kiểm thử xác nhận SHCD 0 TC chưa có điểm không làm tỷ lệ tín chỉ không đạt bị PARTIAL. Đối chiếu dữ liệu Hán Quang Dũng tại HK2 2025–2026: tỷ lệ 18/44 = 40,91%, COMPLETE; nợ còn 21 TC (15 TC bắt buộc + 6 TC B2) thay cho 30 TC theo cách tính cũ. A6, A7, B3 đã được bù đủ. Sửa tiêu đề và đơn vị hiển thị nợ tín chỉ, giữ bố cục giao diện.

Người dùng đã xác nhận đúng 19 TC thuộc Nguy cơ cao. Bộ đánh giá v10 áp dụng ngưỡng theo dõi nội bộ: 13–18 TC Cần chú ý; từ 19 TC Nguy cơ cao. Ngưỡng quy chế QĐ600 >24 TC được giữ riêng trong kết quả đối chiếu. Nếu nợ vượt cả hai ngưỡng, chỉ hiển thị một lý do nợ theo quy chế để tránh trùng, nhưng vẫn lưu cả hai kết quả đánh giá. Nợ chưa đủ dữ liệu lịch sử không bị đưa vào phân loại nội bộ.

Đã tính lại 40 đợt ở 8 học kỳ chính, tạo 2.730 kết quả mới, không có đợt lỗi; học kỳ hiện tại không bị đổi. Hán Quang Dũng tại HK2 2025–2026: 21 TC nợ, mức Nguy cơ cao theo ngưỡng nội bộ 19; chưa vượt ngưỡng QĐ600 24. Tỷ lệ không đạt 18/44 được đánh giá đầy đủ. So sánh hash trước/sau xác nhận 31.141 lượt học và 31.141 bản ghi điểm không đổi, 282 đợt cũ và toàn bộ kết quả cũ vẫn còn nguyên.

212 kiểm thử backend: 211 đạt, 1 bỏ qua, không lỗi; bao gồm các mốc 12/13/18/19/24/25 và tái dùng đúng phiên bản máy đánh giá. Lint/typecheck và production build cả hai ứng dụng đạt. API hồ sơ sinh viên, chi tiết can thiệp và bundle trang Cảnh báo học tập đang chạy đã xác nhận ngưỡng 19 và kết quả 21 TC. Chỉ sửa nội dung nhãn/căn cứ cho ngưỡng mới, giữ bố cục giao diện. Chưa kiểm tra bằng ảnh chụp trình duyệt trong phiên này.

## Đối chiếu nhóm lựa chọn từng học kỳ và môn đạt dư dùng bù nợ — v11

Người dùng xác nhận: đạt đủ nhóm lựa chọn của chính học kỳ thì không còn nợ môn tự chọn từng rớt trong nhóm đó. Nợ của một nhóm = min(tín chỉ chưa đạt chưa học lại đạt, max(0, yêu cầu nhóm trong học kỳ − tín chỉ đã đạt của nhóm)). Thiếu môn chưa từng học vẫn là thiếu tiến độ, không tự tạo nợ do rớt.

Bù nợ học kỳ khác chỉ dùng môn đã đạt thuộc đúng danh sách và khối CTĐT K44, có nguyên số tín chỉ của môn nằm trong phần dư của nhóm lựa chọn và tổng phần dư của học kỳ chuẩn. Mỗi môn chỉ dùng bù một lần; không lấy tín chỉ đang đáp ứng kế hoạch để bù, không lấy tín chỉ khác khối, không tạo phần dư từ điểm pending hoặc VT. Khi có nhiều lựa chọn hợp lệ, phân bổ để giải quyết nhiều nợ nhất trong giới hạn tín chỉ dư, ưu tiên khoản nợ cũ và lưu rõ môn/nhóm làm căn cứ.

Học hè đạt lại môn tương ứng giải quyết nợ môn đó trực tiếp dù không có phần dư; tín chỉ vẫn thuộc học kỳ chuẩn và chỉ được công nhận một lần. Các mốc xét trước kỳ hè giữ kết quả cũ. Snapshot v11 lưu yêu cầu, số đã đạt, phần dư từng học kỳ, phần nợ của từng nhóm và từng môn dùng bù. Thiếu kế hoạch hoặc mâu thuẫn danh mục giữ trạng thái cần đối soát, không tự bù.

Đã tính lại 40 đợt, 2.730 kết quả của 8 học kỳ chính, không có đợt lỗi. Hán Quang Dũng: 23 TC nợ (15 TC bắt buộc + 6 TC B2 HK7 + 2 TC B2 HK8); HK4 dư 3 TC A7 bù HK3, HK5 dư 3 TC B3 bù Python HK6. Không dùng phép 25 − 19 toàn khối của v10 thay cho đối chiếu học kỳ. Tỷ lệ không đạt vẫn 18/44 = 40,91%. Bố cục giữ nguyên, nhãn giải thích đã cập nhật.

223 kiểm thử: 222 đạt, 1 bỏ qua, không lỗi. Lint và production build hai ứng dụng đạt. API hồ sơ sinh viên, chi tiết can thiệp và bundle Cảnh báo học tập đang chạy xác nhận kết quả mới 23 TC, ngưỡng 19 và quy tắc bù. So sánh trước/sau xác nhận 31.141 lượt học, 31.141 bản ghi điểm và toàn bộ kết quả của 322 đợt cũ không đổi. Chưa kiểm tra bằng ảnh chụp trình duyệt trong phiên này.

## Khuyến nghị học lại và danh sách môn tự chọn thay thế

Trong chi tiết Dự kiến tốt nghiệp, môn bắt buộc chưa đạt hiển thị “Cần học lại”; môn tự chọn chưa đạt hiển thị “Cần học lại hoặc học các môn sau: chi tiết”. Liên kết chữ “chi tiết” mở/đóng danh sách ngay dưới dòng học phần, áp dụng cả khi chỉ có một yêu cầu cần xử lý. Danh sách gồm mã, tên và số tín chỉ theo CTĐT K44, cùng khối A6/A7/B2/B3; B2 giới hạn đúng chuyên ngành. Môn đang xem được loại khỏi danh sách thay thế vì lựa chọn học lại đã có trong khuyến nghị. Không suy luận môn thay thế chỉ từ tên giống nhau.

API chi tiết bổ sung danh sách từ nguồn CTĐT đã đối chiếu, không ghi lại điểm hay kết quả đánh giá. Danh sách lựa chọn không tự công nhận tín chỉ bù; quy tắc tín chỉ dư và học hè vẫn áp dụng theo v11. Trường hợp chưa xác minh được khối/chuyên ngành hiển thị thông báo tương ứng.

Kiểm chứng: 225 kiểm thử backend (224 đạt, 1 bỏ qua), typecheck và production build cả hai ứng dụng đạt. Lint phần sửa không lỗi (ForecastDetail còn một cảnh báo unused đã có trước). API production thử nghiệm trả 200 cho Hán Quang Dũng; render xác nhận 10 liên kết tự chọn, danh sách A7 có 4 môn thay thế, trường hợp chỉ một môn vẫn có liên kết và bản ghi đánh giá không đổi. Chưa kiểm tra thao tác chạm bằng trình duyệt trong phiên này.

### Chỉ đề xuất môn sinh viên chưa học

Theo yêu cầu bổ sung, danh sách trên đã được lọc theo toàn bộ lịch sử học phần hiện có của từng sinh viên, bao gồm môn đạt, F/VT, đang học/chờ điểm và lượt học chưa có bản ghi điểm. Đối chiếu cả lịch sử ở snapshot và các lượt học hiện tại để không đề xuất lại môn đã học sau đợt đánh giá. Các mã tương đương đã xác nhận được chuẩn hóa bằng cùng quy tắc khối K44. Kết quả đánh giá và lịch sử điểm không bị thay đổi.

Nếu không còn môn chưa học cùng khối, hiển thị “Không còn môn tự chọn chưa học trong khối này. Cần học lại môn chưa đạt.” thay cho bảng trống. Kiểm tra dữ liệu Hán Quang Dũng xác nhận không còn môn A7 chưa học để đề xuất cho 20QT0001; cả 5 ứng viên còn lại ở các khối khác đều chưa xuất hiện trong lịch sử học. 227 kiểm thử backend (226 đạt, 1 bỏ qua), typecheck và lint phần sửa đạt; kiểm chứng thông báo danh sách trống bằng render HTML và bản ghi đánh giá giữ nguyên.

## Đồng bộ Lịch sử xử lý và Dòng thời gian hồ sơ hợp nhất

Hai API dùng chung bộ đọc sự kiện WarningActionEvent và thông tin người thực hiện. Dòng thời gian hồ sơ lấy đầy đủ sự kiện từ tất cả hồ sơ can thiệp của chính sinh viên, bao gồm hồ sơ đã hoàn tất, thay vì chỉ nhật ký workflow cũ. Hai giao diện dùng chung tên sự kiện, nội dung, màu mức nguy cơ và định dạng thời điểm; thông tin học kỳ/GPA được đối chiếu đúng nguồn của từng sự kiện, không thay bằng kết quả quét mới nhất. Giữ thứ tự thời gian và ID ổn định khi nhiều sự kiện trùng thời điểm.

Kết quả quét đã có sự kiện phát hiện cảnh báo/thay đổi nguy cơ không được thêm một lần nữa vào dòng thời gian. Những kết quả chưa có sự kiện, quyết định học vụ và hỗ trợ cũ vẫn được giữ. Kết quả Bình thường/Chưa đủ dữ liệu được ghi đúng trạng thái, khắc phục cách hiển thị mọi mức không đỏ thành cảnh báo Vàng. Gỡ toàn bộ bảng “Lịch sử các đợt quét cảnh báo của sinh viên” khỏi giao diện; không xóa lịch sử nguồn.

Kiểm chứng trên Hán Quang Dũng: 27 sự kiện của Lịch sử xử lý trùng hoàn toàn dữ liệu và nội dung hiển thị tương ứng trong dòng thời gian 31 sự kiện (có thêm kết quả học vụ khác). ID không trùng; các hồ sơ và bản ghi sự kiện trước/sau không đổi. 231 kiểm thử (230 đạt, 1 bỏ qua), production build cả hai ứng dụng đạt; lint phần sửa không lỗi, còn cảnh báo unused đã có trước. Chưa kiểm tra bằng ảnh chụp trình duyệt trong phiên này.

## Học kỳ đang học theo đăng ký thực tế

Tách học kỳ đang học khỏi mốc chuẩn của khóa trong API tiến độ và giao diện dùng chung ở hồ sơ sinh viên/Tiến độ đào tạo. Học phần đang học cần có lượt học thuộc đúng học kỳ/năm học hiện tại, còn chờ kết quả; lượt đăng ký chưa có bản ghi điểm cũng được nhận diện. Điểm chưa chốt của kỳ cũ, môn VT và các môn điều kiện không tự xác định học kỳ đang học. Sinh viên học lại/cải thiện hoặc học các môn ở nhiều học kỳ CTĐT có thể có nhiều nhóm đang học cùng lúc. Lịch sử F và tín chỉ đã đạt được giữ nguyên.

API trả cờ isCurrentlyStudying từng học phần và studyingSemesterNos. Nhãn Đang theo học dùng các cờ này; mốc chuẩn của khóa không tự sinh trạng thái đang học. Học kỳ chuẩn chưa đăng ký hiển thị Chưa đăng ký. Thông tin tóm tắt ghi rõ Mốc chuẩn của khóa và nhóm học phần Đang học; bỏ câu mặc định sinh viên đang học tại mốc chuẩn. Các phép tính tín chỉ đến hạn, thiếu môn bắt buộc và chậm tiến độ vẫn dựa trên mốc khóa.

Kiểm chứng Lâm Anh Vỹ (2246A001): HK1 2026–2027 có 6 học phần thuộc HK7, 18 TC; API và render HTML hiển thị Năm 4 – HK1 đang theo học, HK9 Chưa đăng ký. Mốc chuẩn vẫn HK9; toàn bộ summary và số liệu scheduleProgress trước/sau giữ nguyên (ngoài các cờ mới). 235 kiểm thử (234 đạt, 1 bỏ qua), typecheck và production build cả hai ứng dụng đạt. Lint phần sửa không lỗi, còn 10 cảnh báo unused đã có trước ở thành phần giao diện. Chưa kiểm tra bằng ảnh chụp trình duyệt trong phiên này.

## Gộp bảng điểm trong hồ sơ chi tiết sinh viên

Gỡ toàn bộ giao diện Điểm học phần cũ cùng bộ lọc/trạng thái riêng. Nội dung Kế hoạch đào tạo chuyển sang vị trí “3. Bảng điểm”, giữ các bảng học kỳ, điểm hệ 10/hệ 4, điểm chữ và kỳ hoàn thành. Các tab còn lại đánh số liên tục, Cảnh báo học vụ thành mục 7. Gỡ yêu cầu tải danh mục CTĐT không còn được sử dụng trong trang hồ sơ.

Thành phần bảng học kỳ có chế độ transcript dành cho hồ sơ, ẩn toàn bộ khối “Tiến độ đào tạo đến mốc” và bảng môn bắt buộc thiếu đi kèm. Chế độ mặc định tại chức năng Tiến độ đào tạo vẫn giữ khối này. Render với dữ liệu Lâm Anh Vỹ xác nhận 9 bảng học kỳ và các dòng điểm giống nhau giữa hai chế độ; hồ sơ chỉ còn một giao diện Bảng điểm, vẫn hiển thị HK7 đang học 18 TC và HK9 Chưa đăng ký. Typecheck, production build và diff check đạt; lint không lỗi (10 cảnh báo unused đã có trước). Không thay đổi dữ liệu học tập.
## Kiểm chứng bản đang chạy: học kỳ thực học của Lâm Anh Vỹ

Ảnh người dùng cho thấy HK9 vẫn “Đang theo học” dù chưa đăng ký. Kiểm tra trực tiếp API ở cổng 3001 và API qua frontend cổng 3000 xác nhận cả hai còn trả dữ liệu cũ: thiếu `studyingSemesterNos` và `isCurrentlyStudying`, HK7 là `PAST_COMPLETED`, HK9 là `CURRENT_STUDYING`. Tiến trình backend đã chạy từ 13:26, trước bản dựng sửa lúc 14:04. Kiểm chứng trước đó bằng service và render riêng chưa phản ánh tiến trình đang chạy này.

Đã xác nhận tiến trình thuộc Next backend của workspace, dừng đúng tiến trình cổng 3001 và khởi động lại với bản dựng mới. Kiểm chứng sau khởi động: cả API trực tiếp và API qua frontend trả `studyingSemesterNos: [7]`; HK7 có 6 môn đang học, 18 TC; HK9 trả `CURRENT_PLAN`, “Chưa đăng ký”, không có môn đang học. Mốc chuẩn của khóa vẫn HK9, các chỉ số tiến độ và dữ liệu nguồn giữ nguyên.

Trang hồ sơ đang phục vụ bundle có logic thực học mới. Render component Bảng điểm bằng dữ liệu lấy từ cả hai API đang chạy xác nhận HK7 “Đang theo học” và HK9 “Chưa đăng ký”, không còn “Đang theo học” ở HK9. Bằng chứng: `.codex-qa/text-labels/lam-runtime-verification.json`. Không thay đổi code nghiệp vụ trong lần xử lý này; chưa kiểm chứng bằng ảnh chụp trình duyệt.

## Trạng thái chưa đăng ký trong Bảng điểm

Đối chiếu lại API đang chạy và các lượt học nguồn của Lâm Anh Vỹ: HK7 có sáu lượt đăng ký trong HK01 2026–2027; toàn bộ bảy môn HK8 và hai môn HK9 có `attemptCount = 0`, không có lượt học nguồn. Nhãn “Nợ môn bắt buộc” của HK8 là kết quả đánh giá theo mốc chuẩn HK9, không phải trạng thái đăng ký.

Trong chế độ Bảng điểm, học kỳ có học phần học thuật nhưng chưa có lượt đăng ký nào hiển thị “Chưa đăng ký”; từng môn có số lượt học bằng 0 cũng hiển thị “Chưa đăng ký”, kể cả môn bắt buộc và tự chọn. Không suy ra trạng thái đăng ký chỉ từ thứ tự học kỳ: học vượt, học lại và môn có kết quả vẫn được thể hiện theo dữ liệu thực tế. Chế độ Tiến độ đào tạo giữ nguyên nhãn nợ và mốc của khóa.

Typecheck, production build và lint không lỗi (10 cảnh báo unused đã có trước). Render Bảng điểm từ cả API backend và API qua frontend xác nhận HK8 có ba nhãn học kỳ cùng bảy môn “Chưa đăng ký”, không còn “Nợ môn bắt buộc”, “Nợ chưa học”, “Không chọn”; HK7 vẫn đang học 18 TC, HK9 chưa đăng ký. Render Tiến độ đào tạo vẫn có nhãn nợ HK8. Bundle trang hồ sơ đang phục vụ chứa logic mới. Dữ liệu nguồn chỉ được đọc; bằng chứng nguồn lưu tại `.codex-qa/text-labels/lam-next-semesters-source.json`.

## Đồng bộ Bảng điểm và Tiến độ đào tạo; mốc học riêng theo K47

Theo yêu cầu bổ sung, trạng thái học kỳ và học phần chưa có đăng ký dùng chung ở cả hai giao diện, không còn phụ thuộc chế độ transcript/progress. Phần tổng quan tiến độ vẫn chỉ có ở Tiến độ đào tạo. Gỡ cách ghép nhãn tạo “Chậm Chậm 34 TC”.

Nguồn API có lớp hành chính ITK46A và CTĐT CQ22CT-PM, chưa chứa trường xác nhận khóa đang theo học K47. Không suy diễn đổi mốc chỉ vì đăng ký môn học lại. Bổ sung hai trường nullable `students.progress_cohort_code`, `progress_cohort_from_year` qua migration `20261007000000_student_progress_cohort`. Dựa trên thông tin người dùng xác nhận, cấu hình riêng sinh viên 2246A001 theo K47 từ 2026–2027 bằng script `apps/backend/scripts/set-student-progress-cohort.ts` (mặc định chỉ kiểm tra, cần `--apply` mới ghi). Lớp, khóa hành chính và CTĐT không đổi; các sinh viên không được cấu hình vẫn dùng mốc cũ.

API chi tiết hồ sơ, API chi tiết tiến độ và danh sách/KPI tiến độ dùng mốc kế hoạch đã xác nhận. Hiển thị “Mốc kế hoạch đang theo học (K47): Năm 4 - HK1 (Học kỳ 7)”, vẫn lưu mốc hành chính HK9 để đối chiếu. Các lần tính cảnh báo tiến độ sau mốc hiệu lực cũng dùng kế hoạch này; kỳ trước 2026–2027 giữ mốc cũ. Không tính lại hay sửa lịch sử các đợt đã lưu.

Kết quả Lâm Anh Vỹ: mốc đến hết HK6, kế hoạch tối thiểu 92 TC, đạt 98 TC, không có môn bắt buộc đến hạn còn thiếu; `ON_TRACK`, nợ tiến độ 0. HK7 vẫn đang học sáu môn/18 TC; HK8 và HK9 chưa đăng ký. Không còn “Chậm 34 TC”, “-34 TC” hay bảng năm môn đến hạn. Hash toàn bộ lượt học và điểm trước/sau xác nhận nguồn không đổi; chỉ cấu hình mốc học riêng cho sinh viên này.

238 kiểm thử backend: 237 đạt, 1 bỏ qua, không lỗi. Có kiểm thử mốc hiệu lực, không tự đổi mốc do học lại, học theo K47 nhưng giữ K46, và vẫn phát hiện môn bắt buộc rớt ở kỳ đã đến hạn. Production build hai ứng dụng đạt. Kiểm chứng runtime: hai API chi tiết trả cùng dữ liệu, chín bảng học kỳ giữa hai chế độ giống nhau, danh sách/KPI trả đúng `ON_TRACK`, bundle của cả `/students/[id]` và `/training-progress` có logic mới. Bằng chứng `.codex-qa/text-labels/lam-aligned-progress-cohort.json`. Chưa kiểm chứng bằng ảnh chụp trình duyệt.

## Áp dụng cơ chế nhận diện lịch học cho mọi sinh viên

Theo yêu cầu áp dụng ngoài trường hợp Lâm Anh Vỹ, bổ sung hàm thuần `inferStudentProgressCohort` dùng danh mục CTĐT và chuỗi đăng ký để nhận diện lịch học lệch năm. Cấu hình thủ công có ưu tiên; học lại một số môn không tự dịch mốc. Mốc suy ra được ghi rõ là theo chuỗi đăng ký, không coi là thông tin chuyển lớp chính thức. Lịch đã nhận diện vẫn dùng được khi chưa đăng ký kỳ mới hoặc đang học lại; lịch mới bắt kịp khóa hành chính thay thế mốc suy ra cũ. Hồ sơ, Tiến độ đào tạo, danh sách/KPI và bộ tính tín hiệu cảnh báo dùng chung hàm.

Rà soát 625 hồ sơ chưa xóa: ba lịch học riêng gồm Lâm Anh Vỹ (K47 đã cấu hình), Cao Văn Linh và Hà Thị Trung (mốc HK5 tương ứng K48 được suy ra). Năm trường hợp chỉ học lại giữ mốc cũ. Cao Văn Linh vẫn thiếu 3 TC tự chọn; Hà Thị Trung vẫn còn tám môn bắt buộc chưa đạt ở các kỳ trước. Không tự xóa thiếu hụt thực tế hay đổi tất cả về Đúng tiến độ. Chi tiết tại `docs/STUDY_SCHEDULE_AUDIT_2026-10-07.md`.

248 kiểm thử backend: 247 đạt, một bỏ qua, không lỗi; production build hai ứng dụng đạt. API đang chạy được kiểm chứng cho cả tám trường hợp: chi tiết và danh sách đồng bộ, bảng học kỳ giữa hai giao diện giống nhau. Hash xác nhận không thay đổi sinh viên, lượt học, điểm hoặc lịch sử cảnh báo; không ghi thêm cấu hình riêng cho hai trường hợp suy ra tự động. Bằng chứng `.codex-qa/text-labels/general-progress-runtime.json`.
