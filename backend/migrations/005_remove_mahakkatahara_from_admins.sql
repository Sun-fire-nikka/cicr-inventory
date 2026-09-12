-- ============ 005_remove_mahakkatahara_from_admins.sql ============
-- Ensures mahakkatahara.mk@gmail.com and related accounts are not administrators.
-- The permanent web admins are: vardaansaxena096@gmail.com, cicrinventory@gmail.com

UPDATE public.users 
SET role = 'MEMBER' 
WHERE LOWER(email) IN ('mahakkatahara.mk@gmail.com', '992501030398@mail.jiit.ac.in')
  AND role = 'ADMIN';

-- Ensure master admins remain locked
UPDATE public.users 
SET role = 'ADMIN' 
WHERE LOWER(email) IN ('vardaansaxena096@gmail.com', 'cicrinventory@gmail.com');
