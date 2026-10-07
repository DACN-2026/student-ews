# Rà soát chức năng và đối chiếu nghiệp vụ ngày 06/10/2026

## Kết luận

**Cập nhật sau xác nhận nghiệp vụ của người dùng:** K50 ngoài phạm vi dữ liệu; học kỳ hiện tại của hệ thống chính xác; CTĐT K44 là chuẩn áp dụng từ K44 đến nay; ngoại ngữ do quy trình ngoài hệ thống xử lý; VT là chưa đạt, không tích lũy; học lại hè đạt D được công nhận học phần nhưng phải giữ lịch sử F; chuyên ngành bắt đầu từ HK2 năm 3. Các kết luận bên dưới đã được điều chỉnh theo các xác nhận này.

**Cập nhật sau đối chiếu API thật:** xem [báo cáo nguồn API](API_DATA_AUDIT_2026-10-06.md). Đã phát hiện thêm ba môn GDQP bị gộp do khóa nguồn trống, mã môn hợp lệ bị loại khi gộp CTĐT theo tên và MobilePhone có ở nguồn nhưng chưa hiển thị. Hồ sơ `2347A052` có ba đăng ký pending khi truy vấn mã PM/MMT; không còn được mô tả là nguồn hoàn toàn không có dữ liệu học tập.

**Chốt thêm về chứng chỉ:** đủ các học phần GDQP và 3 TC GDTC được công nhận thì đạt các mục chứng chỉ tương ứng trong Dự kiến tốt nghiệp. Bảng StudentGraduationRequirement rỗng không còn là điều kiện ngăn công nhận khi bảng điểm đủ căn cứ. Xem [phương án sửa](IMPLEMENTATION_PLAN_2026-10-06.md).

Hệ thống có nền tảng tra cứu, phân quyền, lưu kết quả cảnh báo và quản lý can thiệp. Tuy nhiên, chưa nên dùng các nhãn hiện tại để xác nhận sinh viên đúng tiến độ hoặc đủ điều kiện tốt nghiệp mà không kiểm tra bằng chứng kèm theo.

| Nội dung | Kết luận hiện tại |
| --- | --- |
| Dữ liệu kế hoạch giảng dạy 2026–2027 | 12 kế hoạch K46–K49 có danh sách môn, tín chỉ và mức tự chọn khớp phần tương ứng của PDF; K50 ngoài phạm vi; không yêu cầu K48 chọn chuyên ngành trước HK6 |
| Bộ tính Tiến độ đào tạo | Có lỗi lùi mốc học kỳ, thiếu trạng thái chưa xác định và dùng định mức của nhiều khóa trong cùng năm học làm định mức cho mọi khóa |
| Dự kiến tốt nghiệp theo CTĐT K44 | Chuẩn 150/104/46 áp dụng theo xác nhận của người dùng; bộ tính hiện chưa giải quyết được cấu hình chuẩn này cho chương trình đang có, còn lỗi VT, fallback 145 và độ bao phủ rèn luyện; ngoại ngữ ngoài phạm vi |
| Cảnh báo theo QĐ600 | Ngưỡng Điều 18 đã khớp; chỉ đánh giá một phần. Nợ đọng trên 24 tín chỉ, kết quả hè, học kỳ đầu thực tế và các điều kiện buộc thôi học chưa được xử lý đầy đủ |
| Giáo viên nắm tình hình sinh viên | Có bảng điểm và hồ sơ can thiệp, nhưng mốc đánh giá, lịch sử học lại, thông tin liên hệ, trạng thái học vụ và mức tin cậy kết luận cần hoàn thiện |

Đây là báo cáo kiểm tra. Không sửa mã nghiệp vụ, không ghi/xóa dữ liệu học vụ, không chạy lại các đợt đánh giá và không gửi thông báo.

## Phạm vi và bằng chứng

- Đọc mã frontend, backend, schema, các luồng phân quyền/phiên, báo cáo, tiến độ, tốt nghiệp và can thiệp.
- Đọc trực tiếp PDF: toàn bộ 7 trang kế hoạch giảng dạy; các mục khung CTĐT, kế hoạch học kỳ, điều kiện tốt nghiệp và chuẩn ngoại ngữ của CTĐT K44; các trang chứa Điều 15–18, Điều 25 của QĐ600. PDF QĐ600 là ảnh scan, được kiểm tra trên ảnh gốc.
- Truy vấn chỉ đọc cơ sở dữ liệu hiện tại; chạy service tiến độ cho toàn bộ 625 sinh viên; tái hiện các trường hợp biên bằng hàm nghiệp vụ hiện có.
- Chạy `npm test`, `npm.cmd run typecheck`, `npm.cmd run lint`.
- Chưa kiểm thử thao tác trình duyệt có xác thực cho từng vai trò, chưa chạy import ghi dữ liệu hay build production. Frontend/backend không chạy ở cổng 3000/3001 lúc bắt đầu rà soát.

Nguồn gốc:

1. [Kế hoạch giảng dạy 2026–2027](<2026-Ke-hoach-giang-day-nh-26-27 (1).pdf>).
2. [CTĐT CNTT K44](2020_CTDT_K44.pdf).
3. [QĐ600 ban hành quy chế đào tạo](Quyet-dinh-so-600-QD-DHDL-ve-viec-ban-hanh-Quy-che-dao-tao-trinh-do-dai-hoc-cua-Truong-Dai-hoc-Da-Lat-VER1.pdf).

