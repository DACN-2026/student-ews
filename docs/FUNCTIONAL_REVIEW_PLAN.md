# Kế hoạch rà soát và hoàn thiện chức năng SEWS

**Ngày rà soát:** 20/09/2026  
**Trạng thái tài liệu:** Kế hoạch mới, thay cho việc dùng phần backlog lịch sử ở `PROJECT_COMPLETION_PLAN.md`  
**Phạm vi:** Frontend, API, nghiệp vụ, RBAC, dữ liệu, kiểm thử và vận hành của phiên bản S1; có tiếp nhận thiết kế kỳ hè trong `SUMMER_TERM_DESIGN.md`

---

## 1. Mục tiêu

Kế hoạch này xác định các chức năng cần:

1. **Chỉnh sửa** vì đã có nhưng chưa hoàn chỉnh hoặc có nguy cơ hoạt động sai khi dữ liệu tăng.
2. **Bổ sung** để khép kín quy trình nghiệp vụ và đủ điều kiện vận hành thật.
3. **Thay thế/loại bỏ** vì đang là placeholder, trùng lặp hoặc không còn đúng với kiến trúc hiện tại.

Mục tiêu phát hành gần nhất là một phiên bản có thể chạy thử nghiệm tại khoa với dữ liệu thật, phân quyền đúng, không bỏ sót bản ghi do phân trang, không làm mất phiên đăng nhập sau 15 phút và giải thích rõ nguồn/kỳ/cutoff của các chỉ số.

---

## 2. Kết quả rà soát hiện tại

### 2.1 Chức năng đã có và có thể tiếp tục sử dụng

| Nhóm | Hiện trạng |
| --- | --- |
| Xác thực | JWT access token, refresh token HttpOnly, xoay refresh token, logout và giới hạn đăng nhập sai |
| RBAC | Role, permission, data scope theo toàn hệ thống/toàn khoa/lớp cố vấn |
| Sinh viên | Danh sách, hồ sơ, CRUD, điểm, đăng ký, quyết định, chính sách học phí và xuất hồ sơ PDF |
| Danh mục đào tạo | Năm học, học kỳ, lớp, khóa, học phần, CTĐT và kế hoạch tiến độ |
| Tiến độ CTĐT | Đối chiếu đăng ký, đánh giá hoàn thành, standard/forecast, snapshot và lịch sử run |
| Cảnh báo | Policy có phiên bản, run cảnh báo, nguyên nhân giải thích được, snapshot và audit |
| Rèn luyện | Đọc điểm theo kỳ, phân loại theo thang S5, chỉ dùng điểm đã được công nhận |
| Hỗ trợ sinh viên | State machine, người thao tác, người được phân công, hạn xử lý, lịch sử trạng thái và audit ở backend |
| Báo cáo | Báo cáo live, XLSX/PDF, hồ sơ sinh viên PDF và giới hạn theo data scope |
| Quản trị | Tài khoản, vai trò, quyền, cố vấn và phân công lớp |
| Chất lượng mã | Lint và typecheck đạt; 24 test backend đạt, 1 test OpenAPI ngoài bị skip |

### 2.2 Khoảng trống được xác nhận lại

| Mã | Khoảng trống | Mức ảnh hưởng |
| --- | --- | --- |
| G01 | Nhiều màn hình chỉ lấy trang đầu mặc định 20 bản ghi và không có phân trang | Cao |
| G02 | Quyền đọc danh mục lớp/khóa/CTĐT đang bị gộp với quyền quản lý | Cao |
| G03 | Frontend chưa dùng refresh token để tự khôi phục access token hết hạn | Cao |
| G04 | Đổi mật khẩu, khóa tài khoản hoặc đổi role chưa thu hồi toàn bộ phiên cũ | Cao |
| G05 | Một số nút CRUD/xuất file vẫn hiện với người không có quyền tương ứng | Trung bình |
| G06 | Backend hỗ trợ người phụ trách và hạn xử lý nhưng UI hồ sơ hỗ trợ chưa cho nhập/sửa | Trung bình |
| G07 | Chuông thông báo là nội dung tĩnh, không đọc dữ liệu thật | Trung bình |
| G08 | Import chỉ thuận tiện cho JSON, thiếu preview/dry-run/lịch sử/khôi phục | Trung bình |
| G09 | Nhóm tự chọn chưa hỗ trợ tổng quát “chọn N trong M” | Trung bình |
| G10 | Hai họ endpoint đánh giá hoàn thành CTĐT đang tồn tại song song | Thấp |
| G11 | Audit đã ghi nhưng chưa có màn hình tra cứu | Trung bình |
| G12 | Chưa có test frontend/E2E và ma trận phân quyền chạy với PostgreSQL thật | Cao |
| G13 | Logic kỳ hè mới có thiết kế và cờ dữ liệu, chưa được áp dụng xuyên suốt | Cao về nghiệp vụ |
| G14 | Dashboard, hướng dẫn sử dụng và yêu cầu hiển thị nguồn/cutoff đang lệch nhau | Trung bình |
| G15 | Tài liệu kế hoạch cũ còn mô tả các khoảng trống đã được hoàn thành | Thấp |

