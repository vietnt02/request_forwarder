# Request Forwarder - Webhook Extension (v2.1 - Absolute Precision)

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
-   **Action**: Cấu hình URL Webhook đích để nhận dữ liệu.

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
