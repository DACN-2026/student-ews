# Rà soát chức năng, trải nghiệm và hợp đồng API — 17/10/2026

> Cập nhật sau rà soát: đã triển khai các bản sửa. Xem [báo cáo kết quả ngắn gọn](system-fixes-2026-10-17.md); các số liệu dưới đây là bằng chứng trước khi sửa.

## Kết luận

Phát hiện **18 vấn đề: 8 P1 cần ưu tiên, 10 P2 cần hoàn thiện**. Các API đọc chính hoạt động, nhưng HTTP 200 chưa bảo đảm giao diện dùng đúng trường, đúng phân trang hoặc đúng phạm vi dữ liệu.

Các điểm ưu tiên nhất: xác thực lại tài khoản ở các API danh mục; giới hạn thống kê tốt nghiệp theo lớp được phân công; giữ đúng lịch sử bảng điểm khi lọc học kỳ; sửa giao diện sau thao tác tạo danh mục; thống nhất họ tên và chính sách học phí; tránh import xóa các trường không được gửi.

Đây là báo cáo kiểm tra. Không sửa mã nghiệp vụ, không ghi dữ liệu học vụ, không chạy lại đánh giá, không import, không xuất báo cáo có ghi audit log và không gửi thông báo. Tệp JSON đi kèm chỉ giữ số lượng, mã trạng thái và thông tin chẩn đoán; không lưu token hay tên sinh viên.

## Phạm vi và phương pháp

- Rà soát mã các phân hệ đang có tuyến giao diện: phiên đăng nhập, tổng quan, sinh viên và hồ sơ, danh mục đào tạo/CTĐT/kế hoạch, tiến độ, cảnh báo, can thiệp, tốt nghiệp, cấu hình và RBAC. Đối chiếu route handler, service, Prisma và các phép ánh xạ dữ liệu frontend.
- Kiểm tra trực tiếp API nội bộ qua backend và proxy frontend bằng các request GET. Kiểm tra thêm vai trò cố vấn bằng tài khoản đã tồn tại; thông tin xác thực chỉ dùng trong bộ nhớ, không tạo refresh session hoặc sửa quyền.
- Truy vấn PostgreSQL chỉ đọc; đối chiếu các trường hợp biên trên dữ liệu hiện có.
- Chạy test backend, test frontend, TypeScript, ESLint và smoke test.
- Không có trình duyệt được kết nối trong phiên này: chưa kiểm thử bằng thao tác giao diện thực tế, màn hình nhỏ, bàn phím hoặc trình đọc màn hình. Những lỗi frontend dưới đây được xác định bằng mã và payload API, không được mô tả là đã quan sát trên trình duyệt.
- Không gọi lại toàn bộ Portal/API nguồn bên ngoài và không đối chiếu lại PDF quy chế. Dữ liệu nguồn trong báo cáo là dữ liệu đang lưu và được API nội bộ trả về tại thời điểm kiểm tra. Các kết luận nghiệp vụ đã sửa ở những đợt trước không tự được coi là lỗi còn tồn tại.

Bằng chứng runtime: [system-functional-audit-2026-10-17.json](system-functional-audit-2026-10-17.json).

## 1. Các vấn đề P1

### F01 — API danh mục chỉ kiểm tra quyền trong JWT, chưa kiểm tra tài khoản hiện hành

- `apps/backend/proxy.ts:194` — proxy xác thực chữ ký rồi dùng `payload.permissions`.
- `apps/backend/app/api/v1/courses/route.ts:6` và `:20` — GET/POST không gọi `requireAuth`/`requirePermission` tại handler. Cùng kiểu xử lý xuất hiện ở danh mục năm học, CTĐT.
- **Tái hiện chỉ đọc:** token ký hợp lệ nhưng có identity không tồn tại bị `/auth/me` từ chối 401, trong khi `/courses` trả 200. Điều này xác nhận route danh mục không kiểm tra trạng thái identity như các route có tải actor từ DB.
- **Tác động:** quyền cũ trong access token có thể tiếp tục được chấp nhận ở các handler này sau khi tài khoản bị khóa hoặc vai trò bị thu hồi, đến khi token hết hạn; mặc định access token có hạn 15 phút. Chiều ngược lại, quyền mới cấp có thể bị proxy chặn đến lúc refresh.
- **Đề xuất:** kiểm tra actor/quyền hiện hành tại handler/service của mọi thao tác được bảo vệ; coi proxy là lớp sàng lọc ban đầu. Kiểm thử khóa user và thu hồi/cấp quyền khi token cũ còn hiệu lực. Chưa thử thao tác ghi bằng token lỗi.

