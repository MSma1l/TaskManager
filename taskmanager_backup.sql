--
-- PostgreSQL database dump
--

\restrict C5M9l4ZrVDc6MSJuGdn3NkXPgSw6MXlzPWM3Vvap8qArzTAgLQvqFg5fmPbcdmd

-- Dumped from database version 15.17
-- Dumped by pg_dump version 15.17

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: taskstatus; Type: TYPE; Schema: public; Owner: taskuser
--

CREATE TYPE public.taskstatus AS ENUM (
    'PENDING',
    'DONE',
    'SKIPPED',
    'NOT_DONE'
);


ALTER TYPE public.taskstatus OWNER TO taskuser;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: access_requests; Type: TABLE; Schema: public; Owner: taskuser
--

CREATE TABLE public.access_requests (
    id character varying NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    email character varying(150),
    phone character varying(40),
    telegram_chat_id character varying(50),
    purpose character varying(20) DEFAULT 'personal'::character varying NOT NULL,
    reason text,
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    rejection_reason text,
    processed_by_user_id character varying,
    processed_at timestamp without time zone,
    created_user_id character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.access_requests OWNER TO taskuser;

--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: taskuser
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


ALTER TABLE public.alembic_version OWNER TO taskuser;

--
-- Name: calendar_events; Type: TABLE; Schema: public; Owner: taskuser
--

CREATE TABLE public.calendar_events (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    color character varying(20) DEFAULT '#3b82f6'::character varying,
    event_date date NOT NULL,
    start_time character varying(5) NOT NULL,
    end_time character varying(5) NOT NULL,
    is_deleted boolean DEFAULT false,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    event_type character varying(20) DEFAULT 'personal'::character varying NOT NULL,
    location character varying(255),
    meeting_url character varying(500),
    is_all_day boolean DEFAULT false NOT NULL,
    event_status character varying(20) DEFAULT 'CONFIRMED'::character varying NOT NULL,
    recurrence_rule character varying(20),
    recurrence_until date,
    reminder_minutes json,
    attendees json,
    category_id character varying,
    attendance_status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    attendance_note text
);


ALTER TABLE public.calendar_events OWNER TO taskuser;

--
-- Name: calendar_reminder_logs; Type: TABLE; Schema: public; Owner: taskuser
--

CREATE TABLE public.calendar_reminder_logs (
    id character varying NOT NULL,
    event_id character varying NOT NULL,
    occurrence_date date NOT NULL,
    minutes_before character varying(10) NOT NULL,
    channel character varying(20) NOT NULL,
    fired_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.calendar_reminder_logs OWNER TO taskuser;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: taskuser
--

CREATE TABLE public.categories (
    id character varying NOT NULL,
    name character varying NOT NULL,
    icon character varying NOT NULL,
    color character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.categories OWNER TO taskuser;

--
-- Name: event_categories; Type: TABLE; Schema: public; Owner: taskuser
--

CREATE TABLE public.event_categories (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    name character varying(80) NOT NULL,
    color character varying(20) DEFAULT '#3b82f6'::character varying NOT NULL,
    icon character varying(20),
    is_visible boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    sort_order character varying(10),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.event_categories OWNER TO taskuser;

--
-- Name: login_codes; Type: TABLE; Schema: public; Owner: taskuser
--

CREATE TABLE public.login_codes (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    code_hash character varying(200) NOT NULL,
    purpose character varying(20) DEFAULT 'login'::character varying NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    used_at timestamp without time zone,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.login_codes OWNER TO taskuser;

--
-- Name: nb_note_history; Type: TABLE; Schema: public; Owner: taskuser
--

CREATE TABLE public.nb_note_history (
    id character varying NOT NULL,
    note_id character varying NOT NULL,
    content text NOT NULL,
    edited_at timestamp without time zone
);


ALTER TABLE public.nb_note_history OWNER TO taskuser;

--
-- Name: nb_notes; Type: TABLE; Schema: public; Owner: taskuser
--

CREATE TABLE public.nb_notes (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    note_type character varying(20) NOT NULL,
    topic_id character varying,
    content text NOT NULL,
    step_order smallint,
    task_status character varying(20),
    is_deleted boolean DEFAULT false,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


ALTER TABLE public.nb_notes OWNER TO taskuser;

--
-- Name: nb_sketches; Type: TABLE; Schema: public; Owner: taskuser
--

CREATE TABLE public.nb_sketches (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    topic_id character varying,
    title character varying(150),
    image_data text NOT NULL,
    width integer,
    height integer,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.nb_sketches OWNER TO taskuser;

--
-- Name: nb_topics; Type: TABLE; Schema: public; Owner: taskuser
--

CREATE TABLE public.nb_topics (
    id character varying NOT NULL,
    user_id character varying NOT NULL,
    name character varying(100) NOT NULL,
    description character varying(500),
    emoji character varying(10),
    is_predefined boolean DEFAULT false,
    is_deleted boolean DEFAULT false,
    created_at timestamp without time zone
);


ALTER TABLE public.nb_topics OWNER TO taskuser;

--
-- Name: projects; Type: TABLE; Schema: public; Owner: taskuser
--

CREATE TABLE public.projects (
    id character varying NOT NULL,
    name character varying NOT NULL,
    description text,
    github_url character varying,
    color character varying DEFAULT '#3b82f6'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


ALTER TABLE public.projects OWNER TO taskuser;

--
-- Name: reminder_logs; Type: TABLE; Schema: public; Owner: taskuser
--

CREATE TABLE public.reminder_logs (
    id character varying NOT NULL,
    task_id character varying NOT NULL,
    sent_at timestamp without time zone DEFAULT now(),
    channel character varying NOT NULL
);


ALTER TABLE public.reminder_logs OWNER TO taskuser;

--
-- Name: task_completions; Type: TABLE; Schema: public; Owner: taskuser
--

CREATE TABLE public.task_completions (
    id character varying NOT NULL,
    task_id character varying NOT NULL,
    week_start timestamp without time zone NOT NULL,
    status public.taskstatus DEFAULT 'PENDING'::public.taskstatus NOT NULL,
    completed_at timestamp without time zone,
    moved_to_date timestamp without time zone,
    skip_reason text,
    note text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.task_completions OWNER TO taskuser;

--
-- Name: tasks; Type: TABLE; Schema: public; Owner: taskuser
--

CREATE TABLE public.tasks (
    id character varying NOT NULL,
    title character varying NOT NULL,
    description text,
    category_id character varying NOT NULL,
    day_of_week integer NOT NULL,
    scheduled_date timestamp without time zone,
    reminder_time character varying,
    is_recurring boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    priority character varying DEFAULT 'MEDIUM'::character varying NOT NULL,
    estimated_minutes integer,
    project_id character varying
);


ALTER TABLE public.tasks OWNER TO taskuser;

--
-- Name: telegram_sessions; Type: TABLE; Schema: public; Owner: taskuser
--

CREATE TABLE public.telegram_sessions (
    chat_id character varying NOT NULL,
    state text NOT NULL,
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.telegram_sessions OWNER TO taskuser;

--
-- Name: users; Type: TABLE; Schema: public; Owner: taskuser
--

CREATE TABLE public.users (
    id character varying NOT NULL,
    username character varying(50) NOT NULL,
    email character varying(150),
    full_name character varying(150),
    telegram_chat_id character varying(50),
    role character varying(20) DEFAULT 'USER'::character varying NOT NULL,
    pin_hash character varying(200),
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    theme character varying(20) DEFAULT 'dark'::character varying NOT NULL,
    notification_settings json,
    password_hash character varying(200),
    phone character varying(40)
);


ALTER TABLE public.users OWNER TO taskuser;

--
-- Data for Name: access_requests; Type: TABLE DATA; Schema: public; Owner: taskuser
--

COPY public.access_requests (id, first_name, last_name, email, phone, telegram_chat_id, purpose, reason, status, rejection_reason, processed_by_user_id, processed_at, created_user_id, created_at) FROM stdin;
fb15f030d26b48f8a8d9ad382	Test	User	test@example.com	+373-12345	99999999	personal	test request	REJECTED	\N	1165760598	2026-05-04 09:11:59.973242	\N	2026-05-04 07:06:45.567363
\.


--
-- Data for Name: alembic_version; Type: TABLE DATA; Schema: public; Owner: taskuser
--

COPY public.alembic_version (version_num) FROM stdin;
011
\.


--
-- Data for Name: calendar_events; Type: TABLE DATA; Schema: public; Owner: taskuser
--

COPY public.calendar_events (id, user_id, title, description, color, event_date, start_time, end_time, is_deleted, created_at, updated_at, event_type, location, meeting_url, is_all_day, event_status, recurrence_rule, recurrence_until, reminder_minutes, attendees, category_id, attendance_status, attendance_note) FROM stdin;
f8a62c41ac524e07af0212882	1165760598	Servicui	Crowe Turcan Mikhailenco	#ef4444	2026-03-18	09:00	18:00	f	2026-03-18 14:37:40.90213	2026-03-18 14:37:40.902135	personal	\N	\N	f	CONFIRMED	\N	\N	\N	\N	\N	PENDING	\N
19190757342341b1a78c2e088	1165760598	Priblare	Primblare cu prietena Deea	#ec4899	2026-03-18	18:00	20:00	f	2026-03-18 14:38:26.795339	2026-03-18 14:38:26.795342	personal	\N	\N	f	CONFIRMED	\N	\N	\N	\N	\N	PENDING	\N
40d9659e5aed4fcf8b2afd667	1165760598	Drumul spre casa	Drumul spre camin	#22c55e	2026-03-18	20:00	21:00	f	2026-03-18 14:39:03.096203	2026-03-18 14:39:03.096205	personal	\N	\N	f	CONFIRMED	\N	\N	\N	\N	\N	PENDING	\N
65430eec53164b518bbe26776	1165760598	Trezirea	Trezirea	#3b82f6	2026-03-18	06:00	06:10	f	2026-03-18 14:39:34.953473	2026-03-18 14:39:34.953478	personal	\N	\N	f	CONFIRMED	\N	\N	\N	\N	\N	PENDING	\N
4fcc3eac647e4d54820507a35	1165760598	Baie+Haine	Baie si imbracarea	#ef4444	2026-03-18	06:15	06:40	f	2026-03-18 14:40:25.558496	2026-03-18 14:40:32.827479	personal	\N	\N	f	CONFIRMED	\N	\N	\N	\N	\N	PENDING	\N
193c08568cd84a73ad7306a6a	1165760598	Drumul spre Prietena	\N	#eab308	2026-03-18	06:45	07:30	f	2026-03-18 14:41:01.856254	2026-03-18 14:41:01.856256	personal	\N	\N	f	CONFIRMED	\N	\N	\N	\N	\N	PENDING	\N
18148e84d56c4873aa9ca3518	1165760598	English (copie)	Ora de limba engleza	#ef4444	2026-05-05	08:00	08:50	t	2026-05-04 07:37:45.297099	2026-05-04 07:37:50.376481	personal	str. A. Susev 29	\N	f	CONFIRMED	\N	\N	[15]	null	cb939d38f3d2423f9a419d845	PENDING	\N
3fccb0169337499892d72faed	1165760598	Generation Moldova (copie)	Generation Moldova sedinta cu Alina Dobrovolscaia	#a855f7	2026-05-05	17:00	20:00	t	2026-05-04 09:16:23.859278	2026-05-04 09:16:44.860961	meeting_in_person	CBC, бул. Гагарина 10	\N	f	CONFIRMED	\N	\N	[15]	null	1741e9e65ef0436399ad72cf3	PENDING	\N
0e97a8451d3947b98a0c18cd3	1165760598	Generation Moldova	Generation Moldova sedinta cu Alina Dobrovolscaia	#a855f7	2026-05-04	17:00	20:00	t	2026-05-04 09:16:14.394358	2026-05-04 09:16:49.364259	meeting_in_person	CBC, бул. Гагарина 10	\N	f	CONFIRMED	\N	\N	[15]	null	1741e9e65ef0436399ad72cf3	PENDING	\N
31b7f5d7df4f4f8fb40ff4f3c	1165760598	Generation Moldova	Generation Moldova sedinta cu Alina Dobrovolscaia	#a855f7	2026-05-14	17:00	20:00	f	2026-05-04 09:17:02.786695	2026-05-04 09:17:02.786698	meeting_in_person	CBC, бул. Гагарина 10	\N	f	CONFIRMED	\N	\N	[15]	null	1741e9e65ef0436399ad72cf3	PENDING	\N
5b510984f2f64ac5bed186983	1165760598	Generation Moldova	Generation Moldova sedinta cu Alina Dobrovolscaia	#a855f7	2026-05-04	17:00	20:00	t	2026-05-04 09:16:53.616741	2026-05-04 09:17:07.41671	meeting_in_person	CBC, бул. Гагарина 10	\N	f	CONFIRMED	\N	\N	[15]	null	1741e9e65ef0436399ad72cf3	PENDING	\N
7d7802c38aed484081f48e08c	1165760598	English	Ora de limba engleza	#ef4444	2026-05-04	08:00	08:50	f	2026-05-03 06:23:17.624472	2026-05-04 09:41:35.293751	personal	str. A. Susev 29	\N	f	CONFIRMED	\N	\N	[15]	null	cb939d38f3d2423f9a419d845	ATTENDED	fonetica la litere si cuvinte !!!
7d3e9281dff64f5eb2c41746d	1165760598	Sedinta in office	Meet cu echipa din officiu	#22c55e	2026-05-04	09:15	10:00	f	2026-05-03 06:21:03.1486	2026-05-04 09:41:56.216951	meeting_in_person	str. A. Susev 29	\N	f	CONFIRMED	WEEKLY	\N	[15]	null	f77ef4ac8c4d43899d13907c5	ATTENDED	plan fix  am descutat ce este si ce trebuie de integrat
\.


--
-- Data for Name: calendar_reminder_logs; Type: TABLE DATA; Schema: public; Owner: taskuser
--

COPY public.calendar_reminder_logs (id, event_id, occurrence_date, minutes_before, channel, fired_at) FROM stdin;
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: taskuser
--

COPY public.categories (id, name, icon, color, created_at) FROM stdin;
cat-infrastructure	Infrastructure	🖥️	#3B82F6	2026-03-06 11:08:29.521962
cat-deploy	Deploy	🚀	#10B981	2026-03-06 11:08:29.521965
cat-monitoring	Monitoring	📊	#F59E0B	2026-03-06 11:08:29.521966
cat-security	Security	🔒	#EF4444	2026-03-06 11:08:29.521966
cat-personal	Personal	👤	#8B5CF6	2026-03-06 11:08:29.521968
cat-other	Other	📌	#6B7280	2026-03-06 11:08:29.521969
\.


--
-- Data for Name: event_categories; Type: TABLE DATA; Schema: public; Owner: taskuser
--

COPY public.event_categories (id, user_id, name, color, icon, is_visible, is_default, sort_order, created_at, updated_at) FROM stdin;
f77ef4ac8c4d43899d13907c5	1165760598	Munca	#3b82f6	💼	t	t	0	2026-05-03 06:08:06.875274	2026-05-03 06:08:06.87528
cb939d38f3d2423f9a419d845	1165760598	Personal	#a855f7	🏠	t	f	1	2026-05-03 06:08:06.875298	2026-05-03 06:08:06.875299
19785a08ca1f4f5d946f9eb68	1165760598	Important	#f97316	⭐	t	f	4	2026-05-03 06:08:06.875344	2026-05-03 06:08:06.875345
1d9889870c6742b2bfefc3364	1165760598	Sanatate	#ef4444	❤️	t	f	3	2026-05-03 06:08:06.875328	2026-05-03 06:09:48.918517
7e2dc4f4cd9f4d52a4c1e79b9	1165760598	Familie	#22c55e	👨‍👩‍👧	t	f	2	2026-05-03 06:08:06.875311	2026-05-03 06:09:49.902982
1741e9e65ef0436399ad72cf3	1165760598	Generation Moldova	#903bf7	\N	t	f	\N	2026-05-04 09:14:08.111857	2026-05-04 09:14:08.111861
\.


--
-- Data for Name: login_codes; Type: TABLE DATA; Schema: public; Owner: taskuser
--

COPY public.login_codes (id, user_id, code_hash, purpose, attempts, used_at, expires_at, created_at) FROM stdin;
d2f6d0bfb65b4518b9a9fd8ed	1165760598	8da9e7bd161806bbb4d34dae20adcf933d51f28a79a634793307906dcc780b1e	login	0	2026-05-03 06:07:27.00181	2026-05-03 06:08:48.500107	2026-05-03 06:03:48.508126
2fbbb195b1624915a4aa616ef	1165760598	71da38798981bc35c7860799e820370b08026e5efb486db630e8c5461a78cda0	login	1	2026-05-03 06:07:36.434965	2026-05-03 06:12:27.005005	2026-05-03 06:07:27.006279
5142d1a61e50452ca43e57574	1165760598	2c01cc5f9cfeeda9c2324acaa8e5c4855ff93d96263c6dbe5a2fb42b9b583f24	login	1	2026-05-04 07:36:34.745371	2026-05-04 07:40:42.483556	2026-05-04 07:35:42.506102
8472d509656b4212bad0e4de0	1165760598	6c7f662db5350e5d5b2d04e68b2d0ff18564a54eb9d9f739f003363763301730	login	1	2026-05-04 11:57:23.767664	2026-05-04 12:02:06.694618	2026-05-04 11:57:06.710006
\.


--
-- Data for Name: nb_note_history; Type: TABLE DATA; Schema: public; Owner: taskuser
--

COPY public.nb_note_history (id, note_id, content, edited_at) FROM stdin;
db15bc2cb15d44708a8ca5ded	493f63d2097f4486a40d5c316	Mananc	2026-03-09 10:27:25.949235
ba040e5c808142bfb1d95c272	a83b63a7847f4db38d9f36e01	Biznes check	2026-03-09 10:27:55.095118
c9a214bb2b8843b4aa788dbef	989153767ef7434f8440ef5fa	docker exec bizzcheck_postgres env\ncomanda penttru a afla datele si a conecta o baza de date la table plus in pogres sql	2026-03-09 10:40:49.760945
\.


--
-- Data for Name: nb_notes; Type: TABLE DATA; Schema: public; Owner: taskuser
--

COPY public.nb_notes (id, user_id, note_type, topic_id, content, step_order, task_status, is_deleted, created_at, updated_at) FROM stdin;
e24bca7e7d894c7da41fb3ed3	1165760598	task	\N	Test notebook task	\N	todo	f	2026-03-09 10:24:24.394226	2026-03-09 10:24:24.394229
9b4b34519bc14c4ea5932d70c	1165760598	step	\N	Test step from API	1	\N	t	2026-03-09 10:24:24.2656	2026-03-09 10:25:09.917231
ce338cd9dc8d433cb37632afd	1165760598	step	\N	Luni	3	\N	f	2026-03-09 10:26:52.444072	2026-03-09 10:26:52.444075
4f0bc757a04d4468bac4e89e9	1165760598	step	\N	6:30 - 7:00 trezirea si Dus	4	\N	f	2026-03-09 10:26:54.187811	2026-03-09 10:26:54.187814
f29282a2ed504295bd7a0e228	1165760598	step	\N	6:30 - 7:00 trezirea si Dus	1	\N	t	2026-03-09 10:25:36.510802	2026-03-09 10:26:56.346738
8ee73cac7eed4a37b0faeb907	1165760598	step	\N	7:00 - 7:30 Beau ceai si eau prima masa	5	\N	f	2026-03-09 10:27:00.686401	2026-03-09 10:27:00.686403
e7589f545ba048fea801cdbc1	1165760598	step	\N	7:00 - 7:30  Beau ceai si eau prima masa	2	\N	t	2026-03-09 10:26:37.588995	2026-03-09 10:27:01.510959
493f63d2097f4486a40d5c316	1165760598	task	\N	Mananc	\N	done	t	2026-03-09 10:27:18.731243	2026-03-09 10:27:38.537191
a83b63a7847f4db38d9f36e01	1165760598	idea	203b584de9e648a5904e782d6	Biznes check	\N	\N	f	2026-03-09 10:27:51.177003	2026-03-09 10:27:55.092842
63f30bc36dbd4a4d80d2c6bf2	1165760598	idea	4e6d9acadd244d1e99e250e10	docker exec bizzcheck_postgres env\ncomanda penttru a afla datele si a conecta o baza de date la table plus in pogres sql\n\nName:      BizzCheck DB\nHost:      127.0.0.1\nPort:      5434\nUser:      postgres\nPassword:  postgres\nDatabase:  bizzcheck_bot\n\naceste date se eau din aceea ce apare si ca port si hot sunt in config le instalm noi care le folosim	\N	\N	f	2026-03-09 10:41:42.301912	2026-03-09 10:41:42.301933
989153767ef7434f8440ef5fa	1165760598	idea	e8a851f04c3e49f4921065460	docker exec bizzcheck_postgres env\ncomanda penttru a afla datele si a conecta o baza de date la table plus in pogres sql\n\nName:      BizzCheck DB\nHost:      127.0.0.1\nPort:      5434\nUser:      postgres\nPassword:  postgres\nDatabase:  bizzcheck_bot\n\naceste date se eau din aceea ce apare si ca port si hot sunt in config le instalm noi care le folosim	\N	\N	t	2026-03-09 10:40:08.6206	2026-03-09 10:41:51.900268
2dd5628f96254963aa3494a0f	1165760598	idea	a721f6f764524428894e11201	Ai-Contabil/\n│\n├── backend/                          # FastAPI - API principal\n│   ├── app/\n│   │   ├── api/\n│   │   │   ├── routes/\n│   │   │   │   ├── auth.py           # Login, register, JWT\n│   │   │   │   ├── documents.py      # Upload, listare documente\n│   │   │   │   ├── users.py          # Profil utilizator\n│   │   │   │   └── ai_tasks.py       # Trimite task-uri către AI, polling status\n│   │   │   └── deps.py               # Dependențe comune (get_current_user etc.)\n│   │   ├── core/\n│   │   │   ├── config.py             # Settings din .env\n│   │   │   ├── security.py           # JWT, hashing parole\n│   │   │   └── database.py           # Conexiune PostgreSQL (SQLAlchemy)\n│   │   ├── models/\n│   │   │   ├── user.py               # Tabel User\n│   │   │   ├── document.py           # Tabel Document\n│   │   │   └── ai_task.py            # Tabel AITask (status, rezultat)\n│   │   ├── services/\n│   │   │   ├── auth_service.py       # Logica de autentificare\n│   │   │   ├── document_service.py   # Logica upload + stocare\n│   │   │   └── ai_service.py         # Comunicare cu ai-service/\n│   │   └── main.py\n│   ├── alembic/                      # Migrații BD\n│   ├── requirements.txt\n│   └── Dockerfile\n│\n├── ai-service/                       # FastAPI - doar AI/LLM\n│   ├── app/\n│   │   ├── api/\n│   │   │   └── process.py            # Endpoint /process (primește și returnează)\n│   │   ├── processors/\n│   │   │   ├── ocr_processor.py      # Extragere text din imagini\n│   │   │   ├── classifier.py         # Clasificare documente\n│   │   │   └── llm_processor.py      # LLM principal (generare, analiză)\n│   │   ├── models/                   # Modelele AI locale (dacă e cazul)\n│   │   └── main.py\n│   ├── requirements.txt\n│   └── Dockerfile\n│\n├── database/\n│   ├── init.sql                      # Schema inițială\n│   └── migrations/                   # Gestionate de Alembic din backend/\n│\n├── storage/                          # Imagini și documente pe disc\n│   └── uploads/\n│\n├── mobile/                           # Ce ai deja\n├── web/                              # Ce ai deja\n│\n├── docker-compose.yml                # Pornește TOT cu un singur comandă\n└── .env                              # Toate secretele (nu în git!)	\N	\N	f	2026-03-10 19:47:22.967058	2026-03-10 19:47:22.967479
d5779d469e674092b6b678a97	1165760598	idea	ddd30595fd6a40f89cf744e1c	Tu ești un expert React Native Expo și PWA (Progressive Web App).\nSarcina ta este să transformi proiectul meu FamilyTime într-o PWA care funcționează\npe Android și iPhone, și să o publici gratuit pe Vercel.\nExplică-mi fiecare pas în română simplu, ca și cum nu am mai făcut asta niciodată.\nÎnainte de orice modificare, arată-mi CE vei face și DE CE.\nCE ESTE O PWA — explică-mi înainte de a începe\nÎnainte de a face orice modificare, explică-mi în română:\n\nCe este un PWA și cum funcționează\nDe ce codul meu React Native Expo poate deveni PWA\nCe va vedea utilizatorul pe Android vs iPhone\nCum se vor actualiza automat aplicația la utilizatori\n\nPASUL 1 — Analizează proiectul meu\nCitește fișierele existente:\n\napp.json sau app.config.js\npackage.json\norice fișier de configurare existent\n\nApoi spune-mi:\n\nCe versiune de Expo folosesc\nCe dependențe am instalate deja\nCe trebuie adăugat pentru PWA\nDacă există ceva care ar putea cauza probleme\n\nPASUL 2 — Instalează dependențele necesare pentru PWA\nRulează comenzile necesare și explică-mi ce face fiecare pachet.\nVerifică și instalează dacă lipsesc:\n\nexpo-web-browser\n@expo/webpack-config sau metro pentru web\n\nExplică-mi diferența dintre "bundler: metro" și "bundler: webpack" pentru web\nși care e mai bun pentru proiectul meu.\nPASUL 3 — Configurează app.json pentru PWA\nAdaugă sau actualizează secțiunea "web" în app.json:\njson{\n  "expo": {\n    "name": "FamilyTime",\n    "slug": "familytime",\n    "web": {\n      "bundler": "metro",\n      "output": "static",\n      "name": "FamilyTime",\n      "shortName": "FamilyTime",\n      "description": "Gestionează timpul în familie",\n      "themeColor": "#4A90D9",\n      "backgroundColor": "#ffffff",\n      "display": "standalone",\n      "orientation": "portrait",\n      "lang": "ro",\n      "scope": "/",\n      "startUrl": "/"\n    }\n  }\n}\nExplică-mi ce înseamnă fiecare câmp:\n\n"output": "static" — ce face?\n"display": "standalone" — de ce e important pentru a arăta ca o aplicație?\n"themeColor" — unde apare vizual pe telefon?\n"scope" și "startUrl" — la ce servesc?\n\nPASUL 4 — Creează fișierul manifest.json\nExplică-mi că manifest.json este "cartea de identitate" a PWA —\nbrowserul îl citește și știe cum să trateze aplicația când e instalată.\nCreează fișierul public/manifest.json cu toate câmpurile necesare\ninclusiv iconițele în dimensiunile 192x192 și 512x512.\nPASUL 5 — Creează iconițele aplicației\nVerifică dacă am deja o iconița în proiect (assets/icon.png sau similar).\nDacă da, redimensioneaz-o pentru toate dimensiunile necesare PWA:\n\n192x192 (Android — iconița principală)\n512x512 (Android — splash screen)\n180x180 (iPhone — apple-touch-icon)\n32x32 (favicon browser)\n\nSalvează-le în public/icons/\nDacă nu am iconița, spune-mi exact ce fișier să creez și unde să îl pun.\nPASUL 6 — Adaugă Service Worker pentru funcționare offline parțială\nExplică-mi CE ESTE un Service Worker în termeni simpli ÎNAINTE de a-l crea:\nCeva de genul "e un program mic care rulează în fundal în browser și\nsalvează o copie a aplicației pe telefon ca să meargă și fără internet."\nCreează public/sw.js cu:\n\nCache pentru fișierele principale ale aplicației\nStrategie "cache first, then network" — încearcă mai întâi din cache,\ndacă nu e ia din internet\nCurățare automată a cache-ului vechi la update\n\nȘi explică-mi de ce trebuie să actualizez numele cache-ului (ex: v1 → v2)\nla fiecare update important al aplicației.\nPASUL 7 — Banner de instalare pentru iPhone\nProblema: pe iPhone Safari nu apare automat butonul "Instalează aplicația".\nSoluția: detectăm că e iPhone și afișăm noi instrucțiuni.\nCreează componenta components/InstallBanner.tsx care:\n\nDetectează automat dacă utilizatorul e pe iPhone/iPad\nDetectează dacă aplicația e deja instalată (nu afișa dacă da)\nAfișează un banner frumos în partea de jos cu pașii:\nShare → Adaugă pe ecran principal\nAre buton "Am înțeles" care închide bannerul\nSe afișează după 3 secunde (nu imediat la deschidere)\nSalvează în localStorage că utilizatorul a văzut bannerul\n(nu îl mai arăta 	\N	\N	f	2026-03-18 08:11:36.392642	2026-03-18 08:11:36.392709
\.


--
-- Data for Name: nb_sketches; Type: TABLE DATA; Schema: public; Owner: taskuser
--

COPY public.nb_sketches (id, user_id, topic_id, title, image_data, width, height, is_deleted, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: nb_topics; Type: TABLE DATA; Schema: public; Owner: taskuser
--

COPY public.nb_topics (id, user_id, name, description, emoji, is_predefined, is_deleted, created_at) FROM stdin;
203b584de9e648a5904e782d6	1165760598	Proiecte	Idei pentru proiecte noi	\N	t	f	2026-03-09 10:24:15.864484
6e3f4f1a600e4c2e9337962c7	1165760598	Business	Idei de business si oportunitati	\N	t	f	2026-03-09 10:24:15.876765
30819d099ea942ea89eb9b580	1165760598	Invatare	Lucruri de invatat si resurse	\N	t	f	2026-03-09 10:24:15.883158
e8a851f04c3e49f4921065460	1165760598	Personal	Obiective si note personale	\N	t	f	2026-03-09 10:24:15.890795
4e6d9acadd244d1e99e250e10	1165760598	Docker	comenzi folositoare in docker	\N	f	f	2026-03-09 10:41:38.519886
a721f6f764524428894e11201	1165760598	Backend  teza de licenta	Backend pentru teza strucutura si cum sa fie fisierele in el facute	\N	f	f	2026-03-10 19:47:07.397294
c3091ca2c5ec4f5bb86df6357	1165760598	PLanseta cu stilus pentru a face taote inscrierele acolo pe le	Sa fie petnru a putea inscrie toate modificcari sa uasa ca sa fei ca un carnet digital permanrt sub mana si comod si usor	\N	f	f	2026-03-17 08:46:03.058086
ddd30595fd6a40f89cf744e1c	1165760598	Promt pentru build aplicatie mobila	Promtul pentru build aplicatiei mobile pe PWA asa cum sa minuim  app store si play marketul	\N	f	f	2026-03-18 08:11:26.072516
\.


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: taskuser
--

COPY public.projects (id, name, description, github_url, color, is_active, created_at, updated_at) FROM stdin;
2d2c815b03f24aa6adb3175b6	Business Health System	O multi platform aplicatie care ne ajuta ca oameni in domeniu sa ajutam sa adalizam si sa dam o nota la starea biznesului fata de stat care sunt problemele lor in in companie cu statul si ce trebuie sa corecteze, audit de biznes  versiunea unu pe GITHUB : https://github.com/MSma1l/Analiz--de-business.git	https://github.com/turcanplay/BIZZCHECK_BOT.git	#eab308	t	2026-03-08 21:18:53.231422	2026-03-08 21:18:53.231425
34eb9c1303fc459eb3d773f7d	Family Time	APlicatie de monitoring dupa copii cu statistici si tata mama tutore gestionarea timpului intre copii prin telefoane	https://github.com/turcanplay/FamilyTime.git	#22c55e	t	2026-03-09 07:04:39.723113	2026-03-09 07:04:39.723117
3296ed0c12c64e98b0352c300	Teza de licenta	Aplicatie Mobila si aplicatia web cu model LLM care proceseaza acetele docuemntele si executa niste raporte intlegente pentru contabili care usureaza viata pentru clienti si contabili unde contabilii pot executa mai multetascuri per zi	https://github.com/MSma1l/Teza-de-licenta.git	#ef4444	t	2026-03-08 21:14:59.229691	2026-03-09 07:04:50.21993
3c05c54415c74001acbbc407b	Task Manager	Proeict mic pentru task manager meu in timp de zi sistematic ce si cum fac eu in fiecare zi sau planul care il am pentru lucru si flux normal de creativitate	https://github.com/MSma1l/TaskManager.git	#8b5cf6	t	2026-03-09 08:05:12.519913	2026-03-09 08:05:12.519916
4eaf52540cd8465698bd33c10	IQ-Arena	Rebraindigul Paginei IQ-Arena si scrierea ei pe React type scripts si BAckend pe Python cu FlaskAPI	https://github.com/MSma1l/IQ-Arena-Crowe.git	#3b82f6	t	2026-03-08 21:16:16.448932	2026-03-09 08:05:20.379233
a1d53c31fc7e47f280073e115	English Test	Aplicatie pentru a invata limba engleza pentru a testa modalitatiele sale si de ainvata in baza llm creeat si antrenat si alte momente importante	https://github.com/MSma1l/English-Test.git	#06b6d4	t	2026-03-11 08:41:30.067173	2026-03-11 08:41:30.067178
b1cf17f20add49a0b9e7f4ea7	Arhiva digitala	\N	\N	#22c55e	t	2026-05-03 06:18:02.863758	2026-05-03 06:18:02.863763
904cd966ab6a4b71992a48113	SRM_DocuSafe	arhiva digitala pentru actele companiei	https://github.com/turcanplay/SRM_arhiva.git	#06b6d4	t	2026-05-04 12:39:54.802674	2026-05-04 12:39:54.802679
\.


--
-- Data for Name: reminder_logs; Type: TABLE DATA; Schema: public; Owner: taskuser
--

COPY public.reminder_logs (id, task_id, sent_at, channel) FROM stdin;
39d4403f2dec4aec8e93c2fce	6ca7b15df2194133b95ca0e49	2026-03-09 09:15:11.300878	web
866a2705298e45e6939527d2d	e02749fd918d4a3cbb4e6f53a	2026-03-09 09:30:10.931006	web
60ed8348acb6454f9e04b9d44	0295a74363c1434ead36e4a1a	2026-03-09 10:00:29.540921	web
d62a351c35e04b85b90535b89	8f77ec96c03845bba0e2fb413	2026-03-09 12:00:23.294891	web
004cd891862a4278ae0f23d31	0e37db62320e452db48d8b09c	2026-03-10 12:00:17.240676	web
8400495ac32b4700888083d59	455b0143efd5456daca44fac5	2026-03-11 09:00:17.559695	web
0ac2b637381144f99dabf0432	47279912f2c34389bf24f91cc	2026-03-11 09:00:17.559711	web
264080565c204ba989cd4e2a5	49bf74c11e4247fab5dc48403	2026-03-11 12:00:18.547195	web
081e53a70cd6464b970321608	18023b5a224d4d2db2fa5df3e	2026-03-11 13:00:18.560167	web
8854d25d112047db9406e2d11	524dfad689ca49f7ad1d33e1d	2026-03-11 15:00:18.573863	web
7b30465acbc04b0e844f04f4d	ace0cc8a410f40d1b32209cb4	2026-03-11 16:00:18.583066	web
125342ac49f347fea9f513b5a	dd0824905a4646b98e81f43fa	2026-03-12 09:00:10.401566	web
ef0ae36615de403d8e8a0ef1b	07946d6c5bd14b478a91190f5	2026-03-17 09:00:52.164226	web
e47a187721a24dcbb8748b6f9	79f026449b9240ff83a386ad1	2026-03-17 09:00:52.164236	web
aa920605b612428db16f9967c	02b96ceccd644f7c818256b11	2026-03-17 09:10:01.164582	web
797396a1c9ae4e91b6877d661	7ca603f311a845269c2ef076c	2026-03-17 10:00:07.182103	web
b8e60b4696a149608965bcb91	0e37db62320e452db48d8b09c	2026-03-17 12:00:25.492556	web
a3eea68354f04d13bd0de4909	455b0143efd5456daca44fac5	2026-03-18 09:00:03.526912	web
c64d2f24a567482086760e12e	47279912f2c34389bf24f91cc	2026-03-18 09:00:03.526934	web
89abe6bc64f446538aa4cee2b	d5dd3fad36524091aa02cd63d	2026-03-18 10:00:03.494671	web
c15ea3514d3240378f4f6ab5e	40c645642ba94115bc942a78f	2026-03-18 10:00:03.494695	web
9d5579c9a5b14a45a4f756718	18023b5a224d4d2db2fa5df3e	2026-03-18 13:00:28.628156	web
bcb5b591d20e451a96436e76f	f110774584e949f1af87d971e	2026-03-19 15:00:55.079008	web
b10fc7cf12084c918a03e4502	6ca7b15df2194133b95ca0e49	2026-05-04 09:15:29.480306	web
b5a48a46cb6a4b67807169f39	e02749fd918d4a3cbb4e6f53a	2026-05-04 09:30:21.094775	web
7ec952ba34644350abfcc1586	0295a74363c1434ead36e4a1a	2026-05-04 10:00:04.118053	web
2fcec67174a64401a0d1248b9	200660aacd404c538b18d8771	2026-05-04 11:00:06.120069	web
24e6ccd33071499b91bbcaec7	8f77ec96c03845bba0e2fb413	2026-05-04 12:00:04.108712	web
4b20f0be1e314b9694bc1bec6	bdf354f9fd4f4699a2c346eb8	2026-05-04 12:00:04.108749	web
a01750f563ce4a0fae88ba6c3	d12d788c5a994af9a50608403	2026-05-04 12:00:04.108759	web
\.


--
-- Data for Name: task_completions; Type: TABLE DATA; Schema: public; Owner: taskuser
--

COPY public.task_completions (id, task_id, week_start, status, completed_at, moved_to_date, skip_reason, note, created_at, updated_at) FROM stdin;
6e80fda6ebeb4ff8940cae27e	906a6c05bbc94dc8ab1c2f2cd	2026-03-02 00:00:00	DONE	2026-03-06 11:44:44.900858	\N	\N	\N	2026-03-06 11:13:23.200108	2026-03-06 11:44:44.900867
9f9e70139e6a405eb930fc407	3bd8a899125a49f1a0a438d4f	2026-03-09 00:00:00	PENDING	\N	\N	\N	\N	2026-03-08 20:44:46.347411	2026-03-08 20:44:46.347417
502669f0a63f42d082bb8fa9c	5230b7a674b1450ba27a7da53	2026-03-09 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 11:45:16.503941	2026-03-06 11:45:16.503944
6212675aa7604b61835924816	b54f91ed33384841a4fc6578a	2026-03-09 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 11:45:16.503955	2026-03-06 11:45:16.503956
a4e9ae55c4164d2c847401f79	5230b7a674b1450ba27a7da53	2026-02-23 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 11:45:41.646056	2026-03-06 11:45:41.64606
204a147bf6b84a9392916ba89	5230b7a674b1450ba27a7da53	2026-03-02 00:00:00	NOT_DONE	\N	2026-03-14 00:00:00	sssssssssss	\N	2026-03-06 11:44:14.690124	2026-03-06 11:49:54.409015
d6e9723d35334f9d9ebbdafd5	5230b7a674b1450ba27a7da53	2026-02-16 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 12:00:32.415503	2026-03-06 12:00:32.415505
4e6739a8ef774eb78c1c1d4d6	5230b7a674b1450ba27a7da53	2026-02-09 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 12:00:32.99066	2026-03-06 12:00:32.990663
f074cc891e6447229e8a68d70	5230b7a674b1450ba27a7da53	2026-02-02 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 12:00:33.789678	2026-03-06 12:00:33.789681
3458c17a2cd347bc831ec1ebf	5230b7a674b1450ba27a7da53	2026-01-26 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 12:00:37.800085	2026-03-06 12:00:37.800089
1108dea7910147428030d4ce5	930795bdc28a4ef4b0cca712e	2026-05-04 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:05:28.539964	2026-03-06 13:05:28.539967
e56107a4db594ce9a5afa312e	f581cfec20e54d86b19032ac4	2026-03-02 00:00:00	SKIPPED	\N	2026-03-07 00:00:00	\N	\N	2026-03-06 13:09:16.293037	2026-03-06 13:11:53.751588
df9802703b7546f195742b656	d75dbfc4f4774ee8aefaecce4	2026-03-02 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:11:54.402885	2026-03-06 13:11:54.402889
175f632010524c72b28313d20	3625b2b89f5e42bf80bfdac1f	2026-03-09 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:43:27.679629	2026-03-06 13:43:27.679634
f47c48f0af1147ff933d0f809	74b0a1ff0c7e4aac94f6d389e	2026-02-23 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:44:16.315757	2026-03-06 13:44:16.315762
a60cbcff21c7416794613f05d	85087b80792f43179c0d1f7b3	2026-02-23 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:45:39.197223	2026-03-06 13:45:39.197227
0d13294eb1824df7b4b8a9515	f2b359f2f410434ba53daf9f7	2026-02-23 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:53:45.405641	2026-03-06 13:53:45.405698
ddc25c84ac164f83a24b07356	f2b359f2f410434ba53daf9f7	2026-03-02 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:53:55.599366	2026-03-06 13:53:55.599369
93809c84295141ae90d620d5a	85087b80792f43179c0d1f7b3	2026-03-02 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:53:55.599377	2026-03-06 13:53:55.599377
102b27cfbefb44e9b93998338	f2b359f2f410434ba53daf9f7	2026-03-09 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:53:58.625782	2026-03-06 13:53:58.625786
5ce9597d05874d0194fef6f15	85087b80792f43179c0d1f7b3	2026-03-09 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:53:58.625795	2026-03-06 13:53:58.625795
77f260dae23d43c09e780b388	f2b359f2f410434ba53daf9f7	2026-03-16 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:54:03.28851	2026-03-06 13:54:03.288515
72279314721d4f3a82c060af4	85087b80792f43179c0d1f7b3	2026-03-16 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:54:03.288524	2026-03-06 13:54:03.288524
6c38da6ce2ca467aa1550ffee	f2b359f2f410434ba53daf9f7	2026-03-23 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:54:04.37793	2026-03-06 13:54:04.377935
07d5bda2d94244f78899f533a	85087b80792f43179c0d1f7b3	2026-03-23 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:54:04.377948	2026-03-06 13:54:04.37795
895a73738bd74bdbb0b05c4fd	f2b359f2f410434ba53daf9f7	2026-03-30 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:54:05.1069	2026-03-06 13:54:05.106903
ca5618824a9c4701bdee7ad1d	85087b80792f43179c0d1f7b3	2026-03-30 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:54:05.106909	2026-03-06 13:54:05.10691
5d55691281f74d539f7dfe66e	f2b359f2f410434ba53daf9f7	2026-04-06 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:54:05.760786	2026-03-06 13:54:05.760792
34cab08abc8e41ecb983776bc	85087b80792f43179c0d1f7b3	2026-04-06 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:54:05.760803	2026-03-06 13:54:05.760804
1123310af5b84a43bbf55d39c	f2b359f2f410434ba53daf9f7	2026-04-13 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:54:07.724238	2026-03-06 13:54:07.724243
ab5df0b9395d493ca28e73041	85087b80792f43179c0d1f7b3	2026-04-13 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:54:07.724254	2026-03-06 13:54:07.724254
c8904f5fe51a4fe2abfc77f63	f2b359f2f410434ba53daf9f7	2026-04-20 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:54:07.880246	2026-03-06 13:54:07.880249
6e45ffb15435475e8fa878329	85087b80792f43179c0d1f7b3	2026-04-20 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:54:07.880255	2026-03-06 13:54:07.880256
8339bfa0cf4b4981abd435945	f2b359f2f410434ba53daf9f7	2026-04-27 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:54:08.616381	2026-03-06 13:54:08.616385
071e83a96d9948d0bc0e54b3f	85087b80792f43179c0d1f7b3	2026-04-27 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:54:08.6164	2026-03-06 13:54:08.6164
6ca7b85506e04de5b9fa005d0	35cef1b968474ed393232dcc6	2026-03-02 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 13:55:11.219178	2026-03-06 13:55:11.219181
ec43a839d33341519a18ffe6f	78a26fde85f34db2bd15d7560	2026-03-02 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 14:08:00.750236	2026-03-06 14:08:00.750238
bc3aed744b9549fba6f3046b3	4bbfa5236bae44c9a9fa83521	2026-03-02 00:00:00	PENDING	\N	\N	\N	\N	2026-03-06 14:10:30.647258	2026-03-06 14:10:30.647261
c42fe37371a643f7a0d9733b2	7e0ef598bdb844d7b66e507fb	2026-03-09 00:00:00	PENDING	\N	\N	\N	\N	2026-03-08 20:40:18.194307	2026-03-08 20:40:18.194311
4c2ae68ed8264058a00933c5a	a5f11ef34f2b47549b0f5f932	2026-03-09 00:00:00	PENDING	\N	\N	\N	\N	2026-03-08 20:41:10.513216	2026-03-08 20:41:10.513219
8e3524f59fac4f4bab8548ae9	241dd322167a45fdbf91e9fe8	2026-03-09 00:00:00	PENDING	\N	\N	\N	\N	2026-03-08 20:41:49.598963	2026-03-08 20:41:49.598968
b62ebeadf3bc423cb2dd6b750	fbe78bf048da41d6904962fde	2026-03-09 00:00:00	PENDING	\N	\N	\N	\N	2026-03-08 20:43:54.29688	2026-03-08 20:43:54.296885
9532f9ef6147435eaec7470c7	e0eca13188194cac9ffcd90be	2026-03-09 00:00:00	PENDING	\N	\N	\N	\N	2026-03-08 20:45:13.728093	2026-03-08 20:45:13.728099
2505d83fe0a048a0b7fb73ef4	fb8bb48d7cc44d2f9c387456c	2026-03-09 00:00:00	PENDING	\N	\N	\N	\N	2026-03-08 20:45:38.481446	2026-03-08 20:45:38.481449
5c4c5452d9524b7da0ebe3e7c	25b946e1d17f4f9f8d8fa0d44	2026-03-09 00:00:00	PENDING	\N	\N	\N	\N	2026-03-08 20:46:40.338498	2026-03-08 20:46:40.338504
277e8b7244ba4e4cb25a02a93	54fcde94260d4d79bbc4b23ac	2026-03-09 00:00:00	PENDING	\N	\N	\N	\N	2026-03-08 20:52:02.485885	2026-03-08 20:52:02.485889
4a44ffec6caf413bb3b5403e7	18ccfd6600ff4f18a7e5aa951	2026-03-09 00:00:00	PENDING	\N	\N	\N	\N	2026-03-08 20:52:47.312319	2026-03-08 20:52:47.312324
e87aa670d1754de4a213f1eff	8f77ec96c03845bba0e2fb413	2026-03-09 00:00:00	DONE	2026-03-09 09:26:26.48049	\N	\N	\N	2026-03-08 20:29:21.713039	2026-03-09 09:26:26.4805
6efcde88ba1e4702bfb931ee4	6ca7b15df2194133b95ca0e49	2026-03-09 00:00:00	DONE	2026-03-09 10:15:04.51768	\N	\N	\N	2026-03-08 20:39:28.912429	2026-03-09 10:15:04.517689
2059fbb3e0e340c1aa88bc89f	0295a74363c1434ead36e4a1a	2026-03-09 00:00:00	DONE	2026-03-09 11:41:03.872376	\N	\N	\N	2026-03-08 20:37:21.15954	2026-03-09 11:41:03.872386
77c457f1922e4346ba2c890e8	e02749fd918d4a3cbb4e6f53a	2026-03-09 00:00:00	DONE	2026-03-09 12:12:57.51439	\N	\N	\N	2026-03-08 20:27:25.103658	2026-03-09 12:12:57.514399
afb2eb9650da4158ac6f1f125	02b96ceccd644f7c818256b11	2026-03-09 00:00:00	DONE	2026-03-10 11:13:22.055468	\N	\N	\N	2026-03-08 20:33:29.944433	2026-03-10 11:13:22.055479
a8363cb7a114415db75252f16	46824e4c9d37427a93101a042	2026-03-09 00:00:00	DONE	2026-03-10 11:54:01.35444	\N	\N	\N	2026-03-08 20:35:07.443692	2026-03-10 11:54:01.354452
06bd1cbe9de543f7b8a83b1d3	0e37db62320e452db48d8b09c	2026-03-09 00:00:00	DONE	2026-03-10 19:27:49.899888	\N	\N	\N	2026-03-08 20:32:06.233222	2026-03-10 19:27:49.899898
5315a2b03d8841fea3af1a8eb	2f55b54d13da4bfaa30a8e060	2026-03-09 00:00:00	DONE	2026-03-10 19:27:53.985457	\N	\N	\N	2026-03-08 20:49:56.48927	2026-03-10 19:27:53.985467
9c771edfa6af4de4ade8d1bcc	d5dd3fad36524091aa02cd63d	2026-03-09 00:00:00	DONE	2026-03-10 19:59:45.420213	\N	\N	\N	2026-03-08 20:35:55.961812	2026-03-10 19:59:45.420218
c5134b58a4ab4673a7cd0aa03	ace0cc8a410f40d1b32209cb4	2026-03-09 00:00:00	SKIPPED	\N	2026-03-13 00:00:00	\N	\N	2026-03-09 07:08:15.455639	2026-03-10 20:05:18.579139
077c2ccfd8594fd5a181ec9fb	524dfad689ca49f7ad1d33e1d	2026-03-09 00:00:00	DONE	2026-03-11 13:39:11.61185	\N	\N	\N	2026-03-08 20:34:11.175227	2026-03-11 13:39:11.611855
75952ede9b394c56b0ec3ede7	20f5089efef94ec19ff64fd61	2026-03-09 00:00:00	NOT_DONE	\N	\N	Nu am reusit	\N	2026-03-08 20:42:51.957318	2026-03-12 07:03:48.346184
90f490b5df864ce0bc17199e6	dd0824905a4646b98e81f43fa	2026-03-09 00:00:00	DONE	2026-03-12 10:22:25.840729	\N	\N	\N	2026-03-08 20:53:46.312208	2026-03-12 10:22:25.840737
c1c94b81da34413397ffbf29b	3d4ce48c92904af5937fcfae2	2026-03-09 00:00:00	SKIPPED	\N	2026-03-13 00:00:00	\N	\N	2026-03-08 20:36:24.166716	2026-03-12 10:45:14.12757
9ee57c07b11d47eb86c45a67e	49bf74c11e4247fab5dc48403	2026-03-16 00:00:00	DONE	2026-03-19 20:53:36.630229	\N	\N	\N	2026-03-06 13:03:23.047437	2026-03-19 20:53:36.630253
56ad4f2f993b4f67ac3e38668	ed7ef6d9264e4a47af6c62fc9	2026-03-09 00:00:00	PENDING	\N	\N	\N	\N	2026-03-09 07:58:11.531269	2026-03-09 07:58:11.531273
6c74e0817e6b417ca0f19eea0	200660aacd404c538b18d8771	2026-03-09 00:00:00	DONE	2026-03-09 08:15:12.711528	\N	\N	\N	2026-03-08 20:38:18.821396	2026-03-09 08:15:12.711537
1afd3f008c9d4358a4b45d6ee	b3039818cc304839b3d29b635	2026-03-09 00:00:00	PENDING	\N	\N	\N	\N	2026-03-09 08:54:36.122779	2026-03-09 08:54:36.122783
6598d59cebb1455ba5be51f0e	7f01f1ad69a9406fb2a0d88fd	2026-03-09 00:00:00	DONE	2026-03-09 11:41:28.869	\N	\N	\N	2026-03-09 09:25:08.130195	2026-03-09 11:41:28.869006
6c90bdbdf0ff4bc8b96a8e6bc	8428c838cb9c4a3a8f5c19b63	2026-03-09 00:00:00	DONE	2026-03-09 12:32:38.450988	\N	\N	\N	2026-03-09 11:49:59.277915	2026-03-09 12:32:38.450998
54afa91b23644ba684fec2a95	27d57c774ce24035b1c079335	2026-03-09 00:00:00	DONE	2026-03-09 12:32:48.438317	\N	\N	\N	2026-03-09 11:50:43.256973	2026-03-09 12:32:48.438326
1794407d815a4925820e8a142	1344fff43c2e4318b2877fe70	2026-03-09 00:00:00	DONE	2026-03-09 13:03:49.787795	\N	\N	\N	2026-03-09 13:03:46.432097	2026-03-09 13:03:49.787804
353169f751594597965bb6933	8d0e2d57818c4f89b77051fcf	2026-03-09 00:00:00	PENDING	\N	\N	\N	\N	2026-03-09 13:08:28.075338	2026-03-09 13:08:28.075341
b16e7821f88c4c31b2f73fdfd	7ca603f311a845269c2ef076c	2026-03-09 00:00:00	DONE	2026-03-09 16:25:29.973948	\N	\N	\N	2026-03-08 20:54:28.410202	2026-03-09 16:25:29.973959
3b21e5e436024913a23b24b73	ac73fdd1318a4c388f9799b4c	2026-03-09 00:00:00	DONE	2026-03-10 11:54:07.89119	\N	\N	\N	2026-03-09 13:09:25.656194	2026-03-10 11:54:07.891199
f80465dbf5c04a949b4e3af13	79f026449b9240ff83a386ad1	2026-03-09 00:00:00	SKIPPED	\N	2026-03-11 00:00:00	Disain costum pentru Ivan	\N	2026-03-09 09:28:08.195836	2026-03-10 14:17:55.31285
e98bca17fc0245ebb9d8c1236	455b0143efd5456daca44fac5	2026-03-09 00:00:00	DONE	2026-03-10 19:59:33.789668	\N	\N	\N	2026-03-10 14:17:56.12142	2026-03-10 19:59:33.789682
61f1f3cbdbbc4799bf8dcf6b4	f6078bad70ab4f7590de4c1aa	2026-03-09 00:00:00	PENDING	\N	\N	\N	\N	2026-03-10 20:05:19.265101	2026-03-10 20:05:19.265104
67dbc00bf83b4d23ac793ec25	07946d6c5bd14b478a91190f5	2026-03-09 00:00:00	NOT_DONE	\N	\N	nu am resuit si nu am inca resursele tate care am nevoie pentru a termina 30%	\N	2026-03-08 20:30:30.598859	2026-03-10 20:06:20.266876
c0ab7b9f41744a18868b0e89f	47279912f2c34389bf24f91cc	2026-03-09 00:00:00	DONE	2026-03-11 07:46:28.9564	\N	\N	\N	2026-03-10 20:00:14.728032	2026-03-11 07:46:28.956407
9abaac61820147bf94d60ff9d	18023b5a224d4d2db2fa5df3e	2026-03-09 00:00:00	DONE	2026-03-11 13:37:37.054721	\N	\N	\N	2026-03-10 20:05:01.521704	2026-03-11 13:37:37.05473
ee76af66f02740f09e7893ab8	40c645642ba94115bc942a78f	2026-03-09 00:00:00	DONE	2026-03-11 13:37:42.655482	\N	\N	\N	2026-03-10 20:00:55.901765	2026-03-11 13:37:42.655489
0e62db5fdb4c4724a9fffd5d5	d42bdba998794625813432914	2026-03-09 00:00:00	DONE	2026-03-11 13:38:03.399538	\N	\N	\N	2026-03-10 20:04:07.408179	2026-03-11 13:38:03.399545
cdd00f5dbfdb4a75ad3161fa5	ebb05222db1046769caa8bbb8	2026-03-09 00:00:00	DONE	2026-03-11 13:38:09.34411	\N	\N	\N	2026-03-10 20:02:54.079513	2026-03-11 13:38:09.344115
a26a586c72294eefa73af6414	d5ac71c7a0e446f89f691f5cf	2026-03-09 00:00:00	DONE	2026-03-11 13:38:18.302865	\N	\N	\N	2026-03-10 20:01:46.67302	2026-03-11 13:38:18.302874
075bda3394dc41eeb5be96912	c7eed99b879c44a58278ad9e2	2026-03-09 00:00:00	DONE	2026-03-12 07:04:04.041925	\N	\N	\N	2026-03-11 08:56:14.324797	2026-03-12 07:04:04.041935
32e3b47bd8424a6192a5ca28a	75e58fc5708c41c6a92d1b0b4	2026-03-09 00:00:00	PENDING	\N	\N	\N	\N	2026-03-12 10:45:14.846563	2026-03-12 10:45:14.846567
9b1f839af672488f81cd8e704	75e58fc5708c41c6a92d1b0b4	2026-03-16 00:00:00	DONE	2026-03-17 07:22:32.342688	\N	\N	\N	2026-03-17 07:22:32.337933	2026-03-17 07:22:32.342694
fd6864e1cdbc43ffbe23abb96	9b5ed511cd4042bbacdd209a4	2026-03-23 00:00:00	PENDING	\N	\N	\N	\N	2026-03-17 14:48:12.99976	2026-03-17 14:48:12.999763
d9e7be33891b46818b9bf7b95	b3039818cc304839b3d29b635	2026-03-16 00:00:00	DONE	2026-03-17 07:17:46.559413	\N	\N	\N	2026-03-17 07:17:46.55438	2026-03-17 07:17:46.559422
7d39f3c01a8641fa9479e7087	c0592175f16f48ea9a1fa3eaa	2026-03-16 00:00:00	DONE	2026-03-17 15:58:34.151067	\N	\N	\N	2026-03-17 07:23:59.840234	2026-03-17 15:58:34.151097
1489c0c47b244c07be62310f5	43051b8df9794257bd174fe7b	2026-03-16 00:00:00	DONE	2026-03-17 09:29:18.491107	\N	\N	\N	2026-03-17 09:29:16.352322	2026-03-17 09:29:18.491113
6fde66df058d4656bf984de8e	a5f11ef34f2b47549b0f5f932	2026-03-16 00:00:00	DONE	2026-03-17 07:21:14.909461	\N	\N	\N	2026-03-17 07:17:39.761933	2026-03-17 07:21:14.909469
f3de879a54f647458aa01b4d0	f13759a17ba94735b2a251513	2026-03-16 00:00:00	DONE	2026-03-17 09:33:11.127508	\N	\N	\N	2026-03-17 09:33:08.996914	2026-03-17 09:33:11.127515
2a0bd2ffa1e54130ba242b48e	241dd322167a45fdbf91e9fe8	2026-03-16 00:00:00	SKIPPED	2026-03-17 07:21:47.219345	2026-03-17 00:00:00	\N	\N	2026-03-17 07:17:43.435554	2026-03-17 07:21:58.146237
b40a0b8cbe234891b1dedaabc	7ca76a0cb6bc45379830dfb98	2026-03-16 00:00:00	DONE	2026-03-17 07:22:04.374365	\N	\N	\N	2026-03-17 07:22:01.085018	2026-03-17 07:22:04.374372
e98ac23880614757acf0a3f46	fbe78bf048da41d6904962fde	2026-03-16 00:00:00	SKIPPED	2026-03-17 07:21:17.505732	2026-03-17 00:00:00	\N	\N	2026-03-17 07:18:06.258682	2026-03-17 07:22:17.732882
a6dff366ef1846a59f9d00d38	9de9157705b74747bf596432c	2026-03-16 00:00:00	DONE	2026-03-17 09:37:26.769103	\N	\N	\N	2026-03-17 09:37:24.891553	2026-03-17 09:37:26.769108
5259c8da894a4328bc690f416	757517e6cafe4be6836038fac	2026-03-16 00:00:00	DONE	2026-03-17 09:38:07.979904	\N	\N	\N	2026-03-17 09:38:06.228547	2026-03-17 09:38:07.979921
c33184ec74ba48cdb19ce636a	49bf74c11e4247fab5dc48403	2026-03-09 00:00:00	PENDING	\N	\N	\N	\N	2026-03-17 09:38:16.200919	2026-03-17 09:38:16.200922
29fe1d46415e4d7297dcc540b	18ccfd6600ff4f18a7e5aa951	2026-03-16 00:00:00	DONE	2026-03-17 09:38:19.219117	\N	nam reusit	\N	2026-03-17 07:18:37.94543	2026-03-17 09:38:19.219124
eea2cb44208d49949bde29c07	f6078bad70ab4f7590de4c1aa	2026-03-16 00:00:00	SKIPPED	\N	2026-03-18 00:00:00	\N	\N	2026-03-17 09:38:43.348646	2026-03-17 09:38:43.362761
afc9c75f050e4a06a45be6fe9	3bd8a899125a49f1a0a438d4f	2026-03-16 00:00:00	SKIPPED	\N	2026-03-19 00:00:00	\N	\N	2026-03-17 09:38:57.016696	2026-03-17 09:38:57.030718
5c82e489f94e43009d86d0209	8d0e2d57818c4f89b77051fcf	2026-03-16 00:00:00	SKIPPED	\N	2026-03-20 00:00:00	\N	\N	2026-03-17 09:39:19.510675	2026-03-17 09:39:19.516201
1137c5d7ed1c469699b606272	f4eaa0193be04ed3934060e8c	2026-03-16 00:00:00	PENDING	\N	\N	\N	\N	2026-03-17 09:39:31.045271	2026-03-17 09:39:31.045271
b919be278e564ab18babd77b9	796ed2d0b9bf4a60880eae191	2026-03-16 00:00:00	PENDING	\N	\N	\N	\N	2026-03-17 09:39:31.045277	2026-03-17 09:39:31.045278
75fb8305d95b4c66ac8cb1f4d	49bf74c11e4247fab5dc48403	2026-03-23 00:00:00	PENDING	\N	\N	\N	\N	2026-03-17 09:40:49.812293	2026-03-17 09:40:49.812297
f435cd50b87144658fb038d92	f110774584e949f1af87d971e	2026-03-23 00:00:00	PENDING	\N	\N	\N	\N	2026-03-17 09:41:53.362531	2026-03-17 09:41:53.362534
9e937cd1ed884b6c95d99a074	94eb105b406449fda0b893a6f	2026-03-16 00:00:00	DONE	2026-03-17 15:58:40.162083	\N	\N	\N	2026-03-17 07:22:51.457047	2026-03-17 15:58:40.16209
f69ab2879bea462d80e03fca6	18c77bf5f86f4db7a3772b6d3	2026-03-16 00:00:00	DONE	2026-03-17 15:58:45.644172	\N	\N	\N	2026-03-17 09:44:16.897308	2026-03-17 15:58:45.644179
976d4e6b3aee455985efeafa6	60e136cfe1114e3184696108b	2026-03-16 00:00:00	DONE	2026-03-18 10:00:12.011116	\N	\N	\N	2026-03-18 07:59:50.335967	2026-03-18 10:00:12.011126
2269442faac74623b553628ba	2fe7d17d1dfa4b7c89f0156ab	2026-03-16 00:00:00	DONE	2026-03-18 10:00:21.3413	\N	\N	\N	2026-03-17 09:39:31.04526	2026-03-18 10:00:21.341307
b53ad97112f54bf5ab8daf450	c994c8e35f7e4c3287c659a97	2026-03-16 00:00:00	DONE	2026-03-18 11:10:33.586022	\N	\N	\N	2026-03-18 11:10:30.675005	2026-03-18 11:10:33.586028
80e1ed6146574f27a19f732a7	745d465f176248d78a5b643c3	2026-03-16 00:00:00	DONE	2026-03-18 12:51:27.823197	\N	\N	\N	2026-03-18 07:59:00.107737	2026-03-18 12:51:27.823204
d386429c74464758b643a26f2	de4b4d1695fc4999b77dba17f	2026-03-16 00:00:00	PENDING	\N	\N	\N	\N	2026-03-18 12:56:28.012334	2026-03-18 12:56:28.012338
a9f4a1d6af424edc8408e4087	b25830c1df354804ac207aa15	2026-03-16 00:00:00	DONE	2026-03-18 20:47:56.65601	\N	\N	\N	2026-03-18 09:04:03.967112	2026-03-18 20:47:56.656022
168fdec2d71448dfbc4b5ba69	7c243314a41a4f9086d53f912	2026-03-16 00:00:00	DONE	2026-03-18 20:48:01.538851	\N	\N	\N	2026-03-17 09:44:42.825001	2026-03-18 20:48:01.53886
1abfd03cee6340c49cb69fa4d	49bf74c11e4247fab5dc48403	2026-04-27 00:00:00	PENDING	\N	\N	\N	\N	2026-05-03 06:07:36.718367	2026-05-03 06:07:36.718373
f8110a0879b44e8ebc5209d98	49bf74c11e4247fab5dc48403	2026-04-20 00:00:00	PENDING	\N	\N	\N	\N	2026-05-03 06:10:12.597531	2026-05-03 06:10:12.597534
5b3c492698b34905b718cf421	49bf74c11e4247fab5dc48403	2026-04-13 00:00:00	PENDING	\N	\N	\N	\N	2026-05-03 06:10:12.996988	2026-05-03 06:10:12.996992
7017373b64aa40d490bff6c6d	49bf74c11e4247fab5dc48403	2026-04-06 00:00:00	PENDING	\N	\N	\N	\N	2026-05-03 06:10:13.535546	2026-05-03 06:10:13.535554
61f5852401674190a8f5316dc	49bf74c11e4247fab5dc48403	2026-03-30 00:00:00	PENDING	\N	\N	\N	\N	2026-05-03 06:10:14.067382	2026-05-03 06:10:14.067387
b4217e93ce4145eca5554823f	afe9f7f4af504272a67073848	2026-05-04 00:00:00	PENDING	\N	\N	\N	\N	2026-05-03 06:16:14.81338	2026-05-03 06:16:14.813383
06b4194adac5453b96ffa11fb	a516d184aabf4ab2bd319cc6c	2026-05-04 00:00:00	PENDING	\N	\N	\N	\N	2026-05-03 06:17:12.185368	2026-05-03 06:17:12.185372
a7468d01bf7f48398f2892e43	6ecd3fc488604b31aa54d92e3	2026-05-04 00:00:00	PENDING	\N	\N	\N	\N	2026-05-03 06:17:48.582117	2026-05-03 06:17:48.582121
31384fc88bf743fbb2a5e888a	ad997e22d5184291ba520653d	2026-05-04 00:00:00	PENDING	\N	\N	\N	\N	2026-05-03 06:18:59.347399	2026-05-03 06:18:59.347402
e0d83c9122944bf8acf7b9212	bdf354f9fd4f4699a2c346eb8	2026-05-04 00:00:00	DONE	2026-05-04 09:12:23.845539	\N	\N	\N	2026-05-04 07:08:25.129672	2026-05-04 09:12:23.845552
01e9688206434ea6b4678a334	75f71e01ec04448ba282070d2	2026-05-04 00:00:00	DONE	2026-05-04 09:12:31.940175	\N	\N	\N	2026-05-03 06:15:55.068788	2026-05-04 09:12:31.940182
e8a3cbe06a6341f0b010a3fd3	fbe78bf048da41d6904962fde	2026-05-04 00:00:00	DONE	2026-05-04 09:31:25.471262	\N	\N	\N	2026-05-04 09:31:25.460422	2026-05-04 09:31:25.471272
fc8160ef7a9a41e8ab46bf65d	18ccfd6600ff4f18a7e5aa951	2026-05-04 00:00:00	DONE	2026-05-04 09:31:28.169317	\N	\N	\N	2026-05-04 09:31:28.16164	2026-05-04 09:31:28.169327
ca0e1e94250e470aad9782bd1	75e58fc5708c41c6a92d1b0b4	2026-05-04 00:00:00	DONE	2026-05-04 09:31:31.333451	\N	\N	\N	2026-05-04 09:31:31.323441	2026-05-04 09:31:31.333462
2db4b4685cfc402da52847007	6abbadf2e0a048e8a08ac4100	2026-05-04 00:00:00	DONE	2026-05-04 09:38:56.464364	\N	\N	\N	2026-05-04 09:38:49.719412	2026-05-04 09:38:56.46437
b310556950074c34b76819cd6	d12d788c5a994af9a50608403	2026-05-04 00:00:00	DONE	2026-05-04 12:37:17.011847	\N	\N	\N	2026-05-04 07:36:35.00965	2026-05-04 12:37:17.011857
fd0d05aabd7046a897d1b71dc	7a4afe471e73479b843fed516	2026-05-04 00:00:00	PENDING	\N	\N	\N	\N	2026-05-04 12:40:48.437516	2026-05-04 12:40:48.43752
15790fdb61fd417eadb0ff66a	f71c75c274134273836ab326a	2026-05-04 00:00:00	PENDING	\N	\N	\N	\N	2026-05-04 12:40:48.5629	2026-05-04 12:40:48.562903
bf68f8badc274e7cbbc1dfa86	ac81d9b71aa94d1e80c50fa0c	2026-05-04 00:00:00	PENDING	\N	\N	\N	\N	2026-05-04 12:40:48.670372	2026-05-04 12:40:48.670375
5c6bf9415e9042deafac4e96e	1b8406013324407696a6da1ff	2026-05-04 00:00:00	PENDING	\N	\N	\N	\N	2026-05-04 12:40:48.777981	2026-05-04 12:40:48.777984
78105c618c024698a90764e26	d5739ca2179148ccbeb159c8c	2026-05-04 00:00:00	PENDING	\N	\N	\N	\N	2026-05-04 12:40:48.912631	2026-05-04 12:40:48.912635
2dbd0fb066ca4dc1b473395fd	7a4afe471e73479b843fed516	2026-05-11 00:00:00	PENDING	\N	\N	\N	\N	2026-05-04 12:40:50.943892	2026-05-04 12:40:50.943898
b29fb6da904943419d5cda021	f71c75c274134273836ab326a	2026-05-11 00:00:00	PENDING	\N	\N	\N	\N	2026-05-04 12:40:50.943907	2026-05-04 12:40:50.943907
c4ca6940b110419db13b260b0	ac81d9b71aa94d1e80c50fa0c	2026-05-11 00:00:00	PENDING	\N	\N	\N	\N	2026-05-04 12:40:50.943914	2026-05-04 12:40:50.943915
b59a5a5477284c2d95838e742	1b8406013324407696a6da1ff	2026-05-11 00:00:00	PENDING	\N	\N	\N	\N	2026-05-04 12:40:50.943921	2026-05-04 12:40:50.943922
c57f1b8767a94cadb14984e13	d5739ca2179148ccbeb159c8c	2026-05-11 00:00:00	PENDING	\N	\N	\N	\N	2026-05-04 12:40:50.943929	2026-05-04 12:40:50.94393
51339f205dd440b5bbf70aca9	7a4afe471e73479b843fed516	2026-05-18 00:00:00	PENDING	\N	\N	\N	\N	2026-05-04 12:41:10.340901	2026-05-04 12:41:10.340907
b8a6402b76d34b9b848fe3742	f71c75c274134273836ab326a	2026-05-18 00:00:00	PENDING	\N	\N	\N	\N	2026-05-04 12:41:10.340917	2026-05-04 12:41:10.340918
fb802fc2222d4359b2fc7efe2	1b8406013324407696a6da1ff	2026-05-18 00:00:00	PENDING	\N	\N	\N	\N	2026-05-04 12:41:10.340929	2026-05-04 12:41:10.340929
a8a44691f7874e8b8f55b191a	d5739ca2179148ccbeb159c8c	2026-05-18 00:00:00	PENDING	\N	\N	\N	\N	2026-05-04 12:41:10.340938	2026-05-04 12:41:10.340938
995bd5e4c1f04121860578b6f	7a4afe471e73479b843fed516	2026-05-25 00:00:00	PENDING	\N	\N	\N	\N	2026-05-04 12:41:10.926888	2026-05-04 12:41:10.9269
5108c42f940640d3a15556819	f71c75c274134273836ab326a	2026-05-25 00:00:00	PENDING	\N	\N	\N	\N	2026-05-04 12:41:10.926911	2026-05-04 12:41:10.926912
8e58c697702e45ffa838fb10f	1b8406013324407696a6da1ff	2026-05-25 00:00:00	PENDING	\N	\N	\N	\N	2026-05-04 12:41:10.926921	2026-05-04 12:41:10.926922
e8ed8a5081ad497b812468b46	d5739ca2179148ccbeb159c8c	2026-05-25 00:00:00	PENDING	\N	\N	\N	\N	2026-05-04 12:41:10.92693	2026-05-04 12:41:10.926931
e720f4d0dc984381b9ad3caf9	7a4afe471e73479b843fed516	2026-06-01 00:00:00	PENDING	\N	\N	\N	\N	2026-05-04 12:41:11.501951	2026-05-04 12:41:11.501957
bc0b37e5073a4e89b54345c79	f71c75c274134273836ab326a	2026-06-01 00:00:00	PENDING	\N	\N	\N	\N	2026-05-04 12:41:11.501972	2026-05-04 12:41:11.501973
fd82d286ff6d4e7d816b2d014	1b8406013324407696a6da1ff	2026-06-01 00:00:00	PENDING	\N	\N	\N	\N	2026-05-04 12:41:11.501983	2026-05-04 12:41:11.501983
56f9a384f9fd4bc78a8bebedc	d5739ca2179148ccbeb159c8c	2026-06-01 00:00:00	PENDING	\N	\N	\N	\N	2026-05-04 12:41:11.501991	2026-05-04 12:41:11.501992
6b55545e404e4d5c970d1616a	bb136fc6aa414101ab7de6ec4	2026-05-04 00:00:00	PENDING	\N	\N	\N	\N	2026-05-04 12:42:54.318398	2026-05-04 12:42:54.318401
\.


--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: taskuser
--

COPY public.tasks (id, title, description, category_id, day_of_week, scheduled_date, reminder_time, is_recurring, is_active, created_at, updated_at, priority, estimated_minutes, project_id) FROM stdin;
5230b7a674b1450ba27a7da53	sad	sadasda	cat-deploy	5	\N	\N	t	f	2026-03-06 11:44:14.64723	2026-03-06 13:03:16.656025	MEDIUM	\N	\N
906a6c05bbc94dc8ab1c2f2cd	Finisare liga in pagina IQ-Arena	Sa termin sa fac sectiunea liga ca sa schimbat conceptul	cat-deploy	5	2026-03-06 00:00:00	15:00	f	f	2026-03-06 11:12:59.2128	2026-03-06 13:03:21.186966	MEDIUM	\N	\N
b54f91ed33384841a4fc6578a	sad	sadasda	cat-deploy	6	2026-03-14 00:00:00	\N	f	f	2026-03-06 11:45:10.094408	2026-03-06 13:03:27.52255	MEDIUM	\N	\N
930795bdc28a4ef4b0cca712e	Nunta la Ruslana	Locul de intalnire este pe data de 10 mai 2026 locul astoria Balti ora 12 prezent dupa ontinuare	cat-personal	7	2026-05-10 00:00:00	08:00	f	f	2026-03-06 13:05:16.797382	2026-03-06 13:05:35.746223	MEDIUM	24	\N
f581cfec20e54d86b19032ac4	Time Managment Job	Pe foie tip concret pentru o saptamna vietoare time managment pentru luni sa fie gata ce si cum fac si ce anume fac ! pentru toata saptamna duminica si sambata	cat-other	6	2026-03-07 00:00:00	18:00	f	f	2026-03-06 13:09:14.192864	2026-03-06 13:12:14.30652	HIGH	1	\N
d75dbfc4f4774ee8aefaecce4	Time Managment Job	Pe foie tip concret pentru o saptamna vietoare time managment pentru luni sa fie gata ce si cum fac si ce anume fac ! pentru toata saptamna duminica si sambata	cat-other	6	2026-03-07 00:00:00	18:00	f	f	2026-03-06 13:11:53.765324	2026-03-06 13:12:18.528538	MEDIUM	\N	\N
74b0a1ff0c7e4aac94f6d389e	Time Managment	\N	cat-deploy	6	\N	18:00	t	f	2026-03-06 13:44:16.268605	2026-03-06 13:44:25.343363	HIGH	120	\N
85087b80792f43179c0d1f7b3	Time Managment	Sa scriu pe ore ceea ce fac eu de la sculare pana la culcare ce tascuri fac toate 7 zile si la lcuru tot ce fac pe tasckuri ! peentur saptamna vietoare	cat-other	6	\N	18:00	t	f	2026-03-06 13:45:39.160858	2026-03-06 13:54:32.549592	MEDIUM	120	\N
f2b359f2f410434ba53daf9f7	Fotbal FC Falesti	Meci cu Ugheni locatia Falesti	cat-personal	6	\N	10:30	t	f	2026-03-06 13:53:45.370395	2026-03-06 13:55:51.884716	MEDIUM	4	\N
35cef1b968474ed393232dcc6	Time Managment	Sa scriu pe ore ceea ce fac eu de la sculare pana la culcare ce tascuri fac toate 7 zile si la lcuru tot ce fac pe tasckuri ! peentur saptamna vietoare	cat-other	6	2026-03-07 00:00:00	18:00	f	f	2026-03-06 13:55:05.232767	2026-03-06 13:55:59.307725	HIGH	120	\N
78a26fde85f34db2bd15d7560	Time Managment	Sa scriu pe ore ceea ce fac eu de la sculare pana la culcare ce tascuri fac toate 7 zile si la lcuru tot ce fac pe tasckuri ! peentur saptamna vietoare	cat-other	6	2026-03-07 00:00:00	18:00	f	f	2026-03-06 14:07:58.881344	2026-03-06 14:09:00.009191	HIGH	120	\N
3625b2b89f5e42bf80bfdac1f	Time Managment	Trebuie sa fac un regim time managment pana luni cu aceea ce fac timpul zilei pentru toate 7 zile saptamanei	cat-other	6	2026-03-10 00:00:00	18:00	f	f	2026-03-06 13:41:04.819498	2026-03-06 14:10:39.511734	HIGH	120	\N
4bbfa5236bae44c9a9fa83521	Time Managment	Sa scriu pe ore ceea ce fac eu de la sculare pana la culcare ce tascuri fac toate 7 zile si la lcuru tot ce fac pe tasckuri ! peentur saptamna vietoare	cat-other	6	2026-03-07 00:00:00	18:00	f	f	2026-03-06 14:10:28.304467	2026-03-06 14:10:48.100451	HIGH	120	\N
0295a74363c1434ead36e4a1a	Bot Bizcheck Bot	Incarcarea intrebarilor in BD si testarea lui si modificarea fluxului de lucru cu buttoanele	cat-deploy	1	2026-03-09 00:00:00	10:00	f	t	2026-03-08 20:37:21.092799	2026-03-09 09:29:21.534156	HIGH	\N	2d2c815b03f24aa6adb3175b6
8f77ec96c03845bba0e2fb413	Idei pentru Analiza Bixnesului	Trebuie de stabilit concret fluzul de lcur a acestui sistem si sa vedem cum fac partea a 2 de bot cu analiza biznesului pentru deferite domenii intrebarile sunt dar trebuie sa stabilim situatia carei si sa pornim, trebuie si sa gandim o cros platform gen nu doar telgram bot este daor o comuditate trebuie sa fie si ceva web sau similar	cat-deploy	1	2026-03-09 00:00:00	12:00	f	t	2026-03-08 20:29:21.674975	2026-03-09 09:29:33.505737	MEDIUM	\N	2d2c815b03f24aa6adb3175b6
02b96ceccd644f7c818256b11	Famelly Projects	Sa fac primele pasi în aplicatie sa stabilesc logica finala aplicatiei si sa fac primul ecran si sa dezvolt fluxul normal al aplicatiei plus logare si legare cu alte clienti	cat-deploy	2	2026-03-10 00:00:00	09:10	f	t	2026-03-08 20:33:29.890949	2026-03-09 09:28:35.9163	HIGH	\N	34eb9c1303fc459eb3d773f7d
07946d6c5bd14b478a91190f5	Teza de licenta	Trebuie de analizat raportul facut la TPS si de il stabilit ce modificari de facut si de finisat aceste 30% de licenta  anume raportul capitolul 1	cat-personal	2	2026-03-10 00:00:00	09:00	f	t	2026-03-08 20:30:30.558794	2026-03-09 09:29:04.084054	URGENT	\N	3296ed0c12c64e98b0352c300
200660aacd404c538b18d8771	Bot Bizcheck	Schimbarea lui de pe Sqlite pe postrageSql pentru un flux mai mare de date si cereri in acelasi timp pentru o performanta mai buna	cat-deploy	1	2026-03-09 00:00:00	11:00	f	t	2026-03-08 20:38:18.775548	2026-03-09 09:29:11.970867	URGENT	\N	2d2c815b03f24aa6adb3175b6
6ca7b15df2194133b95ca0e49	Bot Bizcheck	Scoatem buttonul de start test testul porneste diodata dupa intrebari de cunostinta	cat-deploy	1	2026-03-09 00:00:00	09:15	f	t	2026-03-08 20:39:28.843314	2026-03-09 09:29:17.886493	URGENT	\N	2d2c815b03f24aa6adb3175b6
d5dd3fad36524091aa02cd63d	Aplicatia Anaiza Biznesului	\N	cat-deploy	3	2026-03-11 00:00:00	10:00	f	t	2026-03-08 20:35:55.912268	2026-03-09 09:30:05.056202	HIGH	\N	2d2c815b03f24aa6adb3175b6
524dfad689ca49f7ad1d33e1d	Famelly Projects	Sa fac primele pasi în aplicatie sa stabilesc logica finala aplicatiei si sa fac primul ecran si sa dezvolt fluxul normal al aplicatiei plus logare si legare cu alte clienti	cat-deploy	3	2026-03-11 00:00:00	15:00	f	t	2026-03-08 20:34:11.101562	2026-03-09 09:30:09.189598	HIGH	\N	34eb9c1303fc459eb3d773f7d
20f5089efef94ec19ff64fd61	Teza de licenta	Scrierea aplicatiei mobile pentru teza  si gandirea si stabilirea fluxului a logicei	cat-personal	3	2026-03-11 00:00:00	20:00	f	t	2026-03-08 20:42:51.888607	2026-03-09 09:30:38.670122	URGENT	\N	3296ed0c12c64e98b0352c300
241dd322167a45fdbf91e9fe8	Raport Teza	INceperea scrieri a 30% a tezei de licenta	cat-personal	4	2026-03-12 00:00:00	20:00	f	f	2026-03-08 20:41:49.518977	2026-03-17 07:22:27.179845	URGENT	\N	3296ed0c12c64e98b0352c300
3d4ce48c92904af5937fcfae2	Famelly Projects	Sa fac primele pasi în aplicatie sa stabilesc logica finala aplicatiei si sa fac primul ecran si sa dezvolt fluxul normal al aplicatiei plus logare si legare cu alte clienti	cat-deploy	4	2026-03-12 00:00:00	10:00	f	t	2026-03-08 20:36:24.117427	2026-03-09 09:31:00.608656	HIGH	\N	34eb9c1303fc459eb3d773f7d
a5f11ef34f2b47549b0f5f932	Aplicatia Web la teza de licenta	Stabilirea tuturor stantardelor si complectarea cu context	cat-personal	4	2026-03-12 00:00:00	17:00	f	f	2026-03-08 20:41:10.456849	2026-03-17 07:22:24.171096	URGENT	\N	3296ed0c12c64e98b0352c300
7e0ef598bdb844d7b66e507fb	Meci de Fotbal	Meci de fotbal ora 15 la Joma Arena	cat-personal	5	2026-03-13 00:00:00	09:30	f	f	2026-03-08 20:40:18.124018	2026-05-04 09:31:54.026898	MEDIUM	3	\N
46824e4c9d37427a93101a042	IQ-Arena	Finisarea proiectului si transferarea lui pe DOcker compose pentru a il putea incarca pe server	cat-deploy	5	2026-03-13 00:00:00	09:00	f	t	2026-03-08 20:35:07.395958	2026-03-09 09:31:25.850277	HIGH	\N	4eaf52540cd8465698bd33c10
49bf74c11e4247fab5dc48403	Intalnire cu Ivan Turcan	INtalnirea cu IVan si prezentarea ocupatiilem mele pe 2 saptamani trecuta si prezenta	cat-personal	3	2026-03-18 00:00:00	14:00	t	f	2026-03-06 11:27:17.256071	2026-05-03 06:10:30.129689	MEDIUM	\N	\N
fbe78bf048da41d6904962fde	Backend la teza	Scrierea logicei si legatura ei de toate aplicatie fluxul ei si gandirea modelului Ai pentru procesarea datelor	cat-personal	5	2026-03-13 00:00:00	18:00	f	f	2026-03-08 20:43:54.185197	2026-05-04 09:31:42.697769	URGENT	\N	3296ed0c12c64e98b0352c300
e0eca13188194cac9ffcd90be	Famelly Projects	Contiunea dezvoltarei lui	cat-infrastructure	6	2026-03-14 00:00:00	15:00	f	f	2026-03-08 20:45:13.65777	2026-05-04 09:32:05.89085	HIGH	\N	34eb9c1303fc459eb3d773f7d
2f55b54d13da4bfaa30a8e060	Sala de forte	sport Cardio + picoarele	cat-personal	2	2026-03-10 00:00:00	18:00	f	t	2026-03-08 20:49:56.389157	2026-03-08 20:49:56.389159	HIGH	1	\N
fb8bb48d7cc44d2f9c387456c	Sala de sport	Sport	cat-personal	6	2026-03-14 00:00:00	08:00	f	f	2026-03-08 20:45:38.417802	2026-05-04 09:32:12.941961	HIGH	\N	\N
25b946e1d17f4f9f8d8fa0d44	70% de teza scrise si caietul complectat petnru saptamana data	caietul complectat si 70% scrise din licenta	cat-personal	6	2026-03-14 00:00:00	18:00	f	f	2026-03-08 20:46:40.2547	2026-05-04 09:32:02.58891	URGENT	\N	3296ed0c12c64e98b0352c300
ac73fdd1318a4c388f9799b4c	Testing	Voi testa aplicatia si toate nevoile ei si voi verifica securitatea acestei pagini si voi corecta bagurile ori voi insemna in bug raport petnru corectare pe saptaman curenta	cat-deploy	3	2026-03-11 00:00:00	\N	f	t	2026-03-09 13:09:25.586995	2026-03-09 13:09:25.587001	HIGH	\N	4eaf52540cd8465698bd33c10
7ca603f311a845269c2ef076c	IQ-Arena	Terminarea si revizuairea fontuluide pe pagina	cat-deploy	2	2026-03-10 00:00:00	10:00	f	t	2026-03-08 20:54:28.31569	2026-03-09 09:28:42.224813	HIGH	\N	4eaf52540cd8465698bd33c10
455b0143efd5456daca44fac5	Inderpretare planului del flux pentru analizator de biznes	Vom rescrie landing page din prima versiune si vreau sa fac ca sa fie mai frumos si fluxul din intrebari aparute	cat-infrastructure	3	2026-03-11 00:00:00	09:00	f	t	2026-03-10 14:17:55.406518	2026-03-10 14:17:55.406524	MEDIUM	\N	\N
e02749fd918d4a3cbb4e6f53a	Finnisare pagina de Logare la IQ-Arena	Trebuie sa termin fluxul corect si normal de logare si lucru a paginei si mici modificari in Admin panel pentru comoditati	cat-deploy	1	2026-03-09 00:00:00	09:30	f	t	2026-03-08 20:27:25.038631	2026-03-09 09:29:26.444572	MEDIUM	\N	4eaf52540cd8465698bd33c10
7f01f1ad69a9406fb2a0d88fd	Task manager	Modificari pentru un flux de lucru corect si migrare spre toate insemnarile spre el	cat-personal	1	2026-03-09 00:00:00	\N	f	t	2026-03-09 09:25:08.055174	2026-03-09 09:29:39.644278	HIGH	\N	3c05c54415c74001acbbc407b
0e37db62320e452db48d8b09c	Dezvoltarea aplicatiilor pentru Teza de licenta	De finisat aplicatia Web pana la sfasit si de facut un guide pe cod gen sa stiu ce si cum se fac esa invat acesta site gen sa stiu ce si cum se face sa invat mai mult JS si TS	cat-deploy	2	2026-03-10 00:00:00	12:00	f	t	2026-03-08 20:32:06.180831	2026-03-09 09:29:53.012206	HIGH	\N	3296ed0c12c64e98b0352c300
47279912f2c34389bf24f91cc	BizCheck	scrierea backendului pentru acesta aplicatie	cat-deploy	3	2026-03-11 00:00:00	09:00	f	t	2026-03-10 20:00:14.655616	2026-03-10 20:00:14.655622	HIGH	\N	2d2c815b03f24aa6adb3175b6
ace0cc8a410f40d1b32209cb4	SKILL.md	Promturi deja gata facute pentru agent AI pentru a optimiza si mai divreme dea face diste sarcini standarte sau deja gata prigatite din timp ca PDf,Word,Security	cat-monitoring	3	2026-03-11 00:00:00	16:00	f	t	2026-03-09 07:08:15.370364	2026-03-09 09:30:29.49731	MEDIUM	\N	3c05c54415c74001acbbc407b
dd0824905a4646b98e81f43fa	BizCheck	Stabilirea unei idei concrete si dezolvtarea unei idei pe mai multe platforme in acelasi timp	cat-deploy	4	2026-03-12 00:00:00	09:00	f	t	2026-03-08 20:53:46.2257	2026-03-09 09:30:54.082589	HIGH	\N	2d2c815b03f24aa6adb3175b6
75e58fc5708c41c6a92d1b0b4	Famelly Projects	Sa fac primele pasi în aplicatie sa stabilesc logica finala aplicatiei si sa fac primul ecran si sa dezvolt fluxul normal al aplicatiei plus logare si legare cu alte clienti	cat-deploy	5	2026-03-13 00:00:00	10:00	f	f	2026-03-12 10:45:14.161128	2026-05-04 09:31:46.983123	MEDIUM	\N	\N
b3039818cc304839b3d29b635	Volei	Volei competitie intre camin	cat-personal	4	2026-03-12 00:00:00	14:00	f	f	2026-03-09 08:54:35.999018	2026-03-17 07:21:44.362559	HIGH	\N	\N
79f026449b9240ff83a386ad1	Inderpretare planului del flux pentru analizator de biznes	Vom rescrie landing page din prima versiune si vreau sa fac ca sa fie mai frumos si fluxul din intrebari aparute	cat-infrastructure	2	2026-03-10 00:00:00	09:00	f	t	2026-03-09 09:28:08.133496	2026-03-09 10:15:29.471835	HIGH	\N	2d2c815b03f24aa6adb3175b6
8428c838cb9c4a3a8f5c19b63	inlinekeyboard	inlinekeyboard sa fie cate 2 pe linie si ultima sa fie alt domeniu	cat-deploy	1	2026-03-09 00:00:00	\N	f	t	2026-03-09 11:49:59.207159	2026-03-09 11:49:59.207164	MEDIUM	\N	2d2c815b03f24aa6adb3175b6
27d57c774ce24035b1c079335	Context	scrisurile inutile si fara sens sa fie scoase sau redactate sa fie mai bine si sa arate mai interesant	cat-deploy	1	2026-03-09 00:00:00	\N	f	t	2026-03-09 11:50:43.184933	2026-03-09 11:50:43.184937	HIGH	\N	2d2c815b03f24aa6adb3175b6
1344fff43c2e4318b2877fe70	Docker compose	Criem un docker compose, image pentru acest fisiser si il prigatim de postare spre server, si prigatire spre postare pe server si pornirea functionalitatii	cat-deploy	1	2026-03-09 00:00:00	\N	f	t	2026-03-09 13:03:46.361013	2026-03-09 13:03:46.361016	HIGH	\N	4eaf52540cd8465698bd33c10
40c645642ba94115bc942a78f	BizCheck Admin panel	Scrierea admin panel pentru aplicatie si adaugare functii necesare	cat-deploy	3	2026-03-11 00:00:00	10:00	f	t	2026-03-10 20:00:55.838754	2026-03-10 20:00:55.838758	HIGH	\N	2d2c815b03f24aa6adb3175b6
d5ac71c7a0e446f89f691f5cf	Bizcheck Admin monitoring	Sa pot monitoriza ce si cum au raspuns utilizatorii la intrebari si sa se salveze fiecare raspuns in BD	cat-deploy	3	2026-03-11 00:00:00	\N	f	t	2026-03-10 20:01:46.607721	2026-03-10 20:01:46.607725	HIGH	\N	2d2c815b03f24aa6adb3175b6
ebb05222db1046769caa8bbb8	Bizcheck	Adaugare in admin panel descarca raport comun in excel pentru a vedea statistica la fiecare gen pe toti intrun fisier excel pentru a le vedea ce si cum au raspuns la intrebari dupa un execplu facut deja	cat-deploy	3	2026-03-11 00:00:00	\N	f	t	2026-03-10 20:02:54.0148	2026-03-10 20:02:54.014801	HIGH	\N	2d2c815b03f24aa6adb3175b6
d42bdba998794625813432914	BizCheck admin	Posibilitatea de a discarca rapoartele pdf care le apre la utilizatori la sfarsit gen sa fac ca aceea pagina sa fie posibil de o descarcat din bd sau si utilizaotrul sa o descarce tot	cat-deploy	3	2026-03-11 00:00:00	\N	f	t	2026-03-10 20:04:07.349406	2026-03-10 20:04:07.349408	HIGH	\N	2d2c815b03f24aa6adb3175b6
18023b5a224d4d2db2fa5df3e	BizCheck	Intrebarile in 2 limbi ro si ru plus ordinea intrebarilor cum ele  trebuie sa mearga daca la unile asa ap cate in total asa fie gen	cat-deploy	3	2026-03-11 00:00:00	13:00	f	t	2026-03-10 20:05:01.458376	2026-03-10 20:05:01.458379	HIGH	\N	2d2c815b03f24aa6adb3175b6
54fcde94260d4d79bbc4b23ac	Sala de forte	Cardio+partea frontala a corpului+Manale + deltele	cat-personal	5	2026-03-13 00:00:00	18:00	f	f	2026-03-08 20:52:02.423752	2026-03-10 20:05:33.254775	HIGH	120	\N
c7eed99b879c44a58278ad9e2	Strutura si veriunea 1.0	Structura prima versiune primul model llm si primele expirieminte	cat-deploy	3	2026-03-11 00:00:00	\N	f	t	2026-03-11 08:56:14.239048	2026-03-11 08:56:14.239053	LOW	\N	a1d53c31fc7e47f280073e115
ed7ef6d9264e4a47af6c62fc9	Finisarea aplicatiei Web	De terminat toate functiile care predomina in acesta aplicatie mobila de unit tot asta cu BD si cu fluxul de lcuur a aplicatiei mele, si de stabilit un flux normal pe nur utilizatori	cat-personal	7	2026-03-15 00:00:00	12:00	f	f	2026-03-09 07:58:11.437896	2026-03-17 07:21:09.659133	HIGH	\N	3296ed0c12c64e98b0352c300
7ca76a0cb6bc45379830dfb98	Raport Teza	INceperea scrieri a 30% a tezei de licenta	cat-personal	2	2026-03-17 00:00:00	20:00	f	t	2026-03-17 07:21:58.156387	2026-03-17 07:21:58.15639	MEDIUM	\N	\N
94eb105b406449fda0b893a6f	Backend la teza	Scrierea logicei si legatura ei de toate aplicatie fluxul ei si gandirea modelului Ai pentru procesarea datelor	cat-personal	2	2026-03-17 00:00:00	18:00	f	t	2026-03-17 07:22:17.7444	2026-03-17 07:22:17.744404	MEDIUM	\N	\N
f6078bad70ab4f7590de4c1aa	SKILL.md	Promturi deja gata facute pentru agent AI pentru a optimiza si mai divreme dea face diste sarcini standarte sau deja gata prigatite din timp ca PDf,Word,Security	cat-monitoring	5	2026-03-13 00:00:00	16:00	f	f	2026-03-10 20:05:18.596586	2026-05-04 09:31:50.72737	MEDIUM	\N	\N
3bd8a899125a49f1a0a438d4f	LLM pentru teza	scrierea modelului si antrenarea lui pentur primele rezultate	cat-personal	6	2026-03-14 00:00:00	10:00	f	f	2026-03-08 20:44:46.278917	2026-05-04 09:32:09.518565	URGENT	\N	3296ed0c12c64e98b0352c300
8d0e2d57818c4f89b77051fcf	Testing to aplication	Voi testa aplicatia care este si voi indntifica erori baguri si le voi corecta sau daca sunt mari le voi lasa spre prigatirea si testarea lor	cat-deploy	6	2026-03-14 00:00:00	10:00	f	f	2026-03-09 13:08:28.006484	2026-05-04 09:32:16.481755	URGENT	\N	3296ed0c12c64e98b0352c300
c0592175f16f48ea9a1fa3eaa	30% versiunea 2 cu modificari si noi momente interesante	Voi modifica si voi adauga oda si code si despre Ai in contabilitate	cat-personal	2	2026-03-17 00:00:00	\N	f	t	2026-03-17 07:23:59.799565	2026-03-17 07:23:59.79957	HIGH	\N	3296ed0c12c64e98b0352c300
43051b8df9794257bd174fe7b	Intâlnire cu dmn. Irina	Pentru a procura si a schimba outfitul meu	cat-personal	1	2026-03-16 00:00:00	\N	f	t	2026-03-17 09:29:16.303774	2026-03-17 09:29:16.303777	MEDIUM	\N	\N
757517e6cafe4be6836038fac	Antrenament in sala	Sal de forte utm	cat-personal	1	2026-03-16 00:00:00	\N	f	t	2026-03-17 09:38:06.183635	2026-03-17 09:38:06.183637	MEDIUM	\N	\N
18c77bf5f86f4db7a3772b6d3	Teza de licenta	Scrierea unui backend care va stoca toate aceste date care vor trece prin ea si securizarea gandita si continuare dezvoltarea aplicateii mobile si web	cat-personal	2	2026-03-17 00:00:00	\N	f	t	2026-03-17 09:44:16.842639	2026-03-17 09:44:16.842644	URGENT	\N	3296ed0c12c64e98b0352c300
f4eaa0193be04ed3934060e8c	LLM pentru teza	scrierea modelului si antrenarea lui pentur primele rezultate	cat-personal	4	2026-03-19 00:00:00	10:00	f	f	2026-03-17 09:38:57.037525	2026-05-04 09:32:27.407379	MEDIUM	\N	\N
f110774584e949f1af87d971e	Moldova Lituania	Meci de fotbal, Moldova Lituania la ora 17 incepe la 16 de dorit sa fiu la teren	cat-personal	4	2026-03-26 00:00:00	15:00	f	f	2026-03-17 09:41:53.323157	2026-05-04 09:32:40.109491	MEDIUM	\N	\N
9de9157705b74747bf596432c	Testing aplicatie	\N	cat-deploy	1	2026-03-16 00:00:00	\N	f	t	2026-03-17 09:37:24.849526	2026-03-17 09:37:24.849531	MEDIUM	\N	34eb9c1303fc459eb3d773f7d
f13759a17ba94735b2a251513	Redisain aplicatiei	Redisain de la prima  pre verion 1.0	cat-deploy	1	2026-03-16 00:00:00	\N	f	t	2026-03-17 09:33:08.963644	2026-03-17 09:37:31.030261	MEDIUM	\N	34eb9c1303fc459eb3d773f7d
2fe7d17d1dfa4b7c89f0156ab	SKILL.md	Promturi deja gata facute pentru agent AI pentru a optimiza si mai divreme dea face diste sarcini standarte sau deja gata prigatite din timp ca PDf,Word,Security	cat-monitoring	3	2026-03-18 00:00:00	16:00	f	t	2026-03-17 09:38:43.36995	2026-03-17 09:38:43.369953	MEDIUM	\N	\N
7c243314a41a4f9086d53f912	Teza de licenta	Scrierea unui backend care va stoca toate aceste date care vor trece prin ea si securizarea gandita si continuare dezvoltarea aplicateii mobile si web	cat-personal	3	2026-03-18 00:00:00	\N	f	t	2026-03-17 09:44:42.775048	2026-03-17 09:44:42.775049	MEDIUM	\N	3296ed0c12c64e98b0352c300
745d465f176248d78a5b643c3	Aplicatia de gadnit ce si cum si unde postam	\N	cat-deploy	3	2026-03-18 00:00:00	\N	f	t	2026-03-18 07:59:00.06054	2026-03-18 07:59:00.060543	MEDIUM	\N	34eb9c1303fc459eb3d773f7d
60e136cfe1114e3184696108b	30% pentru teza	Sa redactez corect raportul si sa il expidiez dmn Bunmbu	cat-personal	3	2026-03-18 00:00:00	\N	f	t	2026-03-18 07:59:50.294449	2026-03-18 07:59:50.294451	MEDIUM	\N	3296ed0c12c64e98b0352c300
b25830c1df354804ac207aa15	Intalnire cu Ivan Turcan	\N	cat-personal	3	2026-03-18 00:00:00	16:30	f	t	2026-03-18 09:04:03.920873	2026-03-18 09:04:03.920882	MEDIUM	\N	\N
c994c8e35f7e4c3287c659a97	IQ-arena	Migrare spre Tailwingcss de la css simplu	cat-deploy	3	2026-03-18 00:00:00	\N	f	t	2026-03-18 11:10:30.623759	2026-03-18 11:10:30.623764	MEDIUM	\N	4eaf52540cd8465698bd33c10
75f71e01ec04448ba282070d2	Bizcheck	\N	cat-security	1	2026-05-04 00:00:00	\N	f	t	2026-05-03 06:15:54.987496	2026-05-03 06:15:54.9875	HIGH	\N	2d2c815b03f24aa6adb3175b6
afe9f7f4af504272a67073848	Finisare raport la teza	\N	cat-deploy	1	2026-05-04 00:00:00	\N	f	t	2026-05-03 06:16:14.772418	2026-05-03 06:16:14.772419	URGENT	\N	3296ed0c12c64e98b0352c300
a516d184aabf4ab2bd319cc6c	Finisare aplicatie teza AI-Contabil	\N	cat-deploy	1	2026-05-04 00:00:00	\N	f	t	2026-05-03 06:17:12.131092	2026-05-03 06:17:12.131096	URGENT	\N	3296ed0c12c64e98b0352c300
ad997e22d5184291ba520653d	bizcheck	\N	cat-deploy	2	2026-05-05 00:00:00	\N	f	t	2026-05-03 06:18:59.306034	2026-05-03 06:18:59.306037	HIGH	\N	2d2c815b03f24aa6adb3175b6
bdf354f9fd4f4699a2c346eb8	Google sheets	\N	cat-infrastructure	1	2026-05-04 07:08:13.250874	12:00	f	t	2026-05-04 07:08:20.791168	2026-05-04 07:08:20.791173	MEDIUM	\N	\N
d12d788c5a994af9a50608403	cgam.md	\N	cat-deploy	1	2026-05-04 07:11:17.766403	12:00	f	t	2026-05-04 07:11:21.716802	2026-05-04 07:11:21.716808	MEDIUM	\N	\N
18ccfd6600ff4f18a7e5aa951	Famelly Projects	Dezolvatrea statistiilor si adaugare functii noi in aplicatie	cat-deploy	5	2026-03-13 00:00:00	10:00	f	f	2026-03-08 20:52:47.198309	2026-05-04 09:31:35.741228	HIGH	\N	34eb9c1303fc459eb3d773f7d
de4b4d1695fc4999b77dba17f	Cunostita cum sa lansam aplicatia pe piata	PE google Play	cat-monitoring	4	2026-03-19 00:00:00	\N	f	f	2026-03-18 12:56:27.966262	2026-05-04 09:32:24.173789	MEDIUM	\N	34eb9c1303fc459eb3d773f7d
796ed2d0b9bf4a60880eae191	Testing to aplication	Voi testa aplicatia care este si voi indntifica erori baguri si le voi corecta sau daca sunt mari le voi lasa spre prigatirea si testarea lor	cat-deploy	5	2026-03-20 00:00:00	10:00	f	f	2026-03-17 09:39:19.522778	2026-05-04 09:32:30.242412	MEDIUM	\N	\N
9b5ed511cd4042bbacdd209a4	Convorbire cu Ivan Turcan	Convorbiri cu Ivan Turcan la ora 15.00	cat-other	2	2026-03-24 00:00:00	\N	f	f	2026-03-17 14:48:12.943077	2026-05-04 09:32:37.014175	MEDIUM	\N	\N
6abbadf2e0a048e8a08ac4100	Task Manager	\N	cat-infrastructure	1	2026-05-04 00:00:00	\N	f	t	2026-05-04 09:38:49.675704	2026-05-04 09:38:49.675707	LOW	\N	3c05c54415c74001acbbc407b
ac81d9b71aa94d1e80c50fa0c	DocuSafe	11 etape de creaere impartite pe saptamna acesta terminul limita este 11 mai	cat-infrastructure	3	\N	\N	f	t	2026-05-04 12:40:48.622936	2026-05-04 12:41:03.568049	MEDIUM	\N	904cd966ab6a4b71992a48113
7a4afe471e73479b843fed516	DocuSafe	11 etape de creaere impartite pe saptamna acesta terminul limita este 11 mai	cat-infrastructure	1	\N	\N	f	t	2026-05-04 12:40:48.372357	2026-05-04 12:41:15.578406	MEDIUM	\N	904cd966ab6a4b71992a48113
f71c75c274134273836ab326a	DocuSafe	11 etape de creaere impartite pe saptamna acesta terminul limita este 11 mai	cat-infrastructure	2	\N	\N	f	t	2026-05-04 12:40:48.509498	2026-05-04 12:41:20.186131	MEDIUM	\N	904cd966ab6a4b71992a48113
1b8406013324407696a6da1ff	DocuSafe	11 etape de creaere impartite pe saptamna acesta terminul limita este 11 mai	cat-infrastructure	4	\N	\N	f	t	2026-05-04 12:40:48.73083	2026-05-04 12:41:24.650998	MEDIUM	\N	904cd966ab6a4b71992a48113
d5739ca2179148ccbeb159c8c	DocuSafe	11 etape de creaere impartite pe saptamna acesta terminul limita este 11 mai	cat-infrastructure	5	\N	\N	f	t	2026-05-04 12:40:48.85419	2026-05-04 12:41:28.556832	MEDIUM	\N	904cd966ab6a4b71992a48113
6ecd3fc488604b31aa54d92e3	Flow digital concept	\N	cat-infrastructure	1	2026-05-05 00:00:00	\N	f	f	2026-05-03 06:17:48.535481	2026-05-04 12:42:11.216733	MEDIUM	\N	b1cf17f20add49a0b9e7f4ea7
bb136fc6aa414101ab7de6ec4	DocuSafe	primele 2 etape a proeictului	cat-infrastructure	1	2026-05-04 00:00:00	\N	f	t	2026-05-04 12:42:54.278216	2026-05-04 12:42:54.278219	MEDIUM	\N	904cd966ab6a4b71992a48113
\.


--
-- Data for Name: telegram_sessions; Type: TABLE DATA; Schema: public; Owner: taskuser
--

COPY public.telegram_sessions (chat_id, state, updated_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: taskuser
--

COPY public.users (id, username, email, full_name, telegram_chat_id, role, pin_hash, is_active, last_login_at, created_at, updated_at, theme, notification_settings, password_hash, phone) FROM stdin;
1165760598	admin	maxim.chistol@iis.utm.md	Administrator	1165760598	ADMIN	b5a81d2ad051b3fe58672410cddaa83aabbef4c09abdc5a992666caf3ac33064	t	2026-05-04 11:57:23.781913	2026-05-03 05:29:06.196923	2026-05-04 11:57:23.782902	dark	{"telegram": true, "web": true, "doNotDisturbStart": "", "doNotDisturbEnd": "", "defaultReminderMinutes": [15]}	840b01a0624ec04f2eb0f8e77f56fab4ed8e1957126d8b532f9fe59cedde9a86	\N
\.


--
-- Name: access_requests access_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.access_requests
    ADD CONSTRAINT access_requests_pkey PRIMARY KEY (id);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: calendar_events calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);


--
-- Name: calendar_reminder_logs calendar_reminder_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.calendar_reminder_logs
    ADD CONSTRAINT calendar_reminder_logs_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: event_categories event_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.event_categories
    ADD CONSTRAINT event_categories_pkey PRIMARY KEY (id);


--
-- Name: login_codes login_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.login_codes
    ADD CONSTRAINT login_codes_pkey PRIMARY KEY (id);


--
-- Name: nb_note_history nb_note_history_pkey; Type: CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.nb_note_history
    ADD CONSTRAINT nb_note_history_pkey PRIMARY KEY (id);


--
-- Name: nb_notes nb_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.nb_notes
    ADD CONSTRAINT nb_notes_pkey PRIMARY KEY (id);


--
-- Name: nb_sketches nb_sketches_pkey; Type: CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.nb_sketches
    ADD CONSTRAINT nb_sketches_pkey PRIMARY KEY (id);


--
-- Name: nb_topics nb_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.nb_topics
    ADD CONSTRAINT nb_topics_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: reminder_logs reminder_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.reminder_logs
    ADD CONSTRAINT reminder_logs_pkey PRIMARY KEY (id);


--
-- Name: task_completions task_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.task_completions
    ADD CONSTRAINT task_completions_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: telegram_sessions telegram_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.telegram_sessions
    ADD CONSTRAINT telegram_sessions_pkey PRIMARY KEY (chat_id);


--
-- Name: task_completions uq_task_completion_week; Type: CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.task_completions
    ADD CONSTRAINT uq_task_completion_week UNIQUE (task_id, week_start);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_cal_events_user_date; Type: INDEX; Schema: public; Owner: taskuser
--

CREATE INDEX idx_cal_events_user_date ON public.calendar_events USING btree (user_id, event_date) WHERE (is_deleted = false);


--
-- Name: idx_nb_history_note; Type: INDEX; Schema: public; Owner: taskuser
--

CREATE INDEX idx_nb_history_note ON public.nb_note_history USING btree (note_id);


--
-- Name: idx_nb_notes_topic; Type: INDEX; Schema: public; Owner: taskuser
--

CREATE INDEX idx_nb_notes_topic ON public.nb_notes USING btree (topic_id) WHERE (is_deleted = false);


--
-- Name: idx_nb_notes_user; Type: INDEX; Schema: public; Owner: taskuser
--

CREATE INDEX idx_nb_notes_user ON public.nb_notes USING btree (user_id) WHERE (is_deleted = false);


--
-- Name: idx_nb_topics_user; Type: INDEX; Schema: public; Owner: taskuser
--

CREATE INDEX idx_nb_topics_user ON public.nb_topics USING btree (user_id) WHERE (is_deleted = false);


--
-- Name: ix_access_requests_status; Type: INDEX; Schema: public; Owner: taskuser
--

CREATE INDEX ix_access_requests_status ON public.access_requests USING btree (status);


--
-- Name: ix_calendar_reminder_logs_event; Type: INDEX; Schema: public; Owner: taskuser
--

CREATE INDEX ix_calendar_reminder_logs_event ON public.calendar_reminder_logs USING btree (event_id, occurrence_date);


--
-- Name: ix_event_categories_user_id; Type: INDEX; Schema: public; Owner: taskuser
--

CREATE INDEX ix_event_categories_user_id ON public.event_categories USING btree (user_id);


--
-- Name: ix_login_codes_user_id; Type: INDEX; Schema: public; Owner: taskuser
--

CREATE INDEX ix_login_codes_user_id ON public.login_codes USING btree (user_id);


--
-- Name: ix_nb_sketches_user_id; Type: INDEX; Schema: public; Owner: taskuser
--

CREATE INDEX ix_nb_sketches_user_id ON public.nb_sketches USING btree (user_id);


--
-- Name: ix_users_email; Type: INDEX; Schema: public; Owner: taskuser
--

CREATE UNIQUE INDEX ix_users_email ON public.users USING btree (email);


--
-- Name: ix_users_telegram_chat_id; Type: INDEX; Schema: public; Owner: taskuser
--

CREATE INDEX ix_users_telegram_chat_id ON public.users USING btree (telegram_chat_id);


--
-- Name: ix_users_username; Type: INDEX; Schema: public; Owner: taskuser
--

CREATE UNIQUE INDEX ix_users_username ON public.users USING btree (username);


--
-- Name: calendar_events calendar_events_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.event_categories(id);


--
-- Name: tasks fk_tasks_project_id; Type: FK CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT fk_tasks_project_id FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: nb_note_history nb_note_history_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.nb_note_history
    ADD CONSTRAINT nb_note_history_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.nb_notes(id) ON DELETE CASCADE;


--
-- Name: nb_notes nb_notes_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.nb_notes
    ADD CONSTRAINT nb_notes_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.nb_topics(id);


--
-- Name: nb_sketches nb_sketches_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.nb_sketches
    ADD CONSTRAINT nb_sketches_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.nb_topics(id);


--
-- Name: task_completions task_completions_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.task_completions
    ADD CONSTRAINT task_completions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id);


--
-- Name: tasks tasks_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: taskuser
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- PostgreSQL database dump complete
--

\unrestrict C5M9l4ZrVDc6MSJuGdn3NkXPgSw6MXlzPWM3Vvap8qArzTAgLQvqFg5fmPbcdmd

