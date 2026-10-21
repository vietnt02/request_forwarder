# Request Forwarder - Webhook Extension (v2.2 - Absolute Precision)

Extension mạnh mẽ giúp bắt (capture) và forward toàn bộ thông tin network request (bao gồm **Request/Response Body**, **Headers**, **Cookies**) từ trình duyệt đến các Webhook Server với độ chính xác tuyệt đối.

## Tính năng nổi bật

-   **Capture Toàn Diện**: Chụp lại Method, URL, Request Body, Response Body, Headers và Cookies.
-   **Độ chính xác 100% (Correlation ID)**: Sử dụng mã định danh liên kết duy nhất cho mỗi request, đảm bảo dữ liệu Body và Header luôn khớp nhau ngay cả khi có hàng loạt request gửi đi đồng thời.
-   **Header Gốc (webRequest API)**: Capture chính xác các Header mà trình duyệt tự động thêm vào tầng mạng như `Origin`, `Referer`, `User-Agent`, `Sec-Fetch-*`.
-   **Cookie Đầy Đủ**: Lấy toàn bộ Cookie từ Header HTTP gốc, bao gồm cả các Cookie bảo mật `HttpOnly` (quan trọng cho các hệ thống của Alibaba, Alipay...).
-   **Zero Latency**: Hệ thống kiểm tra điều kiện ngay lập tức, không gây trễ cho các request không nằm trong danh sách theo dõi.

## Giao diện Dashboard
Thiết kế Card Layout hiện đại, cho phép quản lý nhiều Rule cùng lúc:
-   **Methods**: Chọn các phương thức HTTP cần bắt (GET, POST, PUT, DELETE...).
-   **Condition**: Khớp URL theo dạng "Contains" hoặc "Exact Match".
-   **Capture Options**: Tùy chỉnh bật/tắt việc thu thập Body, Headers, Query Params.
-   **Action**: Cấu hình URL Webhook đích (`webhookUrl`).
-   **Webhook header `Authorization: Bearer` (`webhookToken`)**: Một dòng riêng dưới dòng Action, gồm nhãn `Webhook header  Authorization: Bearer`, ô nhập kiểu password (`placeholder: "token (để trống = không gửi header)"`) chiếm phần còn lại và nút `Show`/`Hide`. Khi `webhookToken` khác rỗng, request POST tới Webhook sẽ đính kèm header `Authorization: Bearer <webhookToken>` (không ghi token ra console). Các Rule cũ không có trường này vẫn hoạt động bình thường.
-   **Chỉ gửi khi request header này đổi giá trị (`dedupHeader`)**: Một dòng riêng với ô nhập tên request header cần theo dõi (mặc định `''` — để trống = gửi mọi lần; `placeholder: "vd Authorization — để trống = gửi mọi lần"`). Khi `dedupHeader` khác rỗng (sau khi `trim`), Extension tìm header đó trong `finalPayload.requestHeaders` không phân biệt hoa/thường: nếu có, tính mã băm SHA-256 (`crypto.subtle.digest`) của giá trị header và so sánh với bản ghi `{ header, hash }` của lần gửi thành công (HTTP 2xx) liền trước của Rule đó tại `dedupHash_<rule.id>` trong `chrome.storage.local` (lưu kèm tên header nên khi đổi `dedupHeader` sang tên khác sẽ không so nhầm với hash cũ). Nếu trùng hash thì bỏ qua không gửi lặp; nếu request không có header đó thì gửi bình thường; chỉ cập nhật hash khi Webhook trả về HTTP 2xx và xoá hash khi xoá Rule. Nếu `dedupHeader` khác rỗng mà Rule không bật tick `Req Headers`, giao diện hiện cảnh báo chữ nhỏ `"cần bật Req Headers"` cạnh ô nhập và background gửi bình thường.

## Ví dụ cấu hình cho Hook Airflow (PingPong Session)
-   **Condition**: `URL Contains` → `/api/` (hoặc endpoint API của PingPong cần theo dõi).
-   **Capture Options**: Bật `Req Headers`.
-   **Target Webhook URL**: `https://airflow.topasglobal.com/hooks/pingpong-session`
-   **Webhook header `Authorization: Bearer` (`webhookToken`)**: `<YOUR_AIRFLOW_WEBHOOK_BEARER_TOKEN>` (nhập token xác thực của hook Airflow, không commit token thật).
-   **Chỉ gửi khi request header này đổi giá trị (`dedupHeader`)**: `Authorization`

## Cài đặt
1.  Vào `chrome://extensions/`.
2.  Bật **Developer mode**.
3.  Chọn **Load unpacked** -> Folder `request_forwarder`.
4.  **Quan trọng**: Chấp nhận các quyền mới (`webRequest`, `cookies`) và reload lại các tab đang mở để Extension có hiệu lực.

## Cấu trúc Payload gửi đến Webhook
```json
{
  "type": "xhr" | "fetch",
  "method": "POST",
  "url": "https://api.example.com/data",
  "status": 200,
  "requestHeaders": {
    "Content-Type": "application/json",
    "Origin": "https://source.com",
    "Referer": "https://source.com/page",
    "Cookie": "session_id=...; tfstk=...; spanner=...",
    ...
  },
  "requestBody": {...},
  "responseBody": "...",
  "responseHeaders": {...},
  "timestamp": 1679000000000,
  "pageUrl": "https://source.com/current-page"
}
```

## Lưu ý bảo mật
Extension tự động loại bỏ mã định danh nội bộ (`X-Request-Forwarder-Id`) trước khi gửi đến Webhook để đảm bảo dữ liệu sạch và không làm thay đổi hành vi chuẩn của trang web gốc.