Số trang PDF dưới đây tính từ trang đầu của tệp; số trang in của QĐ600 và K44 có thể khác.

## 1. Tiến độ đào tạo

### 1.1 Đối chiếu kế hoạch năm học với dữ liệu đang lưu

| Khóa / CTĐT | HK năm học / HK lộ trình | TC học thuật tối thiểu trong PDF | Tự chọn | Dữ liệu hiện tại |
| --- | --- | ---: | --- | --- |
| K49 / CQ25CT | HK01 / 3 | 18 | Đại cương 6; GDTC 3 riêng 1 TC | Khớp danh sách môn và nhóm; locked |
| K49 / CQ25CT | HK02 / 4 | 16 | Đại cương 3 | Khớp; locked |
| K48 / CQ24CT | HK01 / 5 | 16 | 3/6 TC | Khớp; locked |
| K48 / CQ24CT-MMT | HK02 / 6 | 17 | Bổ trợ 3; chuyên ngành 4/12 | Khớp; locked |
| K48 / CQ24CT-PM | HK02 / 6 | 19 | Bổ trợ 3; chuyên ngành 6/9 | Khớp; locked |
| K48 / CQ24CT-KHDL | HK02 / 6 | 16 | Bổ trợ 3; chuyên ngành tối thiểu 3/11 | Khớp danh sách và mức tối thiểu; draft |
| K47 / CQ23CT-MMT, CQ23CT-PM | HK01 / 7 | 18 | Chuyên ngành 9/12 | Khớp; locked |
| K47 / CQ23CT-MMT | HK02 / 8 | 18 | Chuyên ngành 12/15 | Khớp; locked |
| K47 / CQ23CT-PM | HK02 / 8 | 18 | Chuyên ngành 12/16 | Khớp; locked |
| K46 / CQ22CT-MMT, CQ22CT-PM | HK01 / 9 | 18 | Không có; thực tập 8 + đồ án 10 | Khớp; locked |

K50 có trong trang 1 PDF nhưng ngoài phạm vi dữ liệu hệ thống theo xác nhận của người dùng. Không cần tạo chương trình hay sinh viên K50 để hoàn thiện chức năng hiện tại.

**Lưu ý văn bản gốc:** bảng KHDL trang 4 ghi tổng `16/24`, các môn lựa chọn là 4+3+4=11 TC; ghi chú yêu cầu tối thiểu 3/11. Comment trong mã và tài liệu `ke-hoach-dao-tao-2026-2027.md` còn ghi `16/21`, cần sửa phần dẫn nguồn. Mức tối thiểu 16 TC và nhóm 3 TC hiện tại vẫn phù hợp ghi chú.

### F01 — P1: Mốc đối chiếu cá nhân có thể đổi theo môn đăng ký/chưa có điểm

**Vị trí:** [student-training-progress.ts](../apps/backend/lib/services/student-training-progress.ts), dòng 581–604; phần service nhận diện học kỳ từ đăng ký hiện tại cũng cần rà soát.

Học kỳ hiện tại của hệ thống là chính xác; không phát hiện cấu hình năm học/kỳ hiện tại sai. Vấn đề riêng là hàm có thể đổi **mốc đối chiếu lộ trình cá nhân** theo học kỳ CTĐT có nhiều môn `NO_SCORE` và theo môn đăng ký. Mốc này quyết định các kỳ được xem là đã kết thúc và những môn bị coi là nợ. Nếu sinh viên thực tế đang theo lộ trình chậm hơn khóa, mốc khác khóa có thể có ý nghĩa; không được kết luận sai chỉ từ sự khác biệt đó.

Tái hiện: sinh viên K48, mốc chuẩn HK5, chỉ có một học phần HK1 đang pending và chưa đạt các môn HK1–HK4. Kết quả mặc định thành HK1, kỳ vọng 0 TC, `ON_TRACK`. Giữ mốc bằng `lockTimeline:true` cho ra HK5, thiếu 12 TC, `BEHIND`.

Dữ liệu thật có **11 sinh viên** có mốc khác mốc tính từ khóa: 1 từ 9→5, 4 từ 9→7, 3 từ 7→5, 2 từ 5→2 và 1 từ 3→1. Đây không phải 11 học kỳ hiện tại bị cấu hình sai và không chứng minh cả 11 kết luận sai. Luồng cảnh báo lịch sử dùng `lockTimeline:true`, nên cần làm rõ ý nghĩa hai mốc. Ví dụ K47 `2347A049` hiện đăng ký các môn HK5; không tự quy trường hợp này thành lỗi hoặc thiếu chuyên ngành.

**Đề xuất:** hiển thị riêng kỳ hiện tại của hệ thống, mốc theo khóa và kỳ học phần đang theo học. Quy ước rõ nhãn “đúng tiến độ” đang đối chiếu với mốc nào; tránh môn học lại tự làm mất các yêu cầu quá hạn của mốc chuẩn.

### F02 — P0: Chưa đủ cấu hình vẫn trả “Đúng tiến độ”