### F02 — Tổng số trong đợt tốt nghiệp vượt phạm vi sinh viên cố vấn được xem

- `apps/backend/lib/services/graduation-evaluations.ts:1000` — thống kê lại bằng `monitoredStudentResultWhere()` nhưng không có lớp được phép của actor.
- `apps/backend/app/api/v1/graduation-evaluations/route.ts:15` — giới hạn đợt theo cohort/kỳ; chưa giới hạn các số tổng theo lớp.
- **Tái hiện:** cùng phiên cố vấn, hai đợt có `totalStudents=20` và `84`, nhưng endpoint danh sách sinh viên tương ứng chỉ cho xem `7` và `50`.
- **Tác động:** số ở bộ chọn đợt và bảng chi tiết không khớp; lộ thống kê tổng hợp ngoài phạm vi lớp. Chưa phát hiện việc endpoint danh sách này trả hồ sơ sinh viên ngoài lớp.
- **Đề xuất:** tính cả tổng và từng nhóm trạng thái bằng cùng `graduationEvaluationClassScope` dùng cho danh sách chi tiết. Tiêu chí đạt: tổng ở bộ chọn đợt khớp `statusCounts.all` của cùng phạm vi cố vấn.

### F03 — Bộ lọc bảng điểm lịch sử làm mất lần học có thật

- `apps/backend/lib/services/grades.ts:246` — chọn một kết quả cho mỗi mã môn trên toàn bộ lịch sử.
- `apps/backend/lib/services/grades.ts:284` — sau đó mới lọc năm/học kỳ.
- **Tái hiện dữ liệu thật:** một lần học F ở HK01 2022–2023 vẫn có trong DB; môn đó có lần học khác đã đạt. GET `/students/:id/grades?academicYear=2022-2023&termCode=HK01&courseCode=...` trả `items=[]`, `total=0`.
- **Tác động:** lọc học kỳ hoặc xuất điểm theo kỳ có thể báo không có môn đã học. Endpoint tổng hợp cũng không thể dùng để tra cứu đầy đủ các lần thi/học lại.
- **Đề xuất:** phân biệt chế độ lịch sử từng lần học với chế độ kết quả tích lũy tốt nhất. Với truy vấn theo kỳ, lọc phạm vi trước khi tổng hợp; giữ ID lần học và thông tin F/D/học lại. Không kết luận DB đã mất điểm: lỗi nằm ở phép tổng hợp trả API.

### F04 — Tạo danh mục thành công có thể làm giao diện lỗi vì state sai cấu trúc

- `apps/frontend/app/(dashboard)/academics/page.tsx:176` — `setYears(await yRes.json())`.
- Cùng lỗi tại `:248`, `:269`, `:290` đối với học phần, khóa và lớp.
- **Bằng chứng:** các API GET trên trả `{items,total,page,pageSize}`. State và phần render dùng `years.map`, `courses.filter`, `cohorts.map`, `classes.map`.
- **Tác động:** thao tác ghi có thể đã thành công nhưng lần render tiếp theo gọi hàm mảng trên object. Người dùng dễ tải lại hoặc tạo thêm vì không biết dữ liệu đã được lưu.
- **Đề xuất:** chuẩn hóa payload bằng `json.items` trên mọi đường tải lại, dùng kiểu response cụ thể và kiểm tra luồng sau tạo. Chưa tạo dữ liệu mới để tái hiện trên DB.

### F05 — Tạo sinh viên ghép ngược họ tên; sửa tên không cập nhật tên đầy đủ

