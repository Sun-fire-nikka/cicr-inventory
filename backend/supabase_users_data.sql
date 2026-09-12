--
-- PostgreSQL database dump
--

\restrict UqvHzZSTZdRqvhrVuf1QqxOxtyfM4MLHXY8rZ96CxpbfqXXS5d7q9Kg1C51V3cA

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, name, email, password_hash, roll_number, role, created_at) FROM stdin;
d1bf08e5-6700-4656-b123-6c0e65e9c72c	CICR Admin	cicrinventory@gmail.com	$2b$10$5jALhgWWRG33FuvEEnPoBu.tYnGRWS8vEIqjXYd3oSNbqmA/8UXTu	\N	ADMIN	2026-09-08 17:00:01.793805+00
612856da-6170-45b7-add0-0d472e2e0bad	Vardaan	vardaansaxena096@gmail.com	$2b$10$pQIk2r4Nur1D1w29J2tuE..ooDKkZJXoEuUfXJ/PJ2ehmQpkVaYAm	\N	ADMIN	2026-09-08 17:01:03.608842+00
\.


--
-- PostgreSQL database dump complete
--

\unrestrict UqvHzZSTZdRqvhrVuf1QqxOxtyfM4MLHXY8rZ96CxpbfqXXS5d7q9Kg1C51V3cA

