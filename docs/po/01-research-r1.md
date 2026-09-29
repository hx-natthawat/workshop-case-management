# Stage 1 · Research รอบตัดสินใจที่ 1 (R1)

ตรวจสอบเมื่อ 30 ก.ย. 2569 · ตอบคำถาม Q1–Q8 ใน [issue #16](https://github.com/hx-natthawat/workshop-case-management/issues/16) สำหรับรายการ F-02, F-03, F-06, F-09, F-10, F-12, F-14, F-15 ใน `09-feedback.md` · ต่อยอดจาก `01-research.md` (ไม่ตรวจซ้ำรายการที่ยืนยันแล้ว)

สถานะ: **ยืนยันแล้ว** = อ่านจากแหล่งข้อมูลหลักโดยตรง · **ยืนยันบางส่วน** = แหล่งหลักยืนยันเพียงบางประเด็น หรือเห็นเฉพาะข้อความจากผลค้นหาของหน้าทางการ · **ยังไม่ยืนยัน** = ไม่พบแหล่งหลักที่เข้าถึงได้

เอกสารนี้รวบรวมหลักฐานเท่านั้น **ไม่ได้ตัดสินใจแทน PO** บรรทัด "นัยต่อการตัดสินใจ" ระบุเพียงว่าหลักฐานเปิดหรือปิดทางเลือกใด

---

## Q1 (F-02) · เหตุขัดข้องทั้งองค์กรเป็น priority สูงสุดโดยไม่ขึ้นกับค่าเริ่มต้นของหมวดหรือไม่

**ข้อค้นพบ**
- ServiceNow (base system) คำนวณ priority จาก **Impact × Urgency** ด้วย Priority Lookup Rules และช่อง Priority เป็น read-only โดยค่าเริ่มต้น · Impact "1 - High" + Urgency "1 - High" = "1 - Critical" · ไม่ได้อิงหมวดของเคส
- Jira Service Management มีเมทริกซ์ Impact (Extensive/Widespread → Minor/Localized) × Urgency (Critical → Low) · ผลเป็น Highest เมื่อ Extensive/Widespread + Critical หรือ High และเมื่อ Significant/Large + Critical
- Atlassian นิยาม major incident ว่าเป็นเหตุที่กระทบการดำเนินงานอย่างมีนัยสำคัญ และระบุว่าองค์กร **ต้องกำหนดเกณฑ์เอง** เช่น บริการสำคัญล่ม หรือกระทบผู้ใช้เกินจำนวนที่ตั้งไว้ · มี queue "Major incident" แยกต่างหาก
- ITIL 4 (AXELOS): Incident Management Practice Guide เป็นเอกสารแบบเสียเงิน อ่านต้นฉบับไม่ได้ในรอบนี้

**แหล่งที่มา**
- ServiceNow · Define priority lookup rules — https://www.servicenow.com/docs/r/it-service-management/incident-management/def-prio-lookup-rules.html
- Atlassian · Calculating priority automatically (JSM DC 10.4) — https://confluence.atlassian.com/servicemanagementserver104/calculating-priority-automatically-1528206784.html
- Atlassian · What are major incidents? — https://support.atlassian.com/jira-service-management-cloud/docs/what-are-major-incidents/
- AXELOS · ITIL 4 Practitioner: Incident Management — https://www.axelos.com/certifications/itil-service-management/itil-practices-manager/itil-4-specialist-monitor-support-and-fulfil/itil-4-practitioner-incident-management

**สถานะ** ServiceNow และ JSM: ยืนยันแล้ว · นิยาม major incident ของ Atlassian: ยืนยันบางส่วน (จากผลค้นหาของหน้าทางการ) · ITIL: **ยังไม่ยืนยัน**

**นัยต่อการตัดสินใจ** ทั้งสองผลิตภัณฑ์กำหนด priority จากขอบเขตผลกระทบและความเร่งด่วน ไม่ได้จำกัดด้วยค่าเริ่มต้นของหมวด แนวทาง "ทั้งหน่วยงาน → P1" จึงสอดคล้องกับแนวปฏิบัติของเครื่องมือ ITSM แต่กติกา "ปรับขึ้นได้ 1 ระดับ" ใน SPEC §4 ไม่มีต้นแบบรองรับหรือคัดค้านโดยตรง

---

## Q2 (F-09) · SLA แบบเวลาทำการ: เป้าหมายที่ตกช่วงสิ้นวันถูกบันทึกว่าเกินกำหนดเมื่อใด

**ข้อค้นพบ**
- Zendesk: เป้าหมายที่ตั้งเป็นเวลาทำการ **ยกยอดไปวันทำการถัดไปได้** ตัวอย่างทางการคือเป้าหมาย 8 ชั่วโมงทำการที่สร้างบ่ายวันศุกร์จะครบกำหนดเช้าวันจันทร์ · badge แสดงเวลาที่เหลือเป็นเวลาปฏิทิน แต่วันครบกำหนดคิดตามเวลาทำการ
- Freshdesk: เมื่อเลือกเวลาทำการ "สิ่งที่อยู่นอกเวลาทำการจะไม่ถูกจับเวลา"
- JSM: SLA ที่ผูกปฏิทินแบบไม่ใช่ 24/7 จะแสดงสถานะ **Paused** นอกเวลาทำการ และคำนวณนาที ชั่วโมง วัน จากเวลาทำการในปฏิทิน
- สรุปร่วม: ทั้งสามระบบนับเฉพาะเวลาทำการ เวลาที่เหลือจึงยกไปวันทำการถัดไป · กรณีขอบ (ครบกำหนดตรงเวลาปิดทำการพอดี) ไม่พบเอกสารที่ระบุชัด

**แหล่งที่มา**
- Zendesk · Viewing and understanding SLA targets — https://support.zendesk.com/hc/en-us/articles/4408832852122-Viewing-and-understanding-SLA-targets
- Freshdesk · What are business hours and calendar hours? — https://support.freshdesk.com/support/solutions/articles/37627-what-are-business-hours-and-calendar-hours-
- Atlassian · Understanding why an SLA is paused — https://support.atlassian.com/jira/kb/understanding-why-an-sla-is-paused-in-a-jira-service-management-ticket/
- Atlassian · SLA display formats and time frames — https://confluence.atlassian.com/servicemanagementserver/sla-display-formats-and-time-frames-946617611.html

**สถานะ** การยกยอดและการหยุดนับนอกเวลาทำการ: ยืนยันแล้ว (Zendesk, Freshdesk) · JSM: ยืนยันบางส่วน · กรณีครบกำหนดตรงเวลาปิดทำการ: **ยังไม่ยืนยัน**

**นัยต่อการตัดสินใจ** พฤติกรรมของ MVP (เกินกำหนดทันทีแม้อยู่นอกเวลาทำการ) ต่างจากทั้งสามระบบสำหรับ SLA แบบเวลาทำการ แต่สอดคล้องกับ SLA แบบเวลาปฏิทิน (24/7) ซึ่ง SPEC §4 ใช้กับ P1

---

## Q3 (F-12) · หลักฐานเรื่องการแสดงบทความ self-service/FAQ ก่อนเปิดเรื่อง (deflection)

**ข้อค้นพบ**
- Zendesk: ฟอร์มส่งคำขอแสดงบทความแนะนำเมื่อผู้ใช้พิมพ์หัวเรื่อง และผู้ใช้เปิดอ่านบทความแทนการส่งคำขอได้ (ฟีเจอร์ของผู้ขาย) · ฟีเจอร์ autoreply แนะนำบทความหลังส่งฟอร์มเป็น legacy และจะยุติ 10 ธ.ค. 2026
- JSM: แนะนำบทความขณะพิมพ์ Summary ในฟอร์มคำขอ และนับเป็น "request deflected" เมื่อผู้ใช้เลือกบทความและโหวตว่ามีประโยชน์ **(นิยามตัวชี้วัดของผู้ขาย)**
- Gartner (ส.ค. 2024, สำรวจลูกค้า 5,728 ราย ธ.ค. 2023): มีเพียง **14%** ของปัญหาที่แก้ได้ครบใน self-service · ปัญหาที่ลูกค้าเห็นว่า "ง่ายมาก" แก้ได้ 36% · สาเหตุล้มเหลวที่พบบ่อยที่สุดคือหาเนื้อหาที่ตรงปัญหาไม่พบ (มากกว่า 43%)
- ไม่พบตัวเลขอิสระที่วัดผลของการแสดง FAQ ในแชตบอต LINE โดยเฉพาะ · ตัวเลขอัตรา deflection ในบล็อกของผู้ขายเป็น **คำกล่าวอ้างทางการตลาด** จึงไม่นำมาใช้

**แหล่งที่มา**
- Zendesk · Fine Tuning: Best Practices for Ticket Deflection — https://support.zendesk.com/hc/en-us/articles/4848867878682
- Zendesk · Using autoreplies to recommend articles in web forms (Legacy) — https://support.zendesk.com/hc/en-us/articles/4408820951450
- Atlassian · Set up article suggestions in request forms — https://support.atlassian.com/jira-service-management-cloud/docs/set-up-article-suggestions-in-request-forms/
- Atlassian · Find out how your knowledge base articles are performing — https://support.atlassian.com/jira-service-management-cloud/docs/how-are-my-knowledge-base-articles-performing/
- Gartner press release 19 ส.ค. 2024 — https://www.gartner.com/en/newsroom/press-releases/2024-08-19-gartner-survey-finds-only-14-percent-of-customer-service-issues-are-fully-resolved-in-self-service

**สถานะ** ฟีเจอร์ของ Zendesk และ JSM: ยืนยันบางส่วน (จากผลค้นหาของหน้าทางการ เนื้อหาเต็มโหลดไม่ได้) · ตัวเลข Gartner: ยืนยันบางส่วน (หน้าต้นทางตอบ 403 ตัวเลขตรงกันในสื่อรองหลายแห่ง) · ผลต่อ LINE bot: **ยังไม่ยืนยัน**

**นัยต่อการตัดสินใจ** การแสดงบทความก่อนเปิดเรื่องเป็นรูปแบบมาตรฐานของเครื่องมือหลัก แต่หลักฐานอิสระชี้ว่าผลต่อการลดเคสจำกัด และขึ้นกับความตรงของเนื้อหา ถ้าดึงเข้า MVP ควรวัดผลเอง (เช่น นับจำนวนครั้งที่ผู้ใช้เลือก "แก้ได้แล้ว")

---

## Q4 (F-15) · มีข้อกำหนดที่เป็นทางการเรื่องเป้าหมายอัตราผ่าน SLA (90% / 95%) หรือไม่

**ข้อค้นพบ**
- **ไม่พบ** มาตรฐานหรือแนวปฏิบัติที่เป็นทางการกำหนดตัวเลขอัตราผ่าน SLA สำหรับงานรับเรื่องหรือ service desk
- Zendesk Explore นิยาม "SLA achievement rate" เป็นร้อยละของ ticket ที่ไม่ละเมิดเป้าหมายต่อ ticket ที่มี SLA ทั้งหมด โดยนับเป็นรายครั้ง (instance) ไม่ใช่ราย ticket · ไม่ได้กำหนดค่าเป้าหมาย
- ตัวเลข 90% หรือ 95% ที่พบมาจากบล็อกของผู้ขายและที่ปรึกษา ไม่ใช่มาตรฐาน · ITIL ถือว่าเป้าหมายระดับบริการต้องตกลงกับผู้รับบริการ แต่ตรวจต้นฉบับไม่ได้ (เอกสารเสียเงิน)

**แหล่งที่มา**
- Zendesk · Explore recipe: Reviewing SLA performance — https://support.zendesk.com/hc/en-us/articles/4408835960602-Explore-recipe-Reviewing-SLA-performance
- Zendesk · Analyzing your Support ticket activity and agent performance — https://support.zendesk.com/hc/en-us/articles/4408835846810

**สถานะ** "ไม่มีมาตรฐานตัวเลข": ยืนยันเท่าที่ค้นได้ (ไม่พบในแหล่งหลักที่เข้าถึงได้) · นิยาม achievement rate ของ Zendesk: ยืนยันบางส่วน · หลัก SLM ของ ITIL: **ยังไม่ยืนยัน**

**นัยต่อการตัดสินใจ** ค่า 90% บนแดชบอร์ดเป็นค่าที่ต้องตกลงกันภายใน ไม่มีแหล่งอ้างอิงภายนอกรองรับ และควรระบุวิธีนับ (ราย ticket หรือรายครั้ง) พร้อมกับค่าเป้าหมาย

---

## Q5 (F-06) · PDPA: ฐานทางกฎหมายสำหรับข้อมูลเคส การถอนความยินยอม และระยะเวลาเก็บ

**ข้อค้นพบ**
- แนวทางของคณะกรรมการ PDPC เรื่องการขอความยินยอม ระบุว่าการเก็บ ใช้ หรือเปิดเผยข้อมูลทำได้โดยไม่ต้องขอความยินยอมเมื่อเข้าฐานตาม ม.24 ได้แก่ (3) จำเป็นเพื่อปฏิบัติตามสัญญาหรือตามคำขอของเจ้าของข้อมูลก่อนเข้าทำสัญญา และ (5) ประโยชน์โดยชอบด้วยกฎหมาย · ความยินยอมเป็น **"ฐานทางกฎหมายสุดท้าย"** เมื่อไม่เข้าข้อยกเว้นตาม ม.24 หรือ ม.26
- การถอนความยินยอมต้องทำได้ง่ายเช่นเดียวกับการให้ ห้ามสร้างภาระ ค่าใช้จ่าย หรือขั้นตอนมากกว่า และต้องแสดงวิธีถอนอย่างเด่นชัด ณ จุดที่ขอความยินยอม · ตัวอย่างในแนวทางชี้ว่าการบังคับให้ "โทรมาในเวลาทำการเท่านั้น" ขัดต่อกฎหมาย
- การถอนไม่กระทบการประมวลผลที่ทำไปแล้วโดยชอบ และ **ไม่มีผลต่อการประมวลผลที่อาศัยฐาน ม.24 หรือ ม.26** · ถ้าการถอนมีผลกระทบ ต้องแจ้งผลกระทบให้เจ้าของข้อมูลทราบ
- ระยะเวลาเก็บ: ม.23(3) ต้องแจ้งระยะเวลาเก็บ หรือระยะเวลาที่คาดหมายได้ตามมาตรฐานการเก็บ · ม.37(3) ต้องมีระบบตรวจสอบเพื่อลบหรือทำลายเมื่อพ้นระยะเวลาเก็บ ไม่เกี่ยวข้อง หรือเมื่อถอนความยินยอม · กฎหมายไม่กำหนดจำนวนวันหรือปีไว้
- ข้อควรระวัง: ถ้าเนื้อหาเคสมีข้อมูลอ่อนไหวตาม ม.26 (เช่น สุขภาพ) ต้องใช้เงื่อนไขของ ม.26 ไม่ใช่ ม.24
- ไม่พบแนวทางของ PDPC ที่ตีความฐานสัญญาหรือฐานประโยชน์โดยชอบด้วยกฎหมายสำหรับ "การรับเรื่องร้องเรียน" โดยเฉพาะ

**แหล่งที่มา**
- PDPC · แนวทางการดำเนินการในการขอความยินยอมจากเจ้าของข้อมูลส่วนบุคคล — https://www.pdpc.or.th/wp-content/uploads/2023/12/pdpc-2562-pdpc-Guidelines2.pdf (ข้อ 3 และข้อ 5)
- พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 ราชกิจจานุเบกษา เล่ม 136 ตอน 69 ก — https://ratchakitcha.soc.go.th/documents/17082307.pdf (ม.23, ม.24, ม.37)
- Tilleke & Gibbins (สรุปโดยสำนักกฎหมาย ระบุวันออกแนวทาง 7 ก.ย. 2565) — https://www.tilleke.com/insights/thailand-issues-guidelines-on-pdpa-consent-and-notification-requirements/

**สถานะ** เนื้อหาแนวทางและมาตราที่อ้าง: ยืนยันแล้ว (อ่านจาก PDF ต้นฉบับ) · วันออกแนวทาง: ยืนยันบางส่วน (จากแหล่งรอง) · การตีความฐานที่เหมาะกับข้อมูลเคสของโครงการนี้: **ยังไม่ยืนยัน** (ต้องให้ฝ่ายกฎหมายวินิจฉัย)

**นัยต่อการตัดสินใจ** ถ้าเลือกฐาน ม.24(3) หรือ (5) สำหรับการรับและดำเนินการเคส ภาระเรื่องปุ่มถอนความยินยอมจะเหลือเฉพาะการประมวลผลที่อาศัยความยินยอม แต่ยังต้องแจ้งวัตถุประสงค์และระยะเวลาเก็บ (ม.23) และต้องมีกลไกลบเมื่อพ้นระยะเวลา (ม.37(3)) ไม่ว่าจะเลือกฐานใด

---

## Q6 (F-10) · LINE Messaging API: ข้อความวิดีโอ เสียง ไฟล์

**ข้อค้นพบ**
- Webhook มี message event ชนิด `video` (มี `duration` เป็นมิลลิวินาที, `contentProvider`), `audio` (`duration`, `contentProvider`) และ `file` (`fileName`, `fileSize` เป็นไบต์) · message event รับได้ทั้งแชต 1:1 กลุ่ม และแชตหลายคน
- ดาวน์โหลดทุกชนิดด้วย `GET https://api-data.line.me/v2/bot/message/{messageId}/content` ใช้ได้เฉพาะเมื่อ `contentProvider.type = line` · วิดีโอหรือเสียงขนาดใหญ่อาจยังเตรียมไม่เสร็จ endpoint จะตอบ **`202`** และต้องตรวจสถานะด้วย `GET .../content/transcoding` (`processing` / `succeeded` / `failed`) · เนื้อหา "อาจถูกแปลงภายใน เช่น ย่อขนาด" · มี endpoint `.../content/preview` สำหรับภาพตัวอย่างของรูปหรือวิดีโอ
- ระยะเวลาเก็บ: "ถูกลบอัตโนมัติหลังช่วงเวลาหนึ่ง" ไม่ระบุระยะเวลา (ตรงกับ `01-research.md` ข้อ 8)
- ขนาดไฟล์สูงสุดที่ **ผู้ใช้ส่งเข้ามา**: เอกสาร Messaging API ไม่ระบุ
- ขาออก (เกี่ยวข้องกับ F-11): ส่งวิดีโอ mp4 และเสียง mp3/m4a ได้ไม่เกิน 200 MB ผ่าน HTTPS URL · ชนิดข้อความขาออกไม่มีชนิด `file` (มี text, sticker, image, video, audio, location, imagemap, template, Flex)
- มี unsend event และ LINE แนะนำให้ผู้ให้บริการจัดการข้อความที่ถูกยกเลิกไม่ให้ถูกเห็นหรือใช้อีก

**แหล่งที่มา**
- Messaging API reference (Markdown) · Webhook video/audio/file, Get content, Verify preparation status, Video/Audio message — https://developers.line.biz/en/reference/messaging-api/index.html.md
- Receive messages · Get user-sent content — https://developers.line.biz/en/docs/messaging-api/receiving-messages/
- LINE OpenAPI spec (`webhook.yml`, `messaging-api.yml`) — https://github.com/line/line-openapi

**สถานะ** ชนิด event, endpoint, 202/transcoding, ขีดจำกัดขาออก, ไม่มีชนิด file ขาออก: ยืนยันแล้ว · ระยะเวลาเก็บ: ยืนยันว่า **ไม่เปิดเผย** · ขนาดสูงสุดขาเข้า: **ยังไม่ยืนยัน**

**นัยต่อการตัดสินใจ** การรับวิดีโอ เสียง และไฟล์ทำได้ด้วย endpoint เดียวกับรูปภาพ แต่ต้องรองรับสถานะ 202 และดาวน์โหลดเก็บเองทันทีเพราะ LINE ไม่รับประกันระยะเวลาเก็บ ส่วนการส่งไฟล์เอกสารกลับทาง LINE ต้องใช้ลิงก์ ไม่มีชนิดข้อความรองรับโดยตรง

---

## Q7 (F-14) · ออบเจกต์ `sender`: ความยาวชื่อ กติกา iconUrl และป้ายกำกับอื่นต่อข้อความ

**ข้อค้นพบ**
- `sender.name`: ไม่เกิน **20 ตัวอักษร** · ห้ามใช้บางคำ เช่น `LINE`
- `sender.iconUrl`: URL ไม่เกิน 2,000 ตัวอักษร · HTTPS (TLS 1.2 ขึ้นไป) · **PNG** · อัตราส่วน 1:1 · ไม่เกิน 1 MB · percent-encode แบบ UTF-8
- ใช้ได้กับ reply, push, multicast, narrowcast, broadcast และทุกชนิดข้อความ · LINE เติม `from 'ชื่อบัญชี'` ต่อท้ายชื่อเสมอ · ชื่อห้องแชต รายการแชต รายชื่อเพื่อน และหน้าโปรไฟล์ธุรกิจ **ไม่เปลี่ยน** · preview ในรายการแชตแสดงชื่อที่กำหนดเฉพาะข้อความที่ไม่ใช่ text
- ไม่พบฟิลด์ป้ายกำกับอื่นต่อข้อความใน Message object นอกจาก `sender` · ทางเลือกที่เหลืออยู่ในเนื้อหาข้อความเอง (ข้อความนำหน้า หรือ header ของ Flex Message ซึ่งเป็นรูปแบบที่ `01-research.md` ยืนยันแล้ว)

**แหล่งที่มา**
- Messaging API reference · Customize icon and display name — https://developers.line.biz/en/reference/messaging-api/index.html.md (หัวข้อ "Customize icon and display name")
- Customize icon and display name (docs) — https://developers.line.biz/en/docs/messaging-api/icon-nickname-switch/
- LINE OpenAPI `messaging-api.yml` schema `Sender` (`maxLength: 20`) — https://github.com/line/line-openapi

**สถานะ** ยืนยันแล้วทุกข้อ · "ไม่มีป้ายกำกับอื่น": ยืนยันจากการตรวจ schema ของ Message object

**นัยต่อการตัดสินใจ** ชื่อทีมหรือเลขเคสใส่ใน `sender.name` ได้เฉพาะเมื่อรวมกับชื่อเจ้าหน้าที่แล้วไม่เกิน 20 ตัวอักษร ทางเลือกอื่นคือใช้ไอคอนระบุทีม (PNG 1:1) หรือแสดงข้อมูลในเนื้อหาข้อความหรือ Flex header

---

## Q8 (F-03) · ระบบ helpdesk ที่เชื่อม LINE ผูกข้อความขาเข้ากับ ticket ที่เปิดอยู่อย่างไร

**ข้อค้นพบ**
- Zendesk (social messaging ครอบคลุม LINE): ข้อความใหม่ของลูกค้า **ต่อเข้า ticket เดิม** ตลอดที่ ticket ยังไม่ปิด · ticket ที่ Solved จะถูก Closed ด้วย automation ค่าเริ่มต้น 4 วัน (ปรับได้ถึง 28 วัน) ในช่วงนี้ลูกค้ากลับมาคุยต่อได้และข้อมูลใหม่ผูกกับ ticket เดิม · หลัง Closed ข้อความใหม่จะ **สร้าง ticket ใหม่**
- Zendesk ผูกหนึ่งบทสนทนาต่อหนึ่ง ticket ที่ active จึงไม่มีการเลือกระหว่างหลาย ticket ที่เปิดอยู่พร้อมกัน (อนุมานจากเอกสาร ไม่พบประโยคที่ระบุตรง)
- Oho Chat: ทำงานแบบรอบแชต เจ้าหน้าที่กด "รับแชท" แล้วกด "จบแชท" เพื่อกรอกรายละเอียดเคส · เคสเป็นบันทึกสรุปของรอบแชต ไม่ได้ผูกข้อความเข้าเคสที่เปิดอยู่อัตโนมัติ · เอกสารไม่ระบุกรณีลูกค้ามีหลายเคสเปิดพร้อมกัน
- ไม่พบเอกสารทางการของระบบอื่นที่ระบุวิธีเลือก ticket เมื่อผู้ใช้มีหลายเรื่องเปิดอยู่พร้อมกัน

**แหล่งที่มา**
- Zendesk · Conversational styles in messaging — https://support.zendesk.com/hc/en-us/articles/6088892450586-Conversational-styles-in-messaging
- Zendesk · Adding LINE social messaging channels — https://support.zendesk.com/hc/en-us/articles/4408844138394
- Oho Chat · แนะนำฟีเจอร์เคส — https://help.oho.chat/user-manual/case

**สถานะ** พฤติกรรม Solved/Closed ของ Zendesk: ยืนยันแล้ว · "หนึ่งบทสนทนาต่อหนึ่ง ticket ที่ active": ยืนยันบางส่วน (อนุมาน) · Oho Chat: ยืนยันแล้วเท่าที่เอกสารระบุ · กรณีหลายเรื่องเปิดพร้อมกัน: **ยังไม่ยืนยัน**

**นัยต่อการตัดสินใจ** ต้นแบบของผู้ขายหลักคือผูกข้อความเข้าเรื่องที่ยัง active เพียงเรื่องเดียว และเปิดเรื่องใหม่หลังปิด ส่วนระบบที่ให้ผู้แจ้งเลือกเคสเมื่อมีหลายเคสเปิดอยู่ยังไม่มีต้นแบบภายนอกรองรับ ต้องออกแบบเอง

---

## สรุปรายการที่ยังไม่ยืนยัน

| # | ประเด็น | เหตุผล |
| --- | --- | --- |
| Q1 | นิยาม priority / major incident ตาม ITIL 4 | เอกสาร AXELOS เป็นแบบเสียเงิน |
| Q2 | เป้าหมายที่ครบกำหนดตรงเวลาปิดทำการพอดี | ไม่มีเอกสารผู้ขายระบุกรณีขอบ |
| Q3 | ผลของ FAQ ก่อนเปิดเคสใน LINE bot | ไม่พบข้อมูลอิสระ |
| Q4 | หลัก SLM ของ ITIL เรื่องการตกลงเป้าหมาย | เอกสารเสียเงิน |
| Q5 | ฐานที่เหมาะกับข้อมูลเคสของโครงการ | ต้องให้ฝ่ายกฎหมายวินิจฉัย |
| Q6 | ขนาดไฟล์สูงสุดที่ผู้ใช้ส่งเข้ามา · ระยะเวลาเก็บเนื้อหาของ LINE | LINE ไม่เปิดเผย |
| Q8 | การเลือก ticket เมื่อมีหลายเรื่องเปิดพร้อมกัน | ไม่พบเอกสารทางการ |

## Q9 · Rich menu (เพิ่ม 30 ก.ย. 2569 สำหรับ G5 · #21)

| ข้อความ | แหล่ง | สถานะ |
| --- | --- | --- |
| รูปภาพ JPEG หรือ PNG กว้าง 800–2500 px สูงอย่างน้อย 250 px อัตราส่วนกว้าง/สูงอย่างน้อย 1.45 ขนาดไม่เกิน 1 MB · เปลี่ยนรูปของ rich menu เดิมไม่ได้ ต้องสร้างใหม่ | [Upload rich menu image](https://developers.line.biz/en/reference/messaging-api/nojs/#upload-rich-menu-image) | ยืนยันแล้ว |
| `chatBarText` ไม่เกิน 14 ตัวอักษร · `areas` ไม่เกิน 20 · `name` ไม่เกิน 300 ตัวอักษร | [Rich menu object](https://developers.line.biz/en/reference/messaging-api/nojs/#rich-menu-object) | ยืนยันแล้ว |
| สร้าง `POST https://api.line.me/v2/bot/richmenu` · ตรวจ `POST /v2/bot/richmenu/validate` · อัปโหลดรูป `POST https://api-data.line.me/v2/bot/richmenu/{id}/content` · ตั้งเป็นค่าเริ่มต้น `POST /v2/bot/user/all/richmenu/{id}` · สร้างได้สูงสุด 1000 เมนูต่อบัญชี | [Rich menu endpoints](https://developers.line.biz/en/reference/messaging-api/nojs/#create-rich-menu) | ยืนยันแล้ว |

นัยต่อการตัดสินใจ: ใช้รูป 2500×1686 px (อัตราส่วน 1.48) แบ่ง 2×2 ตาม prototype LineTrack.png ทุกครั้งที่เปลี่ยนเมนูต้องสร้าง rich menu ใหม่แล้วตั้งเป็นค่าเริ่มต้น

## Q10 · Multicast สำหรับประกาศเหตุขัดข้อง (เพิ่ม 30 ก.ย. 2569 สำหรับ G6 · #21)

| ข้อความ | แหล่ง | สถานะ |
| --- | --- | --- |
| `POST https://api.line.me/v2/bot/message/multicast` ส่งได้ครั้งละไม่เกิน 500 userId และ 5 ข้อความ · rate limit 200 requests/วินาที · ใส่ `X-Line-Retry-Key` (UUID) เพื่อส่งซ้ำอย่างปลอดภัยได้ · ผู้ที่บล็อก OA จะไม่ได้รับแต่ API ยังตอบ 200 | [Send multicast message](https://developers.line.biz/en/reference/messaging-api/nojs/#send-multicast-message) | ยืนยันแล้ว |
| Multicast นับรวมในโควตาข้อความของแพ็กเกจตามจำนวนผู้รับ | `01-research.md` ข้อ 3 (pricing) | ยืนยันแล้ว |

นัยต่อการตัดสินใจ: หน้าประกาศต้องแสดงจำนวนผู้รับและโควตาที่จะใช้ก่อนส่ง และแบ่งส่งทีละ 500 คน