- `apps/frontend/app/(dashboard)/students/page.tsx:738` — `firstName` là ô “Họ và tên đệm”; `:752` — `lastName` là ô “Tên sinh viên”. Ví dụ import cũng theo cách này.
- `apps/backend/lib/services/students.ts:305` — tạo `fullName` bằng `${lastName} ${firstName}`. Nhập “Nguyễn Văn” và “An” sẽ thành “An Nguyễn Văn”. Import có cùng cách ghép.
- `apps/backend/lib/services/students.ts:328` — update từng phần tên nhưng chỉ sửa `sFullName` khi client gửi `fullName`; form hiện tại không gửi trường đó.
- **Tác động:** bảng danh sách, tìm kiếm, thứ tự tên và hồ sơ có thể không nhất quán sau tạo/sửa.
- **Đề xuất:** chốt nghĩa hai trường theo dữ liệu nguồn hiện dùng; ghép họ đệm rồi tên. Khi sửa một phần tên, dựng lại tên đầy đủ bằng giá trị mới và phần còn lại đang lưu. Không đổi hàng loạt ý nghĩa cột hoặc đảo dữ liệu nguồn đã có.

### F06 — Chính sách học phí lệch hợp đồng ở cả hiển thị và tạo mới

- `apps/backend/lib/services/fee-policies.ts:63` — API list trả `policyName`, `yearStudy`, `termId`, `coefficientPercent`.
- `apps/frontend/app/(dashboard)/students/[id]/page.tsx:945` — UI đọc `feeObjectDicName/sFeeObjectDicName`; `:951` đọc `termCode/sTermId` và `academicYear/sYearStudy`. Không khớp các trường API hiện trả.
- Form gửi `feeObjectName` (`:126`, `:1133`) nhưng service create đọc `policyName` hoặc `feeObjectDicName`; tên sẽ rơi về “Chính sách học phí”.
- Form hard-code ba mã `MIEN_100/GIAM_70/MIEN_GIAM_50`; danh mục DB hiện có `TN/CMC/DT-CN/CS/TT`, **không có mã nào khớp**. Service create chưa xác thực mã theo danh mục như luồng import.
- `:948` dùng `coefficientPercent || ...`, nên giá trị 0 hợp lệ cũng bị bỏ qua.
- **Tác động:** dữ liệu 41 bản ghi chính sách hiện có có thể bị trống tên/kỳ trên UI; tạo mới có thể dùng mã không thuộc danh mục và sai tên.
- **Đề xuất:** một DTO thống nhất; lấy lựa chọn từ API danh mục; kiểm tra mã tồn tại và tỷ lệ 0–100 ở backend; dùng `??` cho số 0. Chưa ghi thử chính sách mới.

### F07 — Quyền đọc hồ sơ sinh viên cũng nhận dữ liệu GPA mà không cần quyền đọc điểm

- `apps/backend/app/api/v1/students/[id]/route.ts:14` — chỉ yêu cầu `student.read`.
- `apps/backend/lib/services/students.ts:265` — luôn trả `cumulative` và `termSummaries` chứa GPA/tín chỉ.
- **Tác động:** nếu dùng RBAC để cấp `student.read` và thu hồi `grade.read`, dữ liệu điểm tổng hợp vẫn có thể được lấy qua hồ sơ. Các endpoint `/grades` và `/grades/summary` riêng có yêu cầu `grade.read`.
- **Đề xuất:** endpoint hồ sơ chỉ trả dữ liệu nhân thân, hoặc lọc các trường điểm theo actor; kiểm tra cùng quyền ở export. Đây là kết luận từ đường thực thi mã; chưa tạo tài khoản/quyền mới để thử.

### F11 — Import hồ sơ có thể xóa các trường không gửi và không cho biết chi tiết lỗi

- `apps/backend/lib/services/students.ts:408` — `dataFor()` mặc định địa chỉ/nơi sinh/lớp/CTĐT về null, vai trò lớp về 0 và trong lớp về true.
- `:428` — dùng cùng toàn bộ payload này để cập nhật sinh viên đã tồn tại, đồng thời đặt `deletedAt=null`.
- **Tình huống:** nhập JSON chỉ gồm các trường bắt buộc để cập nhật tên/ngày sinh có thể làm mất lớp, CTĐT và thông tin tùy chọn đã lưu; hồ sơ đã xóa mềm còn có thể được khôi phục ngầm.
- `apps/frontend/app/(dashboard)/students/page.tsx:1082` — chỉ hiện số thành công/tổng, không render `errors`. Backend thực tế trả lỗi dạng `{studentId,message}`, còn interface frontend khai báo `errors?: string[]`.
- **Đề xuất:** tách chế độ thêm/cập nhật/thay thế; chỉ cập nhật trường được gửi; có preview bản ghi thay đổi và cảnh báo khôi phục. Hiển thị lỗi từng dòng và cho tải danh sách lỗi. Chưa import hay khôi phục hồ sơ nào.