**Vị trí:** [student-training-progress.ts](../apps/backend/lib/services/student-training-progress.ts), dòng 488–538 và 695–703.

Hàm chỉ có `ON_TRACK`/`BEHIND`; các cảnh báo thiếu danh mục hoặc thiếu định mức nhóm không chặn nhãn đúng tiến độ. Tái hiện với CTĐT rỗng cho kết quả `ON_TRACK`, đồng thời trả cảnh báo “CTĐT chưa có danh mục”.

Trong dữ liệu thật, **625/625** kết quả chưa giải quyết được tổng TC chính thức và có ít nhất một nhóm tự chọn `UNKNOWN`; service vẫn phân thành **327 ON_TRACK / 298 BEHIND**. Thiếu tổng TC toàn khóa không tự làm sai đánh giá các môn bắt buộc đến kỳ hiện tại. Cần phân biệt đánh giá tiến độ học kỳ với hoàn thành toàn CTĐT và mức bao phủ tự chọn; không coi cả 625 sinh viên là thiếu bảng điểm.

**Ví dụ thật về thiếu cấu hình:** `2448A001 – Lý Ngọc Tùng`, lớp `ITK48A`, CTĐT `CQ24CT`, kỳ hệ thống `2026–2027/HK01`, mốc cá nhân HK5. Có 29 bản ghi đăng ký học phần và danh mục 45 môn; không phải hồ sơ rỗng. Nhưng truy vấn rule active gắn chương trình không tìm thấy `TOTAL_CREDITS`/`ELECTIVE_CREDITS`; kết quả trả `requiredCredits=null`, `remainingCredits=null`, `progressPercent=null`. Nhóm `CHUNG` có `requiredCredits=null`, `remainingCredits=null`, `status=UNKNOWN`. Service trả đúng hai thông báo thiếu tổng tín chỉ và thiếu mức tối thiểu nhóm tự chọn. Chuẩn 150/104/46 đã biết từ tài liệu/người dùng, nhưng chưa được bộ tính kết nối qua cấu hình đang dùng. Mã chung ở HK5 là phù hợp, không phải lỗi chưa chọn chuyên ngành.

**Ví dụ thật về chưa có dữ liệu học tập trong DB:** `2347A052 – Trương Anh Minh`, ITK47A, có **0 đăng ký và 0 summary**. Đối chiếu API sau đó xác định roster trả CQ23CT và truy vấn mã đó rỗng; nhưng truy vấn PM/MMT trả cùng ba đăng ký chưa có điểm HK01 2026–2027. API quyết định có tiếp nhận chuyển trường 25/06/2026. Đây là lệch mã/đối soát giữa nguồn và importer, không chứng minh Portal hoàn toàn không có dữ liệu hay sinh viên tích lũy 0 TC. Chưa đủ căn cứ tự chọn chuyên ngành hoặc suy thiếu ba năm bảng điểm trước chuyển trường.

**Sửa:** bổ sung `UNKNOWN`/`PARTIAL`, độ bao phủ và các điều kiện chưa kiểm tra. Với dữ liệu một phần có thể kết luận “đã phát hiện thiếu”; kết luận không thiếu cần đủ bằng chứng.

### F03 — P0: Dùng kế hoạch một năm của nhiều khóa làm định mức toàn khóa

**Vị trí:** [student-training-progress.ts](../apps/backend/lib/services/student-training-progress.ts), dòng 237–285, 641–648 và 1230–1233; [academic-warning-progress.ts](../apps/backend/lib/services/academic-warning-progress.ts).

Hàm hard-code HK1=13, HK2=16, HK3=18… theo PDF 2026–2027, rồi áp dụng cho các kỳ lịch sử của mọi chương trình. Tuy nhiên, HK1/HK2 trong PDF thuộc K50; HK3/HK4 thuộc K49; không phải một lộ trình lịch sử thống nhất của K46–K49. CTĐT K44 (được người dùng xác nhận là chuẩn áp dụng từ K44 đến nay) ghi HK1=16, HK2=19, HK4=20 (PDF trang 32–33), khác định mức hard-code. Cần thống nhất cách dùng CTĐT chuẩn để xét tích lũy và kế hoạch năm học để xét môn đang mở; không ghép các khóa thành một lộ trình lịch sử.

`Math.min(standard, sCredits)` còn giảm định mức khi danh mục CTĐT thiếu môn, thay vì báo dữ liệu thiếu. Chương trình chưa rõ chuyên ngành mặc định HK6=17 TC theo MMT.

**Sửa:** lấy định mức từ đúng phiên bản CTĐT, khóa, chuyên ngành và kế hoạch tại từng mốc. Thiếu định mức lịch sử phải trả chưa xác định. Đây cũng là nguồn của tín hiệu thiếu 4/12 TC trong cảnh báo, nên cần xử lý trước khi tin vào màu tiến độ.

### F04 — Điều chỉnh: 111 K48 chưa chọn chuyên ngành là phù hợp; 8 K47 cần hiểu lộ trình thực tế

111 sinh viên K48 mang `CQ24CT`, đang trước HK2 năm 3. Theo quy ước người dùng xác nhận, đây là **bình thường**, không phải 111 hồ sơ thiếu ánh xạ. Kế hoạch chuyên ngành K48 HK02 có thể được cấu hình trước khi sinh viên chọn ngành.

