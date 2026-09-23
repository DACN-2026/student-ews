# Báo Cáo Chi Tiết Hệ Thống Theo Dõi và Cảnh Báo Sớm Sinh Viên (SEWS)

## 1. Thông Tin Chung
- **Tên dự án**: SEWS — Student Early Warning System (Hệ thống theo dõi học vụ và cảnh báo sớm sinh viên)
- **Đơn vị thụ hưởng**: Khoa Công nghệ Thông tin, Trường Đại học Đà Lạt.
- **Mục tiêu**: Tập trung dữ liệu sinh viên, kết quả học tập và chương trình đào tạo để hỗ trợ cán bộ theo dõi tiến độ, nhận diện các trường hợp cần quan tâm, lập báo cáo và ra quyết định hỗ trợ kịp thời.
- **Phạm vi hiện tại**: Hoàn thiện và kiểm chứng các chức năng học vụ (hồ sơ, điểm, đăng ký, quyết định, tiến độ đào tạo, cảnh báo theo quy tắc, nhật ký hỗ trợ, phân quyền và báo cáo). Các tính năng học máy và dự báo được định hướng cho giai đoạn nghiên cứu khoa học tiếp theo.

## 2. Kiến Trúc Hệ Thống và Công Nghệ
Hệ thống áp dụng kiến trúc phần mềm **Client-Server** và được tổ chức theo cấu trúc **npm monorepo**, bao gồm 2 ứng dụng hoạt động hoàn toàn độc lập nhưng chia sẻ cùng một CSDL:

- **Frontend (Giao diện người dùng)**:
  - Công nghệ: Next.js 16.3.4, React 19, TypeScript.
  - Giao diện: Tailwind CSS 4, Lucide React, Recharts.
  - Quản lý trạng thái: Zustand.
  - Vai trò: Hiển thị giao diện tương tác, giao tiếp với backend thông qua Proxy API `/api/v1` (tại port 3000).
- **Backend (API và Xử lý nghiệp vụ)**:
  - Công nghệ: Next.js Route Handlers, TypeScript.
  - Vai trò: Xử lý 97 route API, thực thi nghiệp vụ (Services), phân quyền RBAC và tương tác dữ liệu. Chạy độc lập (tại port 3001).
- **Cơ sở dữ liệu (Persistence)**: 
  - Công nghệ: PostgreSQL kết hợp với ORM Prisma 6.
- **Bảo mật và Xác thực**:
  - Dùng JWT (`jose`), `bcryptjs`, HttpOnly cookies. Kiểm tra Origin nghiêm ngặt để chống CSRF và áp dụng phân quyền người dùng (Role-Based Access Control).

## 3. Cấu Trúc Dữ Liệu (Mô Hình Dữ Liệu)
Cơ sở dữ liệu được thiết kế chia thành các miền nghiệp vụ rõ ràng, bao gồm:
1. **Tổ chức đào tạo**: Quản lý Sinh viên (`Student`), Lớp (`Class`), Khóa (`Cohort`), Năm học (`AcademicYear`), Học kỳ (`AcademicTerm`).
2. **Chương trình đào tạo (CTĐT)**: Quản lý Khung chương trình (`TrainingProgram`), Học phần (`Course`), và phân bổ tín chỉ (`TrainingProgramCourse`).
3. **Đăng ký và Kết quả**: Lớp học phần (`StudentCourseOffering`), Điểm (`StudentCourseGrade`), và Tổng kết điểm học kỳ/tích lũy (`StudentTermSummary`, `StudentCumulativeSummary`).
4. **Tiến độ và Hoàn thành**: Kế hoạch tiến độ (`TrainingProgressPlan`), đợt đánh giá tiến độ (`TrainingProgressCalculationRun`) và đợt đối chiếu hoàn thành CTĐT (`TrainingProgressCompletionRun`).
5. **Cảnh báo học vụ**: Chính sách cảnh báo (`AcademicWarningPolicy`), Đợt chạy cảnh báo (`AcademicWarningRun`), Danh sách lý do bị cảnh báo và Kết quả sinh viên.
6. **Hỗ trợ sinh viên**: Nhật ký hành động (`WarningAction`) ghi nhận các bước hỗ trợ (OPEN, IN_PROGRESS, RESOLVED).
7. **Phân quyền và Phân công**: Quản lý người dùng, vai trò, quyền, phân công Cố vấn học tập và lưu vết hệ thống (`AuditLog`).

## 4. Các Phân Hệ Chức Năng Chính và Luồng Hoạt Động

