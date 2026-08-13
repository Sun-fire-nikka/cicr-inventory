-- ============ 002_seed_test_users.sql ============
-- Seed / verify the test users for the OTP + email pipeline (v1.4.6).
--
--  * 'kush' (kushgdhi@gmail.com) is the ACTIVE student test recipient for the
--    live SMTP OTP probe in test/test-email.cjs (sender kushagragargdelhi@gmail.com
--    -> receiver kushgdhi@gmail.com).
--  * The four @jiit.ac.in accounts cover the institutional email-sinkhole probe.
--
-- Idempotent: role is forced to 'MEMBER' (student) on conflict so 'kush' can
-- never be deactivated or promoted; an existing password_hash is preserved so
-- current logins keep working. A password_hash is only applied on first insert.
--
-- All test students share the seeded password: JiitCICR@2026!

INSERT INTO public.users (name, email, password_hash, roll_number, role) VALUES
  ('kush',                     'kushgdhi@gmail.com',                '$2b$10$6.n0/zWLMCG/2fi2AEo/I.pjadfkOA9dRLbWM3HU6A4hZW8aAzRPi', NULL,            'MEMBER'),
  ('Test Student 992501030406','992501030406@mail.jiit.ac.in',      '$2b$10$6.n0/zWLMCG/2fi2AEo/I.pjadfkOA9dRLbWM3HU6A4hZW8aAzRPi', '992501030406', 'MEMBER'),
  ('Test Student 992501030399','992501030399@gmail.jiit.ac.in',     '$2b$10$6.n0/zWLMCG/2fi2AEo/I.pjadfkOA9dRLbWM3HU6A4hZW8aAzRPi', '992501030399', 'MEMBER'),
  ('Test Student 992401210050','992401210050@gmail.jiit.ac.in',     '$2b$10$6.n0/zWLMCG/2fi2AEo/I.pjadfkOA9dRLbWM3HU6A4hZW8aAzRPi', '992401210050', 'MEMBER'),
  ('Test Student 992401030154','992401030154@mail.jiit.ac.in',      '$2b$10$6.n0/zWLMCG/2fi2AEo/I.pjadfkOA9dRLbWM3HU6A4hZW8aAzRPi', '992401030154', 'MEMBER')
ON CONFLICT (email) DO UPDATE
  SET role = 'MEMBER', name = EXCLUDED.name, roll_number = EXCLUDED.roll_number;