Còn 8 sinh viên K47 mang `CQ23CT`: theo mốc khóa là HK7, nhưng không được suy tất cả phải có chuyên ngành. `2347A049` đang đăng ký các môn HK5; 7 người còn lại không có đăng ký kỳ hiện tại trong DB; `2347A052` còn không có summary/đăng ký ở mọi kỳ. Chưa đủ căn cứ phân biệt học chậm, gián đoạn hay nguồn thiếu. **Rút kết luận “119 sinh viên thiếu ánh xạ”.** Chỉ yêu cầu ánh xạ khi sinh viên thực tế vào HK6 chuyên ngành; trước đó đối chiếu khối chung, không mặc định MMT.

### F05 — P1: Nguồn nhóm và quy tắc giữa các bộ tính chưa thống nhất

**Vị trí:** [student-training-progress.ts](../apps/backend/lib/services/student-training-progress.ts), dòng 1175–1217; [academic-warning-progress.ts](../apps/backend/lib/services/academic-warning-progress.ts), truy vấn nhóm đầu file; [graduation-evaluations.ts](../apps/backend/lib/services/graduation-evaluations.ts), dòng 175–207.

Tra cứu tiến độ lấy nhóm từ mọi kế hoạch của khóa/chương trình, không lọc locked/current và không loại archived/draft. Nó đọc rule tín chỉ theo chương trình nhưng không lọc đúng cohort và không xử lý xung đột như service tốt nghiệp. Chưa phát hiện một môn có hai mã nhóm khác nhau trong CQ25CT ở lần kiểm tra này; đây là lỗi có thể phát sinh khi sửa/phiên bản hóa kế hoạch.

**Sửa:** dùng chung bộ giải quyết phiên bản kế hoạch và rule theo phạm vi; nhóm tự chọn nên là cấu hình CTĐT có phiên bản. Kế hoạch năm học không đủ để thay thế toàn bộ yêu cầu nhóm của CTĐT.

## 2. Dự kiến tốt nghiệp

CTĐT K44 nêu tối thiểu **150 TC**, gồm **104 bắt buộc + 46 tự chọn**, không tính GDTC/GDQP; phải đủ cấu trúc khối kiến thức và các yêu cầu GDTC/GDQP. Xem PDF trang 22–23 và 44–45. Theo xác nhận của người dùng, đây là chuẩn áp dụng từ K44 đến nay, bao gồm các khóa hiện có. Ngoại ngữ được xử lý ngoài hệ thống và không đưa vào điều kiện chặn của dự kiến tốt nghiệp trong hệ thống.

### F06 — P1: Cấu hình chuẩn đã xác nhận chưa được bộ tính hiện tại giải quyết

**Vị trí:** [graduation-evaluations.ts](../apps/backend/lib/services/graduation-evaluations.ts), dòng 168–207, 1173 và 1264; [sync-apidog-graduation-evaluations.ts](../apps/backend/scripts/sync-apidog-graduation-evaluations.ts).

Cơ sở dữ liệu có 11 mã CTĐT CQ22–CQ25. Không cần tạo mã K44 chỉ để áp chuẩn chung đã xác nhận. Không có rule tín chỉ hoặc GPA gắn từng CTĐT; rule GPA toàn cục còn active nhưng mã hiện tại chủ động bỏ qua khi giải quyết ngưỡng theo chương trình. Các rule tín chỉ 150/104/46 không còn trong bảng rule hiện tại. Đây là thiếu cấu hình/kết nối chuẩn trong bộ tính, không phải thiếu căn cứ áp K44 cho các khóa mới.

**6 đợt tốt nghiệp cũ, 617 kết quả sinh viên**, lưu ngưỡng 150/104/46; ngưỡng này **phù hợp chuẩn chung người dùng xác nhận**, không phải sai vì dùng chuẩn K44. Tất cả đều `needsManualReview=true`; 542 kết quả `NOT_ELIGIBLE`, 75 `PENDING_GRADE`. Cả 6 chưa có `calculationVersion=curriculum-gap-v2`. Vấn đề cần rà tiếp là chi tiết đợt cũ có thể dựng đối chiếu theo CTĐT/kế hoạch hiện tại nhưng giữ trạng thái đã lưu, và luồng tính mới không tìm được chuẩn cấu hình.

**Sửa:** cấu hình hoặc kế thừa rõ chuẩn chung 150/104/46 và GPA theo nguồn áp dụng; vẫn kiểm tra cấu trúc nhóm/chuyên ngành. Đánh dấu phiên bản đợt và giữ snapshot để truy vết; chỉ tính lại khi đã sửa nghiệp vụ/cấu hình. Không chạy script `--force` mặc định vì có nhánh xóa kết quả cũ.

### F07 — Điều chỉnh phạm vi: ngoại ngữ xử lý ngoài hệ thống

**Vị trí:** [graduation-evaluations.ts](../apps/backend/lib/services/graduation-evaluations.ts), `REQUIRED_RULE_CODES` dòng 40–49 và phần dựng details; [ForecastDetail.tsx](../apps/frontend/components/graduation/ForecastDetail.tsx), dòng 318–330.

