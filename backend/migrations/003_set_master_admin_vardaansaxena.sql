-- ============ 003_set_master_admin_vardaansaxena.sql ============
-- Sets vardaansaxena096@gmail.com and cicrinventory@gmail.com as permanent Super Admins in PostgreSQL.

UPDATE public.users 
SET role = 'ADMIN' 
WHERE LOWER(email) IN ('vardaansaxena096@gmail.com', 'cicrinventory@gmail.com');

-- Verify updated admins
SELECT id, name, email, role, created_at 
FROM public.users 
WHERE role = 'ADMIN';