---

## 3. Nguyên tắc ưu tiên

- **P0 — Trước chạy thử với dữ liệu thật:** lỗi có thể làm thiếu dữ liệu, sai quyền hoặc gián đoạn phiên làm việc.
- **P1 — Trước nghiệm thu/vận hành chính thức:** khép kín workflow, tăng khả năng truy vết và tránh thông tin gây hiểu nhầm.
- **P2 — Sau khi vận hành ổn định:** mở rộng nghiệp vụ, tối ưu trải nghiệm và dọn nợ kỹ thuật.

Quy mô ước lượng:

- **S:** tối đa khoảng 1 ngày làm việc.
- **M:** khoảng 2–4 ngày làm việc.
- **L:** khoảng 1–2 tuần, cần migration hoặc xác nhận nghiệp vụ.

---

## 4. Backlog chức năng chi tiết

### 4.1 P0 — Độ tin cậy, phân quyền và phiên đăng nhập

#### FR-01 — Hoàn thiện phân trang và bộ chọn dữ liệu

- **Loại:** Chỉnh sửa
- **Quy mô:** L
- **Vấn đề:** `parsePagination()` mặc định 20 bản ghi; nhiều trang gọi API danh mục, kế hoạch, run và danh sách sinh viên trong run mà không truyền `page/pageSize` và không hiển thị phân trang.
- **Phạm vi chính:**
  - Danh mục lớp, khóa, CTĐT, năm học, học kỳ và học phần.
  - Danh sách kế hoạch/run tiến độ, run cảnh báo và run hoàn thành CTĐT.
  - Danh sách sinh viên bên trong từng run và lịch sử hỗ trợ.
- **Giải pháp:**
  - Danh sách chính dùng phân trang server và hiển thị tổng số/trang hiện tại.
  - Dropdown có nhiều dữ liệu dùng tìm kiếm từ xa hoặc tải tiếp; không tải ngầm chỉ 20 phần tử.
  - Chuẩn hóa response `{ items, total, page, pageSize, totalPages }` cho các API danh sách.
  - Giữ giới hạn tối đa 100 bản ghi/request.
- **Tiêu chí nghiệm thu:**
  - Tạo dữ liệu ít nhất 125 lớp, 125 sinh viên và 30 run; truy cập/tìm kiếm được mọi bản ghi.
  - Không có dropdown nào âm thầm bỏ các mục từ vị trí 21 trở đi.
  - Thay đổi filter đưa danh sách về trang 1.

#### FR-02 — Tách quyền đọc danh mục khỏi quyền quản lý

- **Loại:** Chỉnh sửa
- **Quy mô:** M
- **Vấn đề:** GET `/classes`, `/cohorts`, `/academic-years`, `/courses`, `/training-programs` đang yêu cầu quyền quản lý. Cố vấn có quyền đọc sinh viên/cảnh báo/tiến độ nhưng không tải được dữ liệu nền cần cho bộ lọc.
- **Giải pháp đề xuất:**
  - Bổ sung `class.read` và `academic_context.read`; hoặc dùng endpoint `/academic-context` đã được scope để cấp dữ liệu bộ lọc.
  - GET dùng quyền đọc; POST/PATCH/DELETE tiếp tục dùng quyền quản lý.
  - Áp data scope cho danh mục trả về khi có thể suy ra phạm vi.
  - Cập nhật seed, ma trận vai trò, proxy, fixture API và tài liệu.