`FOREIGN_LANGUAGE` không nằm trong bộ điều kiện bắt buộc và frontend không hiển thị. Theo xác nhận của người dùng, đây là **chủ đích phù hợp phạm vi**, không phải lỗi. Không yêu cầu nhập chứng chỉ ngoại ngữ hay khôi phục điều kiện chặn này.

Frontend cũng loại `DISCIPLINE`/`LEGAL`; phạm vi xử lý các điều kiện này chưa được người dùng xác nhận. QĐ600 có các điều kiện ngoài tín chỉ, nhưng không tự suy hệ thống phải xử lý mọi điều kiện của quyết định tốt nghiệp chính thức.

**Đề xuất:** diễn đạt kết quả theo phạm vi dự kiến học tập của hệ thống; không yêu cầu đưa ngoại ngữ vào luồng. Các điều kiện khác chỉ triển khai nếu thuộc phạm vi nghiệp vụ được chốt.

### F08 — P0: Môn vắng thi được tính thành tín chỉ đang chờ điểm

**Vị trí:** [graduation-forecast.ts](../apps/backend/lib/services/graduation-forecast.ts), dòng 102–105.

Quy ước chính xác do người dùng xác nhận: **VT = chưa đạt, chưa hoàn thành học phần, không tích lũy tín chỉ; không phải đang chờ điểm.** Mã `hasFail` hiện chỉ nhận `scoreStatus='graded'`. Một record `isPassed=false`, `scoreStatus='special'`, mã `VT` trở thành `no_score`; tín chỉ của môn được cộng vào pending. Tái hiện môn bắt buộc 3 TC vắng thi cho ra 0 môn failed và 3 TC pending. Đây là mô tả lỗi của mã hiện tại, không phải cách hiểu nghiệp vụ của VT. Tiến độ đào tạo và cảnh báo đã có xử lý VT, nên ba luồng đang khác nhau.

**Sửa:** dùng chung quy tắc kết quả học phần. VT đã được xác nhận không đạt phải là failed; thiếu record điểm không tự chứng minh đang chờ điểm. Chỉ chuyển pending khi nguồn xác nhận trạng thái đó.

### F09 — P1: Rèn luyện “toàn khóa” có thể đủ chỉ sau một hoặc hai kỳ

**Vị trí:** [graduation-evaluations.ts](../apps/backend/lib/services/graduation-evaluations.ts), dòng 275–289 và 697–700; [ForecastDetail.tsx](../apps/frontend/components/graduation/ForecastDetail.tsx), dòng 145–149.

Số kỳ rèn luyện cần có được lấy từ `student.allPlansTotal`. Kế hoạch hiện hành chủ yếu chỉ bao phủ năm học 2026–2027; K46 chỉ có kế hoạch HK9. Vì vậy số kế hoạch không chứng minh số kỳ toàn khóa đã đánh giá. Service có thể coi một điểm kỳ là đủ dữ liệu toàn khóa và dùng trung bình các record để trình bày.

Frontend nói “yêu cầu từ 50 điểm trở lên”, trong khi backend hiện chỉ yêu cầu có dữ liệu, không áp ngưỡng đạt/rớt. Không được xác nhận điểm toàn khóa chỉ bằng số record vượt số kế hoạch.

**Sửa:** lấy kết quả toàn khóa đã công nhận, hoặc tính theo đúng quy định và đủ danh sách kỳ áp dụng; hiển thị điểm tạm tính riêng. Đồng bộ nhãn frontend với rule đã xác nhận.

### F10 — P1: Frontend tự thay ngưỡng thiếu bằng 145 TC và tự suy năm học

**Vị trí:** [graduation-forecast/page.tsx](../apps/frontend/app/(dashboard)/graduation-forecast/page.tsx), dòng 577, 626, 1147 và 1550; [ForecastDetail.tsx](../apps/frontend/components/graduation/ForecastDetail.tsx), dòng 195–204.

Thiếu ngưỡng trong snapshot thì UI dùng 145, hiển thị thành “Chuẩn CTĐT”, dùng cho bộ lọc và phần trăm hoàn thành. Các đợt cũ hiện có snapshot 150 nên không rơi vào fallback; đợt mới thiếu rule sẽ có nguy cơ rơi vào 145. Ngưỡng này không có căn cứ từ PDF K44.

Chi tiết còn suy kỳ chuẩn theo hằng `50` và năm học theo `51`; trong cùng năm 2026–2027 K48 có thể hiển thị năm 3 nhưng bị chia môn quá hạn/tương lai theo HK5 bất kể mốc đợt xét. Đợt HK02 hoặc năm học khác sẽ bị sai phân loại.

**Sửa:** dùng ngưỡng nullable và timeline trong snapshot của đợt; thiếu ngưỡng hiển thị “Chưa cấu hình”, không tính phần trăm. Không suy từ tên lớp/MSSV nếu đã có mã khóa và mốc đánh giá chính thức.

### F11 — P1: Thiếu nguồn chứng chỉ và căn cứ dự kiến thời điểm tốt nghiệp