### 4.1. Chức năng Tiến độ Đào tạo và Hoàn thành CTĐT
Chức năng này giúp theo dõi và đánh giá việc sinh viên học tập có đúng với lộ trình chương trình đào tạo quy định hay không.
**Luồng hoạt động (Operational Flow):**
1. **Khởi tạo Kế hoạch (Plan creation):** Cán bộ tạo `TrainingProgressPlan` (Kế hoạch tiến độ) dựa trên CTĐT chuẩn của khóa. Kế hoạch này được quản lý theo phiên bản (version) và sẽ được khóa lại (lock) thành một bản snapshot bất biến để làm gốc đối chiếu.
2. **Đánh giá Đăng ký (Calculation Run):** 
   - Hệ thống trích xuất danh sách các học phần mà sinh viên có tên trong học kỳ (được nội suy từ dữ liệu bảng điểm do nguồn Apidog cung cấp, bao gồm cả các môn chưa có điểm). 
   - Đối chiếu các học phần này với kế hoạch: kiểm tra sinh viên có học đủ các học phần bắt buộc và yêu cầu tín chỉ môn tự chọn hay không. 
   - Kết quả đối chiếu (`pass`, `fail`, `data_error`) quyết định trạng thái tiến độ đến kỳ xét: đúng tiến độ (`on_track`), chậm tiến độ (`behind_schedule`), hoặc đang chờ dữ liệu (`pending_result`).
3. **Đánh giá Hoàn thành (Completion Run):** 
   - Hệ thống quét bằng chứng điểm (học phần đạt, đã qua). 
   - Đối chiếu điểm đạt với các yêu cầu của kế hoạch. 
   - Kết luận mức độ hoàn thành: đã hoàn thành (`completed`), chưa hoàn thành (`incomplete`), không thể xác định (`cannot_determine`).
4. **Truy vết và Lưu trữ:** Mỗi lần chạy (Run) hệ thống sẽ sinh ra một checksum (hash) và chụp lại toàn bộ dữ liệu (snapshot) tại thời điểm chạy. Điều này đảm bảo kết quả cũ không bị ghi đè, và cán bộ có thể kiểm tra lại cây yêu cầu (Requirement Tree) giải thích chi tiết tại sao sinh viên chưa đạt tiến độ.

### 4.2. Chức năng Dự kiến Sinh viên Tốt nghiệp (Graduation Forecast)
Chức năng đánh giá xem sinh viên đã hội đủ các điều kiện để xét tốt nghiệp trong tương lai gần hay chưa.
**Luồng hoạt động (Operational Flow):**
1. **Khởi tạo Phiên đánh giá:** Cán bộ tạo một phiên đánh giá (`GraduationEvaluation`). Hệ thống sẽ tự động liên kết hoặc tạo mới một đợt đánh giá Hoàn thành CTĐT (Completion Run) ở chế độ dự báo (`graduation_forecast`).
2. **Kiểm tra Điều kiện (Rules Validation):**
   - Lấy dữ liệu quy tắc tốt nghiệp (`GraduationRule`) với các thông số: số tín chỉ tối thiểu (ví dụ 150 tc), GPA tích lũy.
   - Quét dữ liệu kết quả học phần, tích hợp cùng với trạng thái của các điều kiện ngoài điểm như: Giáo dục Thể chất, Giáo dục Quốc phòng, Ngoại ngữ, Điểm rèn luyện toàn khóa và Tình trạng kỷ luật/pháp lý.
3. **Phân loại Trạng thái:** Kết quả của mỗi sinh viên sẽ được lọc theo thứ tự ưu tiên từ dưới lên thông qua 5 trạng thái (loại trừ lẫn nhau):
   - `MANUAL_REVIEW`: Thiếu dữ liệu quan trọng, cần cán bộ rà soát thủ công.
   - `NOT_ELIGIBLE`: Xác định chắc chắn không đủ điều kiện (vi phạm kỷ luật, thiếu tín chỉ bắt buộc mà không còn khả năng bù đắp).
   - `PENDING_GRADE`: Đã học đủ nhưng đang chờ công bố điểm.
   - `PENDING_REQUIREMENT`: Xong tín chỉ nhưng nợ chứng chỉ (Ngoại ngữ, GDTC, GDQP...).
   - `EXPECTED_ELIGIBLE`: Đủ điều kiện dự kiến.
4. **Báo cáo và Log:** Hệ thống cung cấp bảng tổng hợp chi tiết mức độ đáp ứng từng tiêu chí và cho phép xuất file XLSX/PDF kèm lưu vết (`AuditLog`).

### 4.3. Chức năng Cảnh báo Học vụ và Nhật ký Hỗ trợ
Hệ thống tự động phát hiện sinh viên rơi vào các rủi ro học tập để Cố vấn học tập (CVHT) có thể can thiệp kịp thời.
**Luồng hoạt động (Operational Flow):**
1. **Lấy chính sách hiện hành:** Hệ thống áp dụng `AcademicWarningPolicy` (Chính sách cảnh báo) phiên bản mới nhất đang được active, chứa các ngưỡng GPA quy định.
2. **Chạy đợt cảnh báo (Warning Run):**
   - Hệ thống thu thập kết quả tiến độ đăng ký, kết quả hoàn thành CTĐT, GPA học kỳ, GPA tích lũy và các quyết định cảnh báo cũ của sinh viên trong học kỳ xét.
   - So khớp và gán mã nguyên nhân lỗi nhịp học:
     - Chậm đăng ký so với lộ trình (`REGISTRATION_BEHIND` - mức Vàng).
     - Chậm tiến độ hoàn thành chương trình (`PROGRAM_PROGRESS_BEHIND` - mức Đỏ).
     - Điểm GPA học kỳ thấp hơn ngưỡng quy định (`LOW_TERM_GPA` - mức Vàng).
     - Điểm GPA tích lũy thấp hơn ngưỡng quy định (`LOW_CUMULATIVE_GPA` - mức Đỏ).
     - Đã có quyết định cảnh báo học vụ trước đó (`ACADEMIC_WARNING_DECISION` - mức Đỏ).