- **Tiêu chí nghiệm thu:**
  - Cố vấn tải được đúng lớp/khóa/CTĐT thuộc phạm vi nhưng không tạo/sửa/xóa danh mục.
  - Người chỉ có `student.read` không nhìn thấy dữ liệu ngoài scope.
  - Có test ma trận `role × method × endpoint × scope`.

#### FR-03 — Tự động refresh phiên ở frontend

- **Loại:** Bổ sung
- **Quy mô:** M
- **Vấn đề:** Access token sống 15 phút; frontend chỉ gọi `/auth/me`, không gọi `/auth/refresh` khi API trả 401.
- **Giải pháp:**
  - Tạo một client dùng chung, ví dụ `apiFetch`, thay cho `fetch` rải rác.
  - Khi gặp 401: chỉ cho một refresh chạy tại một thời điểm, retry request đúng một lần.
  - Nếu refresh thất bại: xóa state, chuyển về login và giữ `next` URL.
  - Không refresh vòng lặp; không retry request mutation nếu body không thể gửi lại an toàn.
- **Tiêu chí nghiệm thu:**
  - Để phiên mở quá 15 phút, thao tác tiếp theo vẫn thành công nếu refresh token còn hạn.
  - Nhiều request đồng thời chỉ tạo một lần refresh.
  - Refresh hết hạn đưa người dùng về login với thông báo rõ ràng.

#### FR-04 — Thu hồi phiên khi thay đổi bảo mật

- **Loại:** Bổ sung/chỉnh sửa
- **Quy mô:** M
- **Phạm vi:** đổi mật khẩu, khóa tài khoản, xóa tài khoản, thay role/quyền nhạy cảm, “đăng xuất tất cả thiết bị”.
- **Giải pháp:**
  - Revoke toàn bộ refresh token của người dùng trong cùng transaction thay đổi bảo mật.
  - Bổ sung `sessionVersion`/`tokenVersion` nếu cần vô hiệu hóa access token ngay thay vì chờ tối đa 15 phút.
  - Bắt buộc đổi mật khẩu lần đầu với tài khoản seed hoặc không cho seed mật khẩu mặc định trong production.
  - Bổ sung chức năng tự đổi mật khẩu; quản trị chỉ đặt mật khẩu tạm.
- **Tiêu chí nghiệm thu:** phiên cũ không refresh được sau đổi mật khẩu/khóa tài khoản; các sự kiện đều có audit.

#### FR-05 — Ma trận hiển thị và thao tác theo quyền

- **Loại:** Chỉnh sửa
- **Quy mô:** M
- **Vấn đề:** Backend chặn đúng nhưng trang Sinh viên, Đào tạo và Báo cáo còn hiển thị một số thao tác người dùng không được phép thực hiện.
- **Giải pháp:**
  - Tạo component/hook chuẩn cho permission guard.
  - Ẩn hoặc disable có giải thích cho create/edit/delete/import/export/calculate/manage.
  - Mọi lỗi 401/403/404 từ API phải có thông báo thống nhất, không chỉ `console.error` hoặc bỏ qua.
- **Tiêu chí nghiệm thu:** mỗi vai trò chỉ thấy thao tác hợp lệ; không có nút bấm chắc chắn trả 403.

### 4.2 P1 — Workflow cảnh báo, hỗ trợ và thông tin vận hành

#### FR-06 — Hoàn thiện hồ sơ hỗ trợ sinh viên trên UI

- **Loại:** Bổ sung/chỉnh sửa
- **Quy mô:** M
- **Backend đã có:** `assignedUserId`, `dueDate`, `resolvedAt`, state machine, history và audit.
- **Cần bổ sung UI:**
  - Chọn người phụ trách và hạn xử lý khi tạo/cập nhật.
  - Danh sách “Việc của tôi”, “Sắp đến hạn”, “Quá hạn”, “Đã chuyển cấp”.
  - Hiển thị timeline trạng thái, người thay đổi và thời điểm.
  - Filter theo trạng thái, người phụ trách, hạn và lớp.
  - Chỉ cho đánh dấu `RESOLVED` khi có ghi chú kết quả xử lý.