Bảng `StudentGraduationRequirement` hiện có **0 bản ghi**, nhưng người dùng đã chốt công nhận GDQP/GDTC từ bảng điểm khi đủ các yêu cầu tương ứng. Cần sửa bộ suy ra điều kiện; không yêu cầu bản ghi chứng chỉ ngoài hệ thống để công nhận các trường hợp này. Danh sách môn còn thiếu vẫn chưa đủ để dự kiến chắc học kỳ tốt nghiệp vì còn phụ thuộc lịch mở môn, điều kiện tiên quyết, khả năng đăng ký, công nhận môn tương đương và lịch xét tốt nghiệp.

**Sửa:** hiện danh sách điều kiện cần xác minh, nguồn, người xác minh và ngày xác minh. Chỉ đưa thời điểm dự kiến khi có lộ trình khả thi; nêu rõ giả định. Cơ chế giữ tổng/thiếu TC là null khi thiếu rule của backend hiện tại là đúng và cần được bảo toàn ở UI.

## 3. Cảnh báo học tập và QĐ600

### 3.1 Các ngưỡng đã khớp

Theo Điều 18, PDF trang 25–26, và Điều 15 khoản 7, PDF trang 22:

| Quy tắc | Văn bản gốc | Mã/chính sách hiện tại |
| --- | --- | --- |
| Tín chỉ không đạt trong kỳ | Trên 50% khối lượng đăng ký | `> 0.5`, khớp; có chặn dữ liệu chưa đủ |
| Tín chỉ nợ đọng từ đầu khóa | Trên 24 TC | Ngưỡng đúng, capability chưa xác minh |
| GPA kỳ đầu của khóa | Dưới 0.8 | Ngưỡng đúng, cách xác định kỳ đầu cần sửa |
| GPA kỳ tiếp theo | Dưới 1.0 | Khớp |
| GPA tích lũy theo trình độ năm học | Dưới 1.2 / 1.4 / 1.6 / 1.8 | Khớp |
| Xếp trình độ năm học | <35; 35–<70; 70–<105; ≥105 TC | Khớp |
| Phạm vi hiệu lực | Từ K45 theo Điều 25 | Policy cấu hình UUID của K46–K49, phù hợp dữ liệu đang có |

Margin GPA 0.2 và ngưỡng thiếu tiến độ 4/12 TC là tín hiệu hỗ trợ nội bộ, không phải ngưỡng Điều 18. Code có phân biệt `REGULATORY`, `ADVISORY`, `OPERATIONAL`; cần duy trì phân biệt này trên mọi màn hình và bản xuất.

282 run hiện tại có `OFFICIAL` và `QD600_PARTIAL_REGULATORY`. Đây là kết quả đã lưu của chế độ đánh giá một phần; chữ `OFFICIAL` trong hệ thống không thay thế quyết định cảnh báo của Trường. Policy draft được phép dùng trong cơ chế controlled run theo contract hiện tại; bản thân trạng thái draft ở đây không phải bằng chứng luồng bị hỏng.

### F12 — P1: Cần áp quy tắc học lại hè khi tính nợ, giữ nguyên lịch sử kỳ chính

**Vị trí:** [academic-warning-capabilities.ts](../apps/backend/lib/services/academic-warning-capabilities.ts), dòng 28–51; [academic-warning-qd600-rules.ts](../apps/backend/lib/services/academic-warning-qd600-rules.ts), dòng 526–541.

Người dùng xác nhận hè là kỳ cải thiện: môn F ở kỳ chính rồi đạt D ở hè trở thành học phần đã đạt, tích lũy tín chỉ đúng một lần và hết nợ môn tại mốc sau lần đạt; **lịch sử F phải giữ nguyên**. Kết quả cảnh báo tại kỳ chính trước đó vẫn phải dựa trên dữ liệu tại mốc đó, không thay F bằng D hồi tố.

Ví dụ thật: `2246A021`, môn `20CT1201 – Cấu trúc dữ liệu và thuật giải`, HK01 năm 2023–2024 có F, HK03 hè cùng năm có D (`is_pass=true`). DB giữ cả hai lượt; service tiến độ trả `PASSED`, `attemptCount=2`, lần đạt HK03. Phần công nhận học phần trong tiến độ đang đúng trường hợp này; UI lịch sử cần hoàn thiện theo F15.

Capability nợ đọng và gộp hè trong cảnh báo vẫn hard-code `UNVERIFIED`, nên xác nhận nghiệp vụ chưa tự chuyển thành một rule đã chạy trong hệ thống. Điều 15 khoản 8 về gộp hè để xếp trình độ năm học là yêu cầu riêng; không đồng nghĩa ghi đè bảng điểm kỳ chính.

Đây là khoảng trống đã được code công khai qua partial coverage, không phải lý do tự chuyển thiếu dữ liệu thành “bình thường”.

**Sửa:** triển khai nợ tại từng mốc theo các lượt học, dùng lần đạt hợp lệ để giải quyết nợ và giữ lịch sử từng lượt. Không cộng tín chỉ nhiều lần, không sửa cảnh báo/snapshot cũ vì một lần học hè về sau. Kiểm tra riêng nguồn GPA/tín chỉ phục vụ xếp trình độ năm học và tránh cộng trùng. Duy trì nhãn “Đánh giá một phần” đến khi rule đã được triển khai, kiểm chứng.