## 2. Các vấn đề P2

| Mã | Vị trí | Vấn đề và tác động | Hướng xử lý |
| --- | --- | --- | --- |
| F08 | `apps/frontend/app/(dashboard)/academics/page.tsx:111`; `apps/frontend/app/(dashboard)/academics/training-programs/[id]/page.tsx:105` | Danh mục Đào tạo chỉ tải trang đầu 20/144 học phần; tìm kiếm chỉ chạy trên 20 môn đó. Form CTĐT xin `pageSize=200`, nhưng backend chặn ở 100 nên vẫn thiếu 44 môn để chọn. | Phân trang/tìm kiếm phía server cho danh sách; combobox tìm kiếm hoặc tải đủ các trang cho ô chọn. Không sửa bằng cách tăng pageSize vượt trần backend. |
| F09 | `apps/backend/lib/services/training-progress.ts:808`; `apps/frontend/app/(dashboard)/academics/page.tsx:1032` | API luôn loại `status=archived`, trong khi UI có nhóm “Lưu trữ”. DB có 35 archived, 11 locked, 1 draft; 12 kế hoạch API hiện trả là đúng với điều kiện đó, không phải 35 bản bị cắt bởi phân trang. Nhóm lưu trữ không thể có dữ liệu. | Thêm bộ lọc `status/includeArchived` có phân quyền, hoặc màn lịch sử riêng. |
| F10 | `apps/frontend/app/(dashboard)/students/[id]/page.tsx:464`, `:833`, `:907` | Các tab điểm/quyết định/học phí/đăng ký và nút gán chính sách, xuất danh sách chưa được kiểm tra theo từng quyền. CVHT có thể thấy nút ghi mà backend trả 403; lỗi tải một số tab có thể hiện cùng thông báo “chưa có dữ liệu”. | Lọc tab, request và nút theo quyền thật; hiển thị trạng thái không có quyền khi mở deep link. Backend tiếp tục là nơi quyết định quyền. |
| F12 | `apps/frontend/app/(dashboard)/students/page.tsx:320`; `apps/backend/app/api/v1/students/export/route.ts:11` | Xuất sinh viên không gửi/đọc bộ lọc đang chọn. `exportAll()` chỉ giới hạn theo quyền của actor, nên đang lọc một lớp vẫn xuất tất cả sinh viên trong phạm vi tài khoản. | Cho chọn rõ “xuất kết quả đã lọc”/“xuất toàn bộ phạm vi”; dùng chung parser bộ lọc của danh sách. |
| F13 | `apps/frontend/app/(dashboard)/students/[id]/page.tsx:194`, `:305`; `apps/frontend/app/(dashboard)/academics/training-programs/[id]/page.tsx:126` | Lỗi mạng/500 tải hồ sơ có thể thành màn “không tìm thấy”; lỗi chi tiết CTĐT chỉ ghi console. Các handler tạo danh mục chỉ xử lý `res.ok`, nhiều phản hồi 400/409/403 không được báo cho người dùng. Dashboard layout cũng có thể ném lỗi xác thực mà chưa có `error.tsx` riêng. | Phân biệt 403/404/409/5xx/offline; thông báo có bước tiếp theo, nút thử lại; giữ dữ liệu form khi lỗi. |
| F14 | `apps/frontend/app/(auth)/login/page.tsx:22` | Hệ thống giữ URL đích bằng `next` khi hết phiên, nhưng đăng nhập thành công luôn `router.push('/dashboard')`. Mất vị trí hồ sơ đang xem. | Đọc và kiểm tra URL nội bộ an toàn trước khi điều hướng sau login; giữ query/tab. |
| F15 | `apps/frontend/components/settings/EarlyWarningSettingsPage.tsx:57`; `apps/frontend/components/ui/Modal.tsx:65` | Trang cấu hình có trạng thái dirty nhưng chưa chặn rời trang; modal đóng bằng Escape/backdrop mà không biết form đã sửa. Có thể mất nội dung cấu hình/biểu mẫu chưa lưu. | Cảnh báo khi rời trang có thay đổi; cho modal nhận trạng thái dirty/busy và xác nhận bỏ nội dung. |
| F16 | `apps/frontend/app/(auth)/login/page.tsx:93`; `apps/frontend/components/ui/DataTable.tsx:116` | Label đăng nhập chưa nối input bằng `htmlFor/id`, thiếu name/autocomplete; lỗi đăng nhập chưa có live region. Hàng có `onRowClick` chưa có thao tác bàn phím tương đương tại chính hàng. | Liên kết label; autocomplete đúng; thông báo lỗi được đọc; dùng liên kết/nút có thể focus cho thao tác mở hồ sơ. Các modal chung đã có focus trap, aria-modal và trả focus, nên không ghi chúng là thiếu toàn bộ khả năng truy cập. |
| F17 | `apps/frontend/package.json:12`; `scripts/smoke-test.cjs:18` | Lệnh test frontend mặc định lỗi `uv_os_get_passwd/ENOMEM` trong Windows hạn chế; chạy với shim backend hiện có thì 44/44 đạt. Smoke test kỳ vọng redirect thẳng `/login`, trong khi guard hiện chuyển `/renew`; test dừng trước phần kiểm tra còn lại. | Dùng runner/shim nhất quán; cập nhật smoke test cho luồng renew, có kiểm tra hồi phục phiên và quyền theo vai trò. Không đổi guard chỉ để khớp kỳ vọng cũ. |
| F18 | `apps/frontend/app/(dashboard)/academics/page.tsx:1342`; `apps/backend/app/api/v1/courses/route.ts:26`; `apps/backend/lib/services/training-programs.ts:702` | Form tạo học phần cho nhập tín chỉ, giờ lý thuyết/thực hành và gửi chúng lên API. Handler/service chỉ lấy mã và tên; model Course cũng không có ba trường đó. Người dùng tưởng đã lưu nhưng dữ liệu bị bỏ qua. | Nếu đây là danh mục chung chỉ giữ mã/tên, bỏ ba ô và giải thích nhập định mức tại học phần của CTĐT. Nếu cần định mức mặc định, bổ sung mô hình và hợp đồng API rõ ràng. |