- **Tiêu chí nghiệm thu:** một hồ sơ đi được trọn luồng `OPEN → IN_PROGRESS → RESOLVED`, có thể `ESCALATED/REOPENED`, giữ đủ lịch sử.

#### FR-07 — Thay chuông thông báo tĩnh bằng trung tâm công việc

- **Loại:** Thay thế
- **Quy mô:** L
- **Hiện trạng:** chuông luôn có chấm đỏ và nội dung GPA `< 2.0` viết cố định.
- **Giai đoạn 1:** thay bằng dữ liệu nội bộ gồm run cảnh báo mới, hồ sơ hỗ trợ sắp/quá hạn và lỗi import/run.
- **Giai đoạn 2:** nếu quy trình được duyệt, thêm email/thông báo ngoài hệ thống qua worker; ghi trạng thái gửi, lỗi và retry.
- **Nguyên tắc:** chưa có dịch vụ gửi thật thì ghi rõ “ghi nhận đã thực hiện ngoài hệ thống”, không hiển thị như hệ thống đã gửi.
- **Tiêu chí nghiệm thu:** badge bằng đúng số việc chưa đọc/chưa xử lý và không dùng ngưỡng hard-code.

#### FR-08 — Thống nhất hai chế độ cảnh báo

- **Loại:** Chỉnh sửa
- **Quy mô:** L
- **Hiện trạng:**
  - Báo cáo live tính theo GPA và quyết định của kỳ báo cáo.
  - Run cảnh báo dùng snapshot và thêm tiến độ/đăng ký/rèn luyện.
- **Cần làm:**
  - Đặt tên rõ `live monitoring` và `snapshot warning run`, không gọi chung mà không giải thích.
  - Chọn nguồn chuẩn cho từng KPI trên Dashboard và Báo cáo.
  - Mọi số liệu phải trả `mode`, kỳ, policy version, cutoff, coverage và run ID nếu có.
  - Không trộn số live với snapshot trong cùng tỷ lệ nếu không hiển thị nguồn.
- **Tiêu chí nghiệm thu:** cùng một bộ lọc, người dùng giải thích được vì sao số cảnh báo live và run có thể khác nhau.

#### FR-09 — Khôi phục minh bạch nguồn dữ liệu trên Dashboard

- **Loại:** Chỉnh sửa
- **Quy mô:** S/M
- **Bối cảnh:** thay đổi Dashboard hiện tại đã bỏ filter mức cảnh báo/trạng thái hỗ trợ và bỏ khối `dataContext`, trong khi `USER_GUIDE.md` vẫn mô tả các filter này và kiến trúc yêu cầu hiển thị kỳ/cutoff thực tế.
- **Quyết định cần chốt:**
  - Nếu chủ đích là đơn giản hóa Dashboard, cập nhật hướng dẫn và giữ một dòng/tooltip nguồn dữ liệu cô đọng cho từng KPI.
  - Nếu các filter vẫn là yêu cầu, khôi phục chúng ở Báo cáo hoặc Dashboard, không để backend hỗ trợ nhưng UI không truy cập được.
- **Tiêu chí nghiệm thu:** không có KPI nào thiếu kỳ/cutoff/coverage; tài liệu và UI khớp nhau.

#### FR-10 — Sửa chức năng chọn lại policy lịch sử

- **Loại:** Chỉnh sửa
- **Quy mô:** S
- **Vấn đề:** chọn policy cũ cập nhật hai ngưỡng GPA nhưng không cập nhật `conductScoreThreshold`.
- **Cần làm:** tải đủ mọi trường của phiên bản; form lịch sử mặc định read-only và có nút “Tạo phiên bản mới từ bản này”, không sửa nhầm bản lưu trữ.
- **Tiêu chí nghiệm thu:** tạo phiên bản từ policy cũ sao chép đúng toàn bộ ngưỡng và ghi audit.

#### FR-11 — Màn hình tra cứu audit

- **Loại:** Bổ sung
- **Quy mô:** M
- **Chức năng:** tìm theo actor, action, resource, resource ID, request ID và khoảng thời gian; xem chi tiết trước/sau nếu có; chỉ role được cấp quyền mới truy cập.
- **Không cho phép:** sửa/xóa audit từ giao diện nghiệp vụ.
- **Tiêu chí nghiệm thu:** truy được các lần import, xuất báo cáo, đổi quyền, xóa dữ liệu, chạy cảnh báo và cập nhật hỗ trợ.