3. **Phân loại Mức độ Cảnh báo:** Hệ thống tổng hợp các mã nguyên nhân. Mức độ cảnh báo chung của sinh viên được quyết định theo nguyên nhân có mức nghiêm trọng cao nhất: Không có lỗi (Xanh) -> Lỗi mức trung bình (Vàng) -> Lỗi mức cao (Đỏ). Snapshot của đợt tính sẽ được băm mã hóa (hash) và lưu lại vĩnh viễn.
4. **Xử lý Nhật ký Hỗ trợ (Warning Action):**
   - Cố vấn học tập nhận báo cáo sinh viên cảnh báo, tiến hành trao đổi và tư vấn.
   - CVHT lập hồ sơ hành động hỗ trợ (`WarningAction`), ghi lại nguyên nhân thực tế và biện pháp giải quyết. 
   - Trạng thái hồ sơ được cập nhật chặt chẽ: `OPEN` (Mới tạo) -> `IN_PROGRESS` (Đang xử lý) -> `RESOLVED` (Hoàn tất hỗ trợ). Quá trình chuyển đổi trạng thái và ai là người thực hiện đều được lưu vào Audit Log để đảm bảo trách nhiệm. Lưu ý, trạng thái `RESOLVED` chỉ có nghĩa là hoàn tất quy trình hỗ trợ, không đồng nghĩa sinh viên tự động hết cảnh báo nếu số liệu học tập chưa cải thiện ở kỳ sau.

### 4.4. Báo cáo, Thống kê và Xuất dữ liệu
- **Dashboard Thời gian thực**: Thống kê số lượng sinh viên cảnh báo dựa trên kỳ báo cáo tự động (loại bỏ kỳ hè và ưu tiên kỳ có độ phủ điểm số trên 80%).
- **Xuất file báo cáo**: Hỗ trợ xuất file Excel (.xlsx) thông qua `ExcelJS` (cho danh sách cảnh báo, tiến độ, rèn luyện) và định dạng PDF thông qua `PDFKit` (cho báo cáo hồ sơ sinh viên tổng hợp với font tiếng Việt Noto Sans). Cán bộ xuất file phải có quyền `report.export` và tác vụ này đều được theo dõi bằng cơ chế Audit Log của hệ thống.

## 5. Hướng Phát Triển Tương Lai (Kiến trúc Machine Learning)
Giai đoạn nghiên cứu khoa học sắp tới sẽ tích hợp Pipeline học máy (Machine Learning) nhằm chuyển hệ thống từ "cảnh báo sau sự cố" sang "dự báo sớm nguy cơ":
- **Bài toán**: Ước lượng nguy cơ một sinh viên bị cảnh báo học vụ ở học kỳ tiếp theo.
- **Đặc trưng (Features)**: Xu hướng thay đổi GPA, nợ tín chỉ, số môn học lại, tiền sử cảnh báo và hoạt động ngoại khóa.
- **Kiến trúc đề xuất**: Triển khai các thuật toán học máy (như Random Forest, Decision Tree hoặc Logistic Regression) trên nền tảng Python độc lập (FastAPI, Redis), tính toán theo lô (batch) và kết nối tới SEWS qua API để hiển thị mức nguy cơ (Xác suất) lên Dashboard hỗ trợ dự báo.

## 6. Vận Hành và Triển Khai
- **Môi trường**: Hệ thống yêu cầu Node.js >= 20.9 và PostgreSQL.
- **Triển khai linh hoạt**: Frontend và Backend có thể chạy, build và scale hoàn toàn độc lập nhờ cấu trúc NPM workspaces (`npm run dev`, `npm run build`). Proxy linh hoạt cấu hình qua `BACKEND_URL`.
- **Đảm bảo chất lượng**: Có hệ thống scripts hỗ trợ kiểm thử Unit Test, Smoke Test (`npm run test`, `npm run test:smoke`) để đảm bảo logic API/Auth và các xử lý nghiệp vụ phức tạp không bị phá vỡ khi cập nhật. 
- **Thiết lập nhanh**: Lệnh khởi tạo (`npm run db:seed`) giúp tạo tự động các tài khoản, role, permission và policy cảnh báo ban đầu để vận hành demo hoặc chuẩn bị cho triển khai thực tế. Mật khẩu môi trường thực tế cần được ghi đè qua cấu hình biến môi trường (`.env`).

---
*Báo cáo được tổng hợp dựa trên tài liệu kiến trúc và thực trạng hệ thống SEWS (phiên bản 4.4 - Cập nhật tháng 09/2026).*