### F13 — P1: “Kỳ đầu có dữ liệu” có thể khác “kỳ đầu của khóa học”

**Vị trí:** [academic-warnings.ts](../apps/backend/lib/services/academic-warnings.ts), dòng 452–461; [academic-warning-capabilities.ts](../apps/backend/lib/services/academic-warning-capabilities.ts), dòng 22–26.

Kỳ đầu được lấy là `StudentTermSummary` kỳ chính sớm nhất trong cùng mã CTĐT. Nếu thiếu dữ liệu đầu khóa hoặc sinh viên đổi mã chương trình khi phân chuyên ngành, kỳ sau có thể bị xem là kỳ đầu và áp 0.8 thay cho 1.0. Có 1 sinh viên trong dữ liệu hiện tại mà năm học summary sớm nhất theo chương trình hiện tại muộn hơn năm bắt đầu khóa; chưa xác minh đây là nhập thiếu, chuyển chương trình hay nhập học muộn.

**Sửa:** xác định kỳ đầu bằng hồ sơ nhập học/lịch sử chương trình; khi chưa xác minh phải trả unknown, không coi bản ghi sớm nhất hiện có là đủ bằng chứng.

### F14 — P1: Chưa bao phủ phần buộc thôi học và thời gian học tối đa

Điều 18 khoản 2 còn có quá 2 lần cảnh báo liên tiếp và vượt thời gian học tối đa theo Điều 5. Bộ rule hiện tại chưa có các điều kiện này; lịch sử màu đỏ có cả tín hiệu tiến độ nội bộ, nên không được đếm màu đỏ/run là số lần cảnh báo chính thức liên tiếp.

**Sửa:** nếu mở rộng phạm vi sang xử lý học vụ, bổ sung chuỗi kỳ chính và quyết định cảnh báo được xác nhận, thời gian học tối đa, thời gian bảo lưu được/không được loại trừ. Chỉ trình bày thuộc diện cần kiểm tra, không tự ban hành quyết định thôi học.

## 4. Những bất hợp lý đối với giáo viên

### F15 — P1: Hồ sơ chưa giữ đầy đủ lịch sử học lại và căn cứ liên hệ

**Vị trí:** [students/[id]/page.tsx](../apps/frontend/app/(dashboard)/students/[id]/page.tsx), dòng 269–304; [schema.prisma](../apps/backend/prisma/schema.prisma), model Student.

UI gộp bảng điểm theo mã môn, ưu tiên lần đậu/điểm cao nhất và bỏ các lần học khác khỏi `gradesData`. **Không phát hiện việc xóa lịch sử F trong DB ở ví dụ F→D kỳ hè đã kiểm tra.** Vấn đề là giáo viên khó xem đủ lượt học trên màn hình. Cần tách trạng thái học phần đã đạt/tín chỉ tích lũy với lịch sử từng lần F, VT, học lại. Không thay thế/xóa bản ghi F khi nhập điểm hè.

Model Student/DTO chưa có điện thoại/email. Đối chiếu API thật xác nhận MobilePhone có ở bảng điểm của 622 người và vẫn được giữ trong source_payload; thiếu ở đây là cách hệ thống đưa dữ liệu vào hồ sơ, không phải API không cung cấp điện thoại. Các endpoint đã đọc không có trường email. Hệ thống cũng chưa có hồ sơ trạng thái học vụ có hiệu lực theo thời gian như bảo lưu, tạm nghỉ, trở lại học, đình chỉ, đã tốt nghiệp. Có quyết định rời rạc và cờ `sIsInClass`, nhưng chúng chưa đủ cho việc điều chỉnh lộ trình hoặc liên hệ hỗ trợ.

### F16 — P1: Cần một bản tóm tắt có chung mốc và hành động tiếp theo

Giáo viên hiện phải ghép thông tin từ hồ sơ, tiến độ, tốt nghiệp và báo cáo can thiệp. Các phần có thể dùng kỳ hiện tại, kỳ chính đã chốt, hoặc đợt snapshot cũ. Nên có một khối đầu hồ sơ gồm:

- Kỳ đang học; kỳ cuối đã chốt điểm; ngày dữ liệu được cập nhật; CTĐT/chuyên ngành áp dụng.
- Mốc chuẩn, môn bắt buộc quá hạn, tự chọn thiếu từng nhóm, môn đang học và môn chưa có kết quả.
- GPA kỳ và tích lũy, ngưỡng thực tế của rule, mức bao phủ và nguyên nhân chưa kiểm tra.
- Cảnh báo chính thức của Trường, kết quả phát hiện nguy cơ của hệ thống và trạng thái hỗ trợ được trình bày riêng.
- Người phụ trách, lần liên hệ gần nhất, lần theo dõi tiếp theo, việc cần làm và bằng chứng hoàn thành.

Luồng can thiệp hiện tại đã có người phụ trách, trạng thái, hoạt động, lịch hẹn và audit; cần tiếp tục dùng cơ chế này. Đóng hồ sơ hỗ trợ không đồng nghĩa sinh viên hết nguy cơ; backend hiện đã giữ hai trạng thái riêng.

### F17 — P2: Một số danh sách còn tải trang đầu và lỗi API bị trình bày như không có dữ liệu