### 4.3 P1 — Dữ liệu học vụ và kỳ hè

#### FR-12 — Triển khai Phase 1 của thiết kế kỳ hè

- **Loại:** Bổ sung/chỉnh sửa
- **Quy mô:** M
- **Nguồn thiết kế:** `docs/SUMMER_TERM_DESIGN.md`.
- **Phạm vi an toàn, chưa thay đổi công thức nghiệp vụ:**
  - Trả `isSummer` trong `filterOptions.terms` và các DTO liên quan.
  - Phân tách kỳ chính/kỳ hè trong dropdown; thêm badge và banner kỳ phụ.
  - Hồ sơ sinh viên đánh dấu môn, điểm và nội dung rèn luyện phát sinh trong hè.
  - Tự động chọn kỳ báo cáo phải loại kỳ hè bằng `sIsSummer`, không dựa riêng vào coverage 80%.
  - GPA hè thô chỉ hiển thị là số liệu mô tả, không nối vào chuỗi GPA chính thức.
- **Tiêu chí nghiệm thu:** chọn kỳ hè thủ công được nhưng mọi trang đều ghi rõ “kỳ phụ/số liệu mô tả”; kỳ hè không tự trở thành kỳ báo cáo mặc định.

#### FR-13 — Xác nhận và triển khai logic nghiệp vụ kỳ hè

- **Loại:** Bổ sung
- **Quy mô:** L
- **Điều kiện bắt buộc trước khi code:**
  - Xác nhận Portal DLU đã gộp điểm hè vào tổng hợp kỳ chính trước hay chưa.
  - Xác nhận quy ước mã kỳ, quan hệ kỳ chính trước/sau và văn bản áp dụng theo khóa.
  - Xác nhận cách lưu nội dung/điểm rèn luyện hè.
- **Sau khi xác nhận:**
  - Lưu quan hệ kỳ chính trước/sau bằng ID hoặc thời gian, không hard-code `HK03`.
  - Không cho chạy cảnh báo học lực chính thức độc lập trên kỳ hè; nếu cần, tạo mode `SUMMER_MONITORING` không chính thức.
  - Lưu snapshot GPA/xếp hạng trước và sau khi gộp hè, chống cộng trùng.
  - Kết quả học phần hè đáp ứng milestone gốc; không tạo milestone hè.
  - Nội dung rèn luyện hè chuyển đến kỳ đánh giá kế tiếp, không tự cộng/trung bình điểm.
- **Tiêu chí nghiệm thu:** đáp ứng đầy đủ quy tắc R1–R10 trong `SUMMER_TERM_DESIGN.md` và có test cho từng quy tắc.

#### FR-14 — Tổng quát hóa nhóm tự chọn “chọn N trong M”

- **Loại:** Bổ sung/chỉnh sửa schema
- **Quy mô:** L
- **Giải pháp:**
  - Bổ sung cấu hình số môn tối thiểu/tối đa và/hoặc số tín chỉ bắt buộc trên nhóm lựa chọn.
  - Không suy ra yêu cầu nhóm từ số tín chỉ của học phần đầu tiên.
  - Hỗ trợ học phần khác số tín chỉ, học lại, thay thế tương đương và học vượt.
  - Snapshot kết quả phải lưu rule version đã dùng.
- **Tiêu chí nghiệm thu:** test được chọn 1/3, 2/5, đủ tín chỉ với số môn khác nhau, học nhiều hơn mức tối thiểu và môn thay thế.

### 4.4 P1/P2 — Nhập dữ liệu, chất lượng và vận hành

#### FR-15 — Trung tâm nhập dữ liệu có kiểm soát

- **Loại:** Thay thế/mở rộng
- **Quy mô:** L
- **Thay thế:** form JSON rời rạc bằng một luồng import dùng chung.
- **Chức năng:**
  - Hỗ trợ JSON và ưu tiên XLSX/CSV theo mẫu được công bố.
  - Preview/dry-run, đối chiếu cột, kiểm tra phạm vi và báo lỗi theo dòng trước khi ghi.
  - `Idempotency-Key`, checksum file, lịch sử batch, người nhập và nguồn dữ liệu.
  - Tải file lỗi; có chiến lược rollback/compensating action cho batch khi nghiệp vụ cho phép.
  - Bao phủ sinh viên, điểm, quyết định, lớp, CTĐT và các danh mục được phê duyệt.