## 3. Kiểm tra dữ liệu và những điểm không kết luận là lỗi

| Nội dung | Kết quả hiện tại | Ý nghĩa |
| --- | ---: | --- |
| Hồ sơ / lớp / CTĐT | 625 / 10 / 11 | API sinh viên trả tổng 625; không phát hiện chênh số bản ghi trên đường proxy đã kiểm tra. |
| Lượt học phần / bản ghi điểm | 31.141 / 31.141 | Không còn chênh 3 lượt như báo cáo cũ ngày 06/10; lỗi F03 là lỗi trả lịch sử API, không phải mất bản ghi trong DB. |
| Có dữ liệu lượt học / tổng hợp tích lũy | 624 / 624 sinh viên | Một hồ sơ chưa có dữ liệu học tập; không mặc định tích lũy bằng 0 hoặc kết luận sinh viên chưa từng học. |
| Rèn luyện / quyết định / miễn giảm | 9.375 / 912 / 41 | Chỉ xác nhận dữ liệu đang lưu; chưa đối chiếu toàn bộ lại với Portal hôm nay. |
| Tổng quan / tiến độ hiện tại | 622 sinh viên | Phạm vi theo dõi khác tổng hồ sơ; cần giữ giải thích về rời lớp/nghỉ học và kỳ đánh giá. |
| Báo cáo cảnh báo | 623 trong phạm vi kỳ; 622 có kết quả | 179 nguy cơ cao + 145 theo dõi + 298 bình thường = 622. Một trường hợp được loại theo trạng thái học vụ; không tự quy chênh 623/622 thành mất dữ liệu. |
| GPA học kỳ khả dụng trong báo cáo | 576 | 46/622 chưa có GPA kỳ khả dụng không đồng nghĩa 46 người có GPA=0. Cần tiếp tục dùng bằng chứng thiếu dữ liệu theo từng tiêu chí. |
| Đợt tốt nghiệp | 13 đợt lưu, 7 đợt khi lấy mới nhất mỗi phạm vi | API có chủ đích lấy latest per scope; không coi 6 đợt còn lại bị mất. |
| Phân trang đăng ký cá nhân | Tối đa 94 lượt/sinh viên trong DB | Chưa có bằng chứng UI đang mất dữ liệu do trần 100 ở danh sách này. Cần phân trang khi quy mô vượt ngưỡng, không đưa vào lỗi đang xảy ra. |

