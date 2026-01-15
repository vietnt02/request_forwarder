# Request Forwarder - Webhook Extension (v9 - Zero Latency)

Extension mạnh mẽ giúp bắt (capture) và forward toàn bộ thông tin network request (bao gồm **Response Body**) từ trình duyệt đến nhiều Webhook Server.

## Giao diện Dashboard (v9)
Thiết kế Card Layout tối ưu:
-   **Dòng 1**: Methods & Controls.
-   **Dòng 2**: Condition (URL Match).
-   **Dòng 3**: Action (Forward).

## Zero Overhead Technology (Mới)
Chúng tôi đã áp dụng kỹ thuật **Direct Pass-through** để đảm bảo không làm chậm trình duyệt của bạn:

1.  **XHR**: Hệ thống kiểm tra URL ngay khi khởi tạo (`open`). Nếu không khớp Rule, request sẽ được gửi đi như bình thường mà **không gán thêm bất kỳ event listener nào**.
2.  **Fetch**: Hệ thống kiểm tra URL trước khi gọi API. Nếu không khớp Rule, lệnh `fetch` gốc được gọi trực tiếp, loại bỏ hoàn toàn việc tạo Promise wrapper hay `await`.

Kết quả: **0ms latency** cho các request thông thường (ảnh, css, script, API rác). Extension chỉ hoạt động khi gặp đúng request bạn cần.

## Cài đặt
1.  Vào `chrome://extensions/`.
2.  Bật **Developer mode**.
3.  Chọn **Load unpacked** -> Folder `request_forwarder`.
4.  **Quan trọng**: Reload lại các tab đang mở sau khi cài đặt/update để script mới có hiệu lực.

## Payload
```json
{
  "type": "xhr" | "fetch",
  "method": "POST",
  "url": "https://api.example.com/data",
  "status": 200,
  "requestBody": {...},
  "responseBody": "{\"success\": true}",
  "timestamp": 1679000000000
}
```