- **Tiêu chí nghiệm thu:** gửi lại cùng một file không tạo kết quả trùng; lỗi một phần không làm trạng thái không xác định.

#### FR-16 — Bổ sung test frontend, integration và E2E

- **Loại:** Bổ sung
- **Quy mô:** L
- **Tối thiểu:**
  - Unit test cho component/hook quan trọng và `apiFetch` refresh.
  - Integration test với PostgreSQL tạm cho import, RBAC scope, refresh/revoke session, run cảnh báo và export.
  - E2E cho admin, cố vấn và tài khoản chỉ đọc.
  - Dataset >100 bản ghi để bắt lỗi phân trang.
  - Test kỳ hè R1–R10 và nhóm tự chọn N/M.
  - Đưa đặc tả OpenAPI/SWE vào CI để test hiện đang skip được chạy thật.
- **Tiêu chí nghiệm thu:** pipeline CI chạy lint, typecheck, test, build và smoke có xác thực.

#### FR-17 — Bổ sung vận hành production

- **Loại:** Bổ sung
- **Quy mô:** M/L
- **Chức năng:**
  - Health/readiness tách riêng; kiểm tra database và migration version.
  - Log có cấu trúc theo request ID, metric lỗi/độ trễ/import/run/export.
  - Backup và diễn tập restore PostgreSQL.
  - Rate limit dùng kho dùng chung nếu chạy nhiều instance; không chỉ Map trong process.
  - Chính sách retention cho refresh token, audit, snapshot và file xuất.
- **Tiêu chí nghiệm thu:** có runbook triển khai, rollback, backup/restore và xử lý sự cố đăng nhập/import/run thất bại.

### 4.5 P2 — Thay thế, loại bỏ và đồng bộ tài liệu

#### FR-18 — Chuẩn hóa endpoint đánh giá hoàn thành

- **Loại:** Thay thế
- **Quy mô:** S/M
- **Hiện trạng:** tồn tại cả `/training-progress/completion/runs` và `/training-progress/completion-runs`.
- **Kế hoạch:** chọn một URL canonical; alias cũ trả header deprecation trong một chu kỳ; chuyển frontend/test/tài liệu; sau đó loại bỏ alias.

#### FR-19 — Dọn mã placeholder và nhánh không thể xảy ra

- **Loại:** Loại bỏ/thay thế
- **Quy mô:** S
- **Phạm vi:**
  - Xóa `hooks/useWarnings.ts` đang gọi endpoint không tồn tại nếu tiếp tục không được sử dụng.
  - Xóa dữ liệu mock frontend không còn import.
  - Xóa UI “dùng ngưỡng mặc định khi chưa có policy” vì backend trả `WARNING_POLICY_REQUIRED`.
  - Xóa `dashboardStore` stub hoặc triển khai đúng nếu thật sự cần.
- **Tiêu chí nghiệm thu:** không còn endpoint giả, thông báo giả hoặc mã chết trong bundle/lint search.

#### FR-20 — Đồng bộ tài liệu

- **Loại:** Chỉnh sửa
- **Quy mô:** S/M
- **Phạm vi:**
  - Đánh dấu `PROJECT_COMPLETION_PLAN.md` là lịch sử hoặc cập nhật lại phần hiện trạng cũ.
  - Đồng bộ `README.md`, `ARCHITECTURE.md`, `USER_GUIDE.md` với Dashboard, quyền, endpoint canonical và kỳ hè.
  - Mọi chức năng mới phải cập nhật API inventory, migration guide và tiêu chí test.
- **Tiêu chí nghiệm thu:** không còn mô tả CSV/fallback policy/chức năng chưa có trái với mã hiện hành.

---

## 5. Thứ tự triển khai đề xuất