**Vị trí:** [StudentProgressLookupTab.tsx](../apps/frontend/components/training-progress/StudentProgressLookupTab.tsx), dòng 94–123 và 159–175; [students/[id]/page.tsx](../apps/frontend/app/(dashboard)/students/[id]/page.tsx), dòng 212.

Dropdown chỉ tải 50 khóa/100 lớp/100 chương trình; đăng ký trong hồ sơ chỉ lấy 100 bản ghi. Dữ liệu hiện tại 10 lớp/11 chương trình và chưa có sinh viên quá 100 đăng ký nên chưa bị cắt ở các chỗ này, nhưng cần tải tiếp khi tăng quy mô.

Ở tra cứu tiến độ, HTTP lỗi khiến danh sách bị xóa; KPI có thể giữ số từ lần trước và người dùng không thấy lý do lỗi rõ ràng. Cần phân biệt chưa tìm, không có kết quả, thiếu quyền, lỗi dịch vụ và lỗi dữ liệu; hiển thị retry. Màn hình hồ sơ đã có `loadIssues`, là hướng xử lý tốt nên dùng nhất quán.

## 5. Kiểm tra kỹ thuật và các luồng nền

| Kiểm tra | Kết quả |
| --- | --- |
| Backend tests | 143 test: 142 pass, 0 fail, 1 skip |
| Frontend typecheck | Đạt |
| Backend typecheck | Không đạt: `scripts/inspect-electives.ts` truy cập `student.cohortId` và `prisma.graduationStudentResult` không tồn tại; 3 lỗi |
| Backend lint | Không đạt: 61 lỗi, 2 cảnh báo, tập trung trong test dùng `any` |
| Frontend lint | 0 lỗi, 23 cảnh báo |
| Kiểm tra dữ liệu/service | Đọc DB thành công; chạy tiến độ cho 625 sinh viên; tái hiện đổi mốc F01, thiếu cấu hình F02 và lỗi VT F08; kiểm tra trực tiếp hai hồ sơ thiếu cấu hình/dữ liệu và trường hợp F→D hè |
| Browser E2E / import ghi dữ liệu / production build | Chưa thực hiện |

Không thể coi hệ thống đạt kiểm tra phát hành chỉ vì test chạy xanh. Cần sửa typecheck/lint, bổ sung regression tests cho các lỗi nghiệp vụ và kiểm tra các luồng có database/trình duyệt thật.

Đã kiểm tra lại các khoảng trống nêu trong kế hoạch cũ: frontend hiện có refresh token phối hợp qua `apiFetch`; nhiều danh sách đã có phân trang; chuông tĩnh đã được bỏ; UI can thiệp đã có hoạt động/lịch theo dõi. Không nên tiếp tục báo các mục này là chưa triển khai chỉ dựa vào `FUNCTIONAL_REVIEW_PLAN.md` ngày 20/09.

Phân quyền có guard API và scope; test hiện tại bao phủ nhiều trường hợp. Tuy nhiên chưa có bằng chứng E2E đủ từng vai trò, nên chưa chứng nhận mọi thao tác UI/quyền bằng phiên làm việc thật.

## 6. Thứ tự xử lý đề xuất

1. **Ổn định kết luận:** sửa VT F08, nguồn định mức F03, fallback 145; phân biệt tiến độ học kỳ với toàn khóa và công khai mốc đối chiếu. Không sửa cấu hình học kỳ hiện tại vốn đúng.
2. **Chuẩn hóa cấu hình:** kết nối chuẩn chung K44 áp dụng đến nay (150/104/46, nhóm và GPA) vào bộ tính. Không yêu cầu K50 hay K48 chọn chuyên ngành sớm; đối chiếu nguồn cho những hồ sơ chưa có dữ liệu học tập.
3. **Tốt nghiệp:** giữ ngoại ngữ ngoài hệ thống; sửa đánh giá rèn luyện toàn khóa; phân biệt đợt cũ và đợt mới, giữ lịch sử. Chỉ tạo đợt mới sau khi cấu hình đủ và nghiệp vụ được sửa.
4. **Cảnh báo/học lại:** thực hiện F→D hè giải quyết nợ tại mốc sau khi đạt; giữ F và snapshot cảnh báo cũ; xác minh kỳ đầu và nguồn tín chỉ xếp trình độ năm học. Nếu phạm vi cần thiết mới mở rộng chuỗi cảnh báo và thời gian tối đa.
5. **Giáo viên sử dụng:** thêm tóm tắt có chung mốc, lịch sử lần học, liên hệ/trạng thái học vụ; hoàn thiện xử lý lỗi/phân trang.
6. **Nghiệm thu:** sửa các kiểm tra kỹ thuật; chạy kịch bản cố vấn/giáo vụ/quản trị trên dữ liệu thử nghiệm cho đăng nhập, refresh, phân quyền, nhập điểm, thay CTĐT, cảnh báo, can thiệp, xuất báo cáo và truy vết phiên bản.

Các sửa đổi cần giữ snapshot bất biến, lịch sử từng lượt học và audit. Nguồn áp dụng chung CTĐT K44 cho các khóa hiện tại đã được người dùng xác nhận; ngưỡng 150/104/46 không còn là điểm nghi ngờ về phạm vi khóa.