Mốc cập nhật DB lớn nhất: lượt học phần 06/10/2026, rèn luyện và quyết định 21/09/2026. **Đây là `updated_at` của bản ghi, không phải lần đồng bộ nguồn thành công cuối cùng**: đồng bộ không thay đổi dữ liệu có thể giữ nguyên mốc này. Không đủ căn cứ tuyên bố nguồn đã lỗi thời.

Nên bổ sung một trạng thái nguồn dữ liệu thống nhất cho người dùng vận hành: lần lấy nguồn thành công/thất bại, kỳ và phạm vi đã phủ, số dòng nhận/bỏ/lỗi, nguyên nhân thiếu dữ liệu, mã lô nhập và kết quả đánh giá nào cần chạy lại. Hiện các snapshot/updatedAt nằm rải rác nên khó phân biệt “làm mới giao diện”, “đồng bộ nguồn” và “tính lại đánh giá”.

Các cải thiện UX tiếp theo: giữ bộ lọc/trang trong URL khi quay lại danh sách; bổ sung thông tin liên hệ có nguồn và quyền truy cập để hỗ trợ CVHT; tính nhãn năm học trong tốt nghiệp từ kỳ đánh giá/cohort thay cho các mốc K46–K49 hard-code. Không tự bổ sung ngoại ngữ vào điều kiện chặn hoặc yêu cầu sinh viên chọn chuyên ngành trước mốc nghiệp vụ đã thống nhất ở các tài liệu trước.

## 4. Kết quả kiểm tra kỹ thuật

| Kiểm tra | Kết quả |
| --- | --- |
| Backend tests | 368 tests: 367 pass, 1 skip, 0 fail. |
| Frontend tests mặc định | 6 tệp không khởi chạy được do lỗi `uv_os_get_passwd` của môi trường/tsx. |
| Frontend tests với shim có sẵn | 44 pass, 0 fail. |
| `npm.cmd run typecheck` | Cả backend và frontend đạt. |
| `npm.cmd run lint` | 0 lỗi; 2 cảnh báo backend, 15 cảnh báo frontend. |
| `npm.cmd run test:smoke` | Không đạt tại kỳ vọng đường redirect `/login`; thực tế `/renew`. Những bước sau assertion đó chưa chạy. |
| HTTP đọc có xác thực | 35 trường hợp request thông thường được lưu trong JSON đều 200; bao gồm health, danh mục, hồ sơ, tiến độ, cảnh báo, can thiệp, tốt nghiệp và dashboard. Các phép kiểm tra identity lỗi và phạm vi cố vấn được ghi riêng. |
| Build production / E2E ghi / kiểm thử trực quan | Chưa thực hiện. |

TypeScript hiện không bắt được nhiều lỗi hợp đồng vì `apps/frontend/api-data.d.ts:5` định nghĩa `ApiData = ReturnType<typeof JSON.parse>`, thực chất là `any`. Nên thay theo từng endpoint bằng DTO cụ thể, dùng cùng schema kiểm tra runtime cho request/response và có test giao diện sau mutation. Không cần viết lại toàn bộ ứng dụng trước khi sửa các lỗi rõ ràng.

## 5. Thứ tự xử lý đề xuất

1. **Quyền và phạm vi:** F01, F02, F07; thêm kiểm tra token cũ, user bị khóa, cố vấn khác lớp và tài khoản thiếu quyền điểm.
2. **Tính đúng của dữ liệu:** F03, F05, F06, F11; bảo toàn lịch sử lần học và các trường hồ sơ, chốt hợp đồng tên/mã/dữ liệu null.
3. **Luồng thao tác chính:** F04, F08, F09, F10, F12, F13, F18; kiểm tra sau lưu, phân trang, lọc/xuất và phục hồi lỗi.
4. **Hoàn thiện trải nghiệm và kiểm tra hồi quy:** F14–F17; trạng thái nguồn dữ liệu và các cải thiện UX nêu trên.

Phần khả năng truy cập được đối chiếu theo kỹ năng `web-design-guidelines` và [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md); các phát hiện được gắn với mã cụ thể, chưa thay cho kiểm thử trợ năng trên trình duyệt.
