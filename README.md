# To-Do đồng bộ bằng Supabase

Ứng dụng là static site: Supabase Auth quản lý tài khoản email/mật khẩu và bảng `public.todos` lưu công việc theo từng người dùng. Không có backend riêng. `supabase-config.js` chỉ chứa project URL và anon/publishable key — đây là khóa công khai dành cho client và sẽ hiển thị trong trình duyệt. Mọi quyền truy cập dữ liệu phải được giới hạn bằng RLS; **không bao giờ dùng service_role/secret key trong trình duyệt**.

## Thiết lập Supabase

1. Tạo project Supabase (hoặc dùng project hiện có) và mở **SQL Editor**.
2. Chạy toàn bộ SQL sau để tạo bảng, bật RLS và áp dụng quyền chỉ đọc/ghi dữ liệu của chính tài khoản:

```sql
create table if not exists public.todos (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    text text not null check (char_length(text) between 1 and 2000),
    completed boolean not null default false,
    priority text not null default 'medium'
        check (priority in ('low', 'medium', 'high')),
    due_date date,
    created_at timestamptz not null default now()
);

create index if not exists todos_user_id_created_at_idx
    on public.todos (user_id, created_at);

alter table public.todos enable row level security;
grant select, insert, update, delete on public.todos to authenticated;

drop policy if exists "Users can read their own todos" on public.todos;
create policy "Users can read their own todos"
    on public.todos for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can add their own todos" on public.todos;
create policy "Users can add their own todos"
    on public.todos for insert to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own todos" on public.todos;
create policy "Users can update their own todos"
    on public.todos for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own todos" on public.todos;
create policy "Users can delete their own todos"
    on public.todos for delete to authenticated
    using ((select auth.uid()) = user_id);
```

3. Trong **Authentication → Providers → Email**, bật Email provider. Tùy chọn xác nhận email được Supabase bật mặc định; nếu bật, người đăng ký phải xác nhận email trước khi đăng nhập.
4. Trong **Authentication → URL Configuration**, đặt **Site URL** thành địa chỉ HTTPS mà bạn sẽ host ứng dụng. Thêm địa chỉ đó (và địa chỉ preview nếu cần) vào **Redirect URLs**.
5. Mở project settings/API keys, sao chép **Project URL** và **anon/public key** (hoặc publishable key). Không dùng `service_role` hay secret key.

## Cấu hình, chạy và chia sẻ

1. Mở `supabase-config.js` và thay `YOUR_PROJECT_ID` cùng `YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY` bằng giá trị của project. File này được dùng trực tiếp bởi trình duyệt. Nếu không cấu hình hoặc CDN không tải được, ứng dụng sẽ báo lỗi rõ ràng và không chuyển sang lưu cục bộ.
2. Host toàn bộ thư mục như static site trên dịch vụ HTTPS (ví dụ GitHub Pages, Netlify, Cloudflare Pages hoặc hosting HTTPS khác). Không mở `index.html` bằng `file://`; Supabase Auth cần một origin web.
3. Cả hai máy tính phải truy cập **cùng một URL HTTPS** để dùng cùng phiên bản ứng dụng và cùng project Supabase. Hai bản sao chạy trên `localhost` hoặc hai thư mục local là các origin/phiên bản riêng, không phải cách triển khai/chia sẻ ứng dụng. Có thể chạy máy chủ static local để thử nghiệm, nhưng không dùng URL local làm địa chỉ chung cho hai máy.
4. Mỗi người dùng đăng ký bằng email và mật khẩu trên màn hình ứng dụng; tài khoản cũ kiểu tên đăng nhập không được tự đổi hoặc ánh xạ thành email.

## Nhập công việc từ bản cũ

Các công việc cũ có thể còn trong `localStorage` của trình duyệt trên máy làm việc, dưới các khóa `tasks_<tên đăng nhập cũ>`. Sau khi đăng nhập vào tài khoản Supabase trên **chính trình duyệt/máy cũ**, ứng dụng sẽ hiện công cụ nhập nếu tìm thấy danh sách chưa nhập. Chọn danh sách, kiểm tra nguồn và xác nhận để sao chép công việc lên tài khoản đang đăng nhập. Tên đăng nhập cũ chỉ là nhãn để chọn danh sách; nó không được coi là email hay thông tin xác thực.

Việc nhập không xóa dữ liệu localStorage. Dấu đã nhập được lưu trên trình duyệt đó để tránh nhập trùng ở lần sau. Nếu cần nhập lại, lưu ý có thể tạo bản sao. Sau khi đồng bộ, đăng nhập cùng tài khoản ở URL HTTPS chung trên máy còn lại để xem công việc.

## CDN

Trang tải `@supabase/supabase-js` phiên bản v2 từ jsDelivr, không cần npm/build. Trình duyệt cần truy cập được CDN và Supabase. Nếu triển khai cần hoạt động khi CDN ngoài không khả dụng, hãy vendoring thư viện theo quy trình quản lý dependency của bạn.