| Đợt | Hạng mục | Kết quả đầu ra |
| --- | --- | --- |
| 0 — Chốt nghiệp vụ | Quy tắc kỳ hè, nguồn GPA hè, quyền đọc danh mục, nguồn chuẩn cảnh báo | Biên bản quyết định và contract dữ liệu |
| 1 — Ổn định nền tảng | FR-01 đến FR-05 | Không thiếu bản ghi; phiên bền; RBAC đúng từ API đến UI |
| 2 — Khép kín cảnh báo/hỗ trợ | FR-06 đến FR-11 | Hồ sơ hỗ trợ có người/hạn; thông báo và nguồn KPI là dữ liệu thật |
| 3 — Nghiệp vụ học vụ | FR-12 đến FR-15 | Kỳ hè đúng quy chế; nhóm tự chọn N/M; import có kiểm soát |
| 4 — Chất lượng và phát hành | FR-16, FR-17 | CI/E2E, backup/restore, quan sát hệ thống |
| 5 — Dọn nợ kỹ thuật | FR-18 đến FR-20 | Một contract API, không còn placeholder, tài liệu đồng bộ |

FR-01 đến FR-05 phải hoàn tất trước khi mở rộng thêm biểu đồ hoặc chức năng nghiên cứu.

---

## 6. Các chức năng chưa nên bổ sung ngay

| Chức năng | Quyết định hiện tại | Điều kiện xem xét lại |
| --- | --- | --- |
| Hoạt động sinh viên/Đoàn–Hội | Không khôi phục | Có nguồn dữ liệu chính thức, độ phủ và quy trình chịu trách nhiệm |
| Cổng sinh viên/phụ huynh | Chưa thuộc S1 | Có yêu cầu xác thực, quyền riêng tư và kênh hỗ trợ được phê duyệt |
| ML dự báo nguy cơ | Giữ cho S2 | Có bộ dữ liệu theo cutoff, nhãn hợp lệ, đánh giá leakage/fairness và baseline |
| Gửi email/SMS tự động | Chưa bật | Có template, người duyệt, consent, nhà cung cấp và quy trình retry |
| Chuyển backend sang NestJS | Không ưu tiên | Có nhu cầu worker/module scale mà Route Handlers không đáp ứng |
| Xóa vật lý bảng hoạt động cũ | Chưa thực hiện | Hoàn tất kiểm kê dữ liệu, backup và phê duyệt migration phá hủy |

---

## 7. Tiêu chí hoàn thành toàn kế hoạch

- [ ] Không có danh sách/dropdown bị cắt âm thầm ở 20 bản ghi.
- [ ] Ma trận RBAC được kiểm thử cho mọi vai trò và data scope.
- [ ] Phiên tự refresh; đổi mật khẩu/khóa tài khoản thu hồi phiên cũ.
- [ ] UI không hiển thị hành động người dùng không có quyền thực hiện.
- [ ] Hồ sơ hỗ trợ có người phụ trách, hạn, quá hạn và lịch sử trạng thái.
- [ ] Không còn chuông/thông báo/ngưỡng cảnh báo hard-code.
- [ ] Dashboard và báo cáo công bố kỳ, cutoff, coverage, policy/run/mode.
- [ ] Kỳ hè tuân thủ R1–R10 và không bị dùng như kỳ chính độc lập.
- [ ] Nhóm tự chọn hỗ trợ N/M và có rule version.
- [ ] Import có preview, idempotency, lịch sử và file lỗi.
- [ ] Audit có thể tra cứu nhưng không thể sửa từ UI.
- [ ] Một endpoint canonical cho completion run.
- [ ] Frontend unit test, backend integration test và E2E có xác thực chạy trong CI.
- [ ] Build production, smoke test, backup/restore và runbook đều được kiểm chứng.
- [ ] README, Architecture, User Guide và API inventory khớp mã nguồn.

---

## 8. Definition of Done cho từng hạng mục

Một hạng mục chỉ được đánh dấu hoàn thành khi có đủ:

1. Quy tắc nghiệp vụ/contract đã được ghi rõ.
2. Backend kiểm tra quyền và data scope, không chỉ ẩn nút ở frontend.
3. Frontend có loading, empty, error và retry hợp lý.
4. Migration/seed tương thích và có phương án rollback nếu thay schema.
5. Audit cho mọi thao tác làm thay đổi dữ liệu quan trọng.
6. Unit/integration/E2E test tương xứng với rủi ro.
7. Lint, typecheck, test và production build đạt.
8. README/Architecture/User Guide/API inventory được cập nhật trong cùng thay đổi.

